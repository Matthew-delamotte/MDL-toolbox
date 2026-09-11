import { z } from "zod";
import { db } from "@/lib/db";
import type { Settings } from "@/lib/contracts";

export const settingsSchema = z.object({
  autopilotEnabled: z.boolean(), minLeadScore: z.number().int().min(0).max(100),
  dailyEmailCap: z.number().int().min(1).max(500), dailyNewContactCap: z.number().int().min(1).max(200),
  autoReplyConfidence: z.number().min(0.85).max(1), companyName: z.string().min(1).max(120),
  senderName: z.string().min(1).max(80), signature: z.string().max(1000),
  calendarUrl: z.union([z.literal(""), z.url().refine(v => /^https?:\/\//.test(v), "Utilisez une URL en HTTP(S)")]),
  fromEmail: z.string().max(200), replyTo: z.union([z.literal(""), z.email()]), aiModel: z.string().min(1).max(100),
});
export function isDryRun() { return process.env.DRY_RUN !== "false"; }
export function defaultSettings(): Settings {
  return { dryRun: isDryRun(), autopilotEnabled: false, minLeadScore: 75, dailyEmailCap: 40, dailyNewContactCap: 20,
    autoReplyConfidence: 0.86, companyName: "MDL Advisory", senderName: "Matthew de Lamotte",
    signature: "Matthew de Lamotte\nMDL Advisory — outils internes et automatisations sur mesure\nmatthew.delamotte@mdl-advisory.com\nmdl-advisory.com",
    calendarUrl: "", fromEmail: process.env.RESEND_FROM_EMAIL || "", replyTo: process.env.RESEND_REPLY_TO || "", aiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini" };
}
export async function getSettings(): Promise<Settings> {
  const stored = await db.systemSetting.findUnique({ where: { key: "business" } });
  const parsed = settingsSchema.partial().safeParse(stored?.value ?? {});
  return { ...defaultSettings(), ...(parsed.success ? parsed.data : {}), dryRun: isDryRun() };
}
export async function saveSettings(input: unknown) {
  const values = settingsSchema.partial().parse(input);
  const merged = settingsSchema.parse({ ...await getSettings(), ...values });
  await db.systemSetting.upsert({ where: { key: "business" }, create: { key: "business", value: merged }, update: { value: merged } });
  await db.activityLog.create({ data: { action: "settings.updated", message: "Réglages métier et automatisation mis à jour", metadata: { changed: Object.keys(values) } } });
  return merged;
}
