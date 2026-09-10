import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";

async function main() {
  const base = process.env.APP_URL || "http://localhost:3000";
  assert.equal(new URL(base).hostname, "localhost", "HTTP smoke is limited to local development");
  const cookies = new Map<string, string>();
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { cookie: [...cookies].map(([key,value])=>`${key}=${value}`).join("; "), ...init.headers } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";",1)[0];
      const split = pair.indexOf("="); cookies.set(pair.slice(0,split),pair.slice(split+1));
    }
    return response;
  };
  let count = 0;
  const check = (condition: unknown, message: string) => { assert.ok(condition, message); count++; console.log(`PASS ${message}`); };
  check((await request("/api/workspace")).status === 401, "Workspace API rejects unauthenticated requests");
  const csrf = await (await request("/api/auth/csrf")).json();
  const credentials = new URLSearchParams({ csrfToken: csrf.csrfToken, email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD!, callbackUrl: base });
  await request("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: credentials.toString() });
  const workspaceResponse = await request("/api/workspace");
  check(workspaceResponse.status === 200, "Credentials sign-in produces an authenticated workspace session");
  const workspace = await workspaceResponse.json();
  check(workspace.settings.dryRun === true, "HTTP safety tests run exclusively in DRY_RUN");
  const post = (body: unknown, origin = base) => request("/api/actions", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
  check((await post({action:"followups"},"https://untrusted.example")).status === 403, "Cross-origin mutation is rejected");
  check((await post({action:"not-a-real-action"})).status === 400, "Unknown actions fail validation");
  for (const path of ["/", "/leads", "/companies", "/opportunities", "/inbox", "/campaigns", "/review", "/pipeline", "/analytics", "/settings", "/activity"]) {
    check((await request(path)).status === 200, `Authenticated page ${path} renders`);
  }
  const marker = randomUUID();
  const company = await db.company.create({data:{name:"HTTP QA fixture",domain:`qa-${marker}.example`,website:`https://qa-${marker}.example`,source:"QA_FIXTURE",isDemo:true}});
  try {
    const lead = await db.lead.create({data:{companyId:company.id,dedupeKey:`qa:${marker}`,source:"QA_FIXTURE"}});
    const message = await db.message.create({data:{leadId:lead.id,direction:"OUTBOUND",type:"INITIAL",status:"DEFERRED",subject:"Test",body:"Draft",idempotencyKey:`qa:${marker}`}});
    const edited = await post({action:"update-message",id:message.id,subject:"Updated draft",body:"Updated body"});
    check(edited.status === 200, "A cap-deferred unsent draft can be edited from the inbox");
    check((await db.message.findUniqueOrThrow({where:{id:message.id}})).body === "Updated body", "Draft edit is persisted");
    await db.message.update({where:{id:message.id},data:{status:"SIMULATED"}});
    check((await post({action:"update-message",id:message.id,subject:"Tamper",body:"Cannot edit sent history"})).status === 400, "Sent history cannot be edited");
  } finally { await db.company.delete({where:{id:company.id}}); }
  console.log(`HTTP smoke complete: ${count} checks passed.`);
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "HTTP smoke failed");process.exitCode=1;}).finally(()=>db.$disconnect());
