import "dotenv/config";
import { Client } from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Start npm run dev first, or provide DATABASE_URL for the integration database.");
  const originalUrl = process.env.DATABASE_URL;
  const schema = `integration_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(originalUrl); url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.DRY_RUN = "true";
  for (const key of ["OPENAI_API_KEY", "RESEND_API_KEY", "TAVILY_API_KEY", "HUNTER_API_KEY"]) process.env[key] = "";
  const admin = new Client({ connectionString: originalUrl }); await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  const { readdir } = await import("node:fs/promises");
  const versions = (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const version of versions) await admin.query(await readFile(`prisma/migrations/${version}/migration.sql`, "utf8"));
  const { db } = await import("../src/lib/db");
  const engine = await import("../src/lib/services/engine");
  const { saveSettings } = await import("../src/lib/settings");
  let checks = 0;
  const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); };
  try {
    await db.offerTemplate.createMany({ data: [
      { name: "Workflow Rescue", slug: "workflow-rescue", description: "Remove manual workflows", minPrice: 600, maxPrice: 1200, typicalDeliveryDays: "2–5 days" },
      { name: "Internal Tool Sprint", slug: "internal-tool-sprint", description: "Build an internal dashboard", minPrice: 1500, maxPrice: 3000, typicalDeliveryDays: "5–10 days" },
      { name: "Ops & Data Cleanup", slug: "ops-data-cleanup", description: "Clean data and CRM", minPrice: 800, maxPrice: 1800, typicalDeliveryDays: "3–7 days" },
    ] });
    const campaign = await db.campaign.create({ data: { name: "Integration", status: "ACTIVE", target: "operations", country: "US", dailyLimit: 20, autopilotEnabled: true, minLeadScore: 0 } });
    await saveSettings({ autopilotEnabled: true, minLeadScore: 0, dailyEmailCap: 20, dailyNewContactCap: 20 });
    const csv = 'company,website,contact,email,job_title,opportunity,source_url\nTest Commerce,https://commerce.example,Sarah Test,sarah@commerce.example,Founder,Manual Shopify reporting workflow,https://commerce.example/brief';
    await engine.importCsv(csv); await engine.importCsv(csv);
    check(await db.company.count() === 1 && await db.contact.count() === 1 && await db.lead.count() === 1, "CSV import deduplicates company, email and lead");
    const lead = await db.lead.findFirstOrThrow();
    await db.company.update({where:{id:lead.companyId},data:{country:'US',employeeEstimate:20}});
    await engine.processLead(lead.id, campaign.id);
    const scored = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    check(scored.totalScore === scored.fitScore + scored.valueScore + scored.deliverabilityScore + scored.clientQualityScore + scored.recurringPotentialScore, "Persisted scoring is bounded and components sum correctly");
    const draft = await engine.generateOutreach(lead.id, campaign.id);
    check(Boolean(draft.body) && await db.generatedOffer.count() === 1, "Adaptive offer and personalized draft persist");
    const races = await Promise.all([engine.sendMessage(draft.id, true), engine.sendMessage(draft.id, true), engine.sendMessage(draft.id, true)]);
    check(races.filter(result => result.sent).length === 1 && await db.message.count({ where: { status: "SIMULATED" } }) === 1, "Concurrent send requests dispatch exactly once");
    const sent = await db.message.findUniqueOrThrow({ where: { id: draft.id } });
    const afterInitial = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    check(afterInitial.nextFollowupAt?.getTime() === sent.sentAt!.getTime() + 3*86400000, "Initial email schedules follow-up at day 3");
    await db.message.update({ where: { id: draft.id }, data: { sentAt: new Date(Date.now() - 8*86400000) } });
    await db.lead.update({ where: { id: lead.id }, data: { nextFollowupAt: new Date(Date.now() - 1000) } });
    await engine.runFollowups(); await engine.runFollowups(); await engine.runFollowups();
    check(await db.message.count({ where: { leadId: lead.id, type: "FOLLOWUP", status: "SIMULATED" } }) === 2, "Day 3 and day 7 follow-ups run only once each, then stop");
    const unsubscribe = await engine.processReply({ leadId: lead.id, body: "Unsubscribe. Stop emailing me.", externalId: "simulation:unsubscribe" });
    check(unsubscribe.aiClassification === "UNSUBSCRIBE" && await db.suppression.count() === 1, "Unsubscribe classifies and blacklists immediately");
    await engine.processReply({ leadId: lead.id, body: "Unsubscribe. Stop emailing me.", externalId: "simulation:unsubscribe" });
    check(await db.message.count({ where: { direction: "INBOUND" } }) === 1, "Duplicate webhook reply is idempotent");
    await engine.processLead(lead.id);
    check((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status === "BLACKLISTED", "Re-enrichment cannot reopen a blacklisted lead");
    await engine.scoreLead(lead.id);
    check((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status === "BLACKLISTED" && (await db.pipelineDeal.findUniqueOrThrow({ where: { leadId: lead.id } })).stage === "LOST", "Direct scoring jobs preserve blacklist and closed pipeline");
    const blocked = await db.message.create({ data: { leadId: lead.id, direction: "OUTBOUND", type: "REPLY", subject: "Blocked", body: "Hello", status: "DRAFT", idempotencyKey: randomUUID() } });
    check(!(await engine.sendMessage(blocked.id, true)).sent, "Manual approval cannot bypass blacklist");
    await engine.importCsv('company,website,contact,email,job_title,opportunity\nMeeting Ops,https://meeting.example,Alex Test,alex@meeting.example,COO,Internal dashboard');
    const meetingLead = await db.lead.findFirstOrThrow({ where: { company: { domain: "meeting.example" } } });
    await engine.processLead(meetingLead.id, campaign.id);
    const meetingDraft = await engine.generateOutreach(meetingLead.id, campaign.id);
    await engine.sendMessage(meetingDraft.id, true);
    const oldReply = await db.message.create({ data: { leadId: meetingLead.id, direction: "OUTBOUND", type: "REPLY", subject: "Older draft", body: "An earlier draft", idempotencyKey: randomUUID() } });
    await engine.processReply({ leadId: meetingLead.id, body: "Can we schedule a meeting tomorrow?", externalId: "simulation:meeting" });
    check((await db.message.findUniqueOrThrow({ where: { id: oldReply.id } })).status === "CANCELLED", "New inbound cancels stale automatic reply drafts");
    check((await db.pipelineDeal.findUniqueOrThrow({ where: { leadId: meetingLead.id } })).stage === "MEETING", "Meeting reply updates pipeline");
    check(await db.reviewItem.count({ where: { leadId: meetingLead.id, type: "HANDOFF", status: "PENDING" } }) > 0, "Meeting request creates human handoff");
    check((await db.lead.findUniqueOrThrow({ where: { id: meetingLead.id } })).sequenceStopped, "Any reply stops the sequence");
    await saveSettings({ dailyNewContactCap: 1 });
    await engine.importCsv('company,website,contact,email\nCap Test,https://cap.example,Cap Person,cap@cap.example');
    const capLead = await db.lead.findFirstOrThrow({ where: { company: { domain: "cap.example" } } });
    const capDraft = await engine.generateOutreach(capLead.id, campaign.id);
    await db.message.update({ where: { id: capDraft.id }, data: { body: "We guarantee completion by Friday, with a signed contract." } });
    await engine.sendMessage(capDraft.id);
    check(await db.reviewItem.count({ where: { leadId: capLead.id, type: "HANDOFF", status: "PENDING" } }) > 0, "Risky outgoing commitments create HANDOFF instead of automatic send");
    check(!(await engine.sendMessage(capDraft.id, true)).sent, "Daily contact cap applies to human-approved sends");
    const { Webhook } = await import("svix");
    const { POST } = await import("../src/app/api/webhooks/resend/route");
    const secret = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const eventId = `evt_${randomUUID()}`;
    const payload = JSON.stringify({ type: "email.complained", data: { email_id: "integration-provider", to: ["alex@meeting.example"] } });
    const stamp = new Date();
    const signature = new Webhook(secret).sign(eventId, stamp, payload);
    const makeRequest = (sig: string) => new Request("http://localhost:3000/api/webhooks/resend", { method: "POST", headers: { "svix-id": eventId, "svix-timestamp": String(Math.floor(stamp.getTime()/1000)), "svix-signature": sig }, body: payload });
    check((await POST(makeRequest("v1,invalid"))).status === 401, "Unsigned/forged provider webhook is rejected");
    check((await POST(makeRequest(signature))).status === 200 && Boolean(await db.suppression.findUnique({ where: { email: "alex@meeting.example" } })), "Signed complaint webhook immediately suppresses recipient");
    const replay = await POST(makeRequest(signature));
    check((await replay.json()).duplicate === true, "Signed webhook replay is idempotent");
    const budget = await import("../src/lib/providers/budget");
    process.env.HUNTER_SEARCH_MONTHLY_LIMIT = "2";
    await budget.consumeBudget("hunter.search");
    await budget.consumeBudget("hunter.search");
    let capError: unknown = null;
    try { await budget.consumeBudget("hunter.search"); } catch (error) { capError = error; }
    check(budget.isBudgetError(capError), "Free-plan provider budget refuses the call once the monthly cap is reached");
    const snapshot = await budget.budgetSnapshot();
    check(snapshot.find(entry => entry.key === "hunter.search")?.remaining === 0 && snapshot.every(entry => entry.limit > 0), "Budget snapshot reports remaining quota and never reports a zero cap by default");
    check(await db.activityLog.count() > 15, "Acquisition, AI, sending and replies leave an audit trail");
    const unnamedCsv = 'company,website,email\nUnnamed Team,https://unnamed.example,one@unnamed.example\nUnnamed Team,https://unnamed.example,two@unnamed.example';
    await engine.importCsv(unnamedCsv);
    check(await db.contact.count({where:{company:{domain:'unnamed.example'}}}) === 2, "Different email addresses without a contact name must not be merged");
    const targetLead = await db.lead.findFirstOrThrow({where:{company:{domain:'unnamed.example'}}});
    await db.company.update({where:{id:targetLead.companyId},data:{country:'Allemagne',employeeEstimate:1500}});
    await db.lead.update({where:{id:targetLead.id},data:{totalScore:90}});
    await saveSettings({dailyNewContactCap:20});
    const targetDraft = await engine.generateOutreach(targetLead.id,campaign.id);
    check(!(await engine.sendMessage(targetDraft.id)).sent, "Autopilot cannot send outside campaign country/employee targeting");
    const pricedDeal = await db.pipelineDeal.findUniqueOrThrow({where:{leadId:targetLead.id}});
    check(pricedDeal.estimatedValue > 0, "Generating an adaptive offer populates an unpriced pipeline deal");
    console.log(`Integration complete: ${checks} checks passed against a clean PostgreSQL schema using the actual migration.`);
  } finally {
    await db.$disconnect();
    // schema is a fixed prefix plus random hex created by this process, never user input.
    await admin.query("SET search_path TO public");
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
