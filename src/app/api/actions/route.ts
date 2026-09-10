import { z } from "zod";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { settingsSchema, saveSettings, isDryRun } from "@/lib/settings";
import * as engine from "@/lib/services/engine";

export const maxDuration = 300;
const id = z.string().min(1).max(200);
const stages = z.enum(["DISCOVERED", "QUALIFIED", "CONTACTED", "REPLIED", "INTERESTED", "MEETING", "PROPOSAL", "WON", "LOST"]);
const campaignFields = { name: z.string().min(2).max(120), target: z.string().min(2).max(300), country: z.string().min(2).max(60), dailyLimit: z.number().int().min(1).max(200), minLeadScore: z.number().int().min(0).max(100), autopilotEnabled: z.boolean(), employeesMin: z.number().int().min(1).max(100000), employeesMax: z.number().int().min(1).max(100000) };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("discover"), query: z.string().min(3).max(500), campaignId: id.optional() }),
  z.object({ action: z.literal("process-lead"), leadId: id, campaignId: id.optional() }),
  z.object({ action: z.literal("generate-outreach"), leadId: id, campaignId: id.optional() }),
  z.object({ action: z.literal("send-message"), messageId: id }),
  z.object({ action: z.literal("simulate-reply"), leadId: id, body: z.string().min(1).max(12000), subject: z.string().max(200).optional() }),
  z.object({ action: z.literal("compose-reply"), leadId: id, body: z.string().min(1).max(12000) }),
  z.object({ action: z.literal("followups") }),
  z.object({ action: z.literal("import-csv"), csv: z.string().min(1).max(500000) }),
  z.object({ action: z.literal("review"), id, decision: z.enum(["approve", "reject", "handoff", "blacklist", "edit"]), body: z.string().min(1).max(12000).optional() }),
  z.object({ action: z.literal("blacklist"), leadId: id, reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("create-campaign"), ...campaignFields }),
  z.object({ action: z.literal("update-campaign"), id, status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(), autopilotEnabled: z.boolean().optional(), dailyLimit: campaignFields.dailyLimit.optional(), name: campaignFields.name.optional(), target: campaignFields.target.optional(), country: campaignFields.country.optional(), minLeadScore: campaignFields.minLeadScore.optional(), employeesMin: campaignFields.employeesMin.optional(), employeesMax: campaignFields.employeesMax.optional() }),
  z.object({ action: z.literal("move-deal"), id, stage: stages, estimatedValue: z.number().min(0).max(10000000).optional(), nextAction: z.string().max(1000).optional() }),
  z.object({ action: z.literal("save-settings"), settings: settingsSchema.partial() }),
  z.object({ action: z.literal("update-message"), id, subject: z.string().min(1).max(200), body: z.string().min(1).max(12000) }),
  z.object({ action: z.literal("update-source"), id, enabled: z.boolean() }),
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Veuillez vous connecter." }, { status: 401 });
  const origin = request.headers.get("origin");
  const allowedOrigin = new URL(process.env.APP_URL || process.env.NEXTAUTH_URL || request.url).origin;
  if (!origin || (origin !== allowedOrigin && origin !== new URL(request.url).origin)) return Response.json({ error: "Action refusée : origine non autorisée." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Un corps JSON est requis." }, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 600000) return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });
    const input = actionSchema.parse(JSON.parse(raw));
    let result: unknown;
    switch (input.action) {
      case "discover": result = await engine.discover(input); break;
      case "process-lead": result = await engine.processLead(input.leadId, input.campaignId); break;
      case "generate-outreach": result = await engine.generateOutreach(input.leadId, input.campaignId); break;
      case "send-message": {
        const sent = await engine.sendMessage(input.messageId, true);
        if (!sent.sent) throw new Error(sent.reason || "L’envoi a été bloqué par une règle de sécurité.");
        result = sent; break;
      }
      case "simulate-reply":
        if (!isDryRun()) return Response.json({ error: "La simulation de réponse n’est disponible qu’en mode simulation." }, { status: 400 });
        result = await engine.processReply(input); break;
      case "compose-reply": {
        const lead = await db.lead.findUniqueOrThrow({ where: { id: input.leadId }, include: { contact: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
        const key = `human:${lead.id}:${createHash("sha256").update(input.body).digest("hex")}`;
        const subject = lead.messages[0]?.subject || "Vos opérations";
        result = await db.message.upsert({ where: { idempotencyKey: key }, update: {}, create: { leadId: lead.id, campaignId: lead.campaignId, direction: "OUTBOUND", type: "REPLY", subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, body: input.body, idempotencyKey: key, recipientEmail: lead.contact?.email, dryRun: isDryRun(), aiClassification: "HUMAN" } });
        break;
      }
      case "followups": result = await engine.runFollowups(); break;
      case "import-csv": result = await engine.importCsv(input.csv); break;
      case "review": result = await engine.resolveReview(input); break;
      case "blacklist": result = await engine.blacklistLead(input.leadId, input.reason || "MANUAL"); break;
      case "create-campaign": {
        const { action: _action, ...data } = input;
        void _action;
        if (data.employeesMin > data.employeesMax) throw new Error("L’effectif minimum ne peut pas dépasser le maximum.");
        result = await db.campaign.create({ data: { ...data, status: "DRAFT", sequences: { create: [{ stepNumber: 0, delayHours: 0, instruction: "Introduction précise, appuyée sur des faits" }, { stepNumber: 1, delayHours: 72, instruction: "Relance courte avec une observation utile" }, { stepNumber: 2, delayHours: 168, instruction: "Dernière relance courtoise, puis arrêt" }] } } });
        break;
      }
      case "update-campaign": {
        const { action: _action, id: campaignId, ...data } = input;
        void _action;
        // Employee bounds can be edited one at a time: validate the merged record, not the patch.
        const current = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
        const merged = { ...current, ...data };
        if (merged.employeesMin > merged.employeesMax) throw new Error("L’effectif minimum ne peut pas dépasser le maximum.");
        result = await db.campaign.update({ where: { id: campaignId }, data }); break;
      }
      case "move-deal": {
        const probabilities: Record<string, number> = { DISCOVERED: 5, QUALIFIED: 15, CONTACTED: 20, REPLIED: 30, INTERESTED: 40, MEETING: 50, PROPOSAL: 70, WON: 100, LOST: 0 };
        result = await db.$transaction(async tx => {
          const deal = await tx.pipelineDeal.update({ where: { id: input.id }, data: { stage: input.stage, probability: probabilities[input.stage], estimatedValue: input.estimatedValue, nextAction: input.nextAction } });
          if (["WON", "LOST"].includes(input.stage)) await tx.lead.update({ where: { id: deal.leadId }, data: { status: input.stage, sequenceStopped: true, nextFollowupAt: null } });
          return deal;
        }); break;
      }
      case "save-settings": result = await saveSettings(input.settings); break;
      case "update-message": {
        const updated = await db.message.updateMany({ where: { id: input.id, status: { in: ["DRAFT", "APPROVED", "DEFERRED"] }, direction: "OUTBOUND" }, data: { subject: input.subject, body: input.body } });
        if (!updated.count) throw new Error("Seuls les brouillons non envoyés peuvent être modifiés.");
        result = updated; break;
      }
      case "update-source": result = await db.sourceConfig.update({ where: { id: input.id }, data: { enabled: input.enabled } }); break;
    }
    await db.activityLog.create({ data: { action: `user.${input.action}`, entityType: "User", message: `${session.user.name || "Matthew"}: ${input.action}`, metadata: { dryRun: isDryRun() } } });
    return Response.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: "Requête JSON invalide." }, { status: 400 });
    const message = error instanceof Error ? error.message : "L’action a échoué.";
    // Prisma/provider internals may include connection details; never return them to the client.
    const safe = /prisma|postgres|api.key|authorization|secret/i.test(message) ? "L’opération a échoué. Vérifiez la configuration des fournisseurs et le journal d’activité." : message.slice(0, 500);
    console.error(JSON.stringify({ action: "api.error", error: error instanceof Error ? error.name : "Unknown" }));
    return Response.json({ error: safe }, { status: 400 });
  }
}
