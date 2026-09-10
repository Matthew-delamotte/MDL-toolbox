import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { isReservedEmail } from "../src/lib/domain";

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.SEED_DEMO !== "false") throw new Error("Set SEED_DEMO=false before removing demo data, so the seed cannot recreate it.");
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401901)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401902)`;
    const demos = await tx.company.findMany({where:{isDemo:true},orderBy:{id:'asc'},include:{contacts:true,leads:{include:{offers:true,messages:true,conversation:true,reviews:true,deal:true}}}});
    const companyIds = demos.map(c=>c.id);
    const leadIds = demos.flatMap(c=>c.leads.map(l=>l.id));
    const contactIds = demos.flatMap(c=>c.contacts.map(p=>p.id));
    const emails = demos.flatMap(c=>c.contacts.flatMap(p=>p.email ? [p.email] : []));
    assert.ok(emails.every(isReservedEmail),'Refusing to delete demo-labelled companies containing real email addresses');
    assert.ok(demos.every(c=>isReservedEmail(`test@${c.domain}`)),'Refusing to delete demo-labelled companies using real domains');
    assert.ok(demos.every(c=>c.leads.every(l=>l.messages.every(m=>m.dryRun))),'Refusing to delete demo-labelled records with live message history');
    const opportunities = await tx.opportunity.findMany({where:{companyId:{in:companyIds}}});
    assert.equal(await tx.lead.count({where:{companyId:{notIn:companyIds},OR:[{contactId:{in:contactIds}},{opportunityId:{in:opportunities.map(o=>o.id)}}]}}),0,'Cross-linked real leads require manual review');
    const campaigns = await tx.campaign.findMany({where:{id:{startsWith:'seed-'},leads:{every:{companyId:{in:companyIds}}},messages:{every:{leadId:{in:leadIds}}}},include:{sequences:true}});
    const entities = [...companyIds,...contactIds,...leadIds,...opportunities.map(o=>o.id),...demos.flatMap(c=>c.leads.flatMap(l=>l.messages.map(m=>m.id))),...campaigns.map(c=>c.id)];
    const activities = await tx.activityLog.findMany({where:{OR:[{entityId:{in:entities}},{id:{startsWith:'seed:activity:'}}]}});
    const suppressions = await tx.suppression.findMany({where:{email:{in:emails}}});
    const realSnapshot = async () => JSON.stringify(await tx.company.findMany({where:{isDemo:false},orderBy:{id:'asc'},include:{contacts:{orderBy:{id:'asc'}},leads:{orderBy:{id:'asc'},include:{offers:{orderBy:{id:'asc'}},messages:{orderBy:{id:'asc'}},reviews:{orderBy:{id:'asc'}},deal:true,conversation:true}}}}));
    const realBefore = await realSnapshot();
    const summary = {demoCompanies:companyIds.length,demoContacts:contactIds.length,demoLeads:leadIds.length,demoOpportunities:opportunities.length,demoCampaigns:campaigns.length,demoActivities:activities.length,realRecordsDigest:createHash('sha256').update(realBefore).digest('hex')};
    if (!apply || !companyIds.length) return {apply,summary};
    const backup = `.local/backups/demo-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    await mkdir('.local/backups',{recursive:true});
    await writeFile(backup,JSON.stringify({version:1,createdAt:new Date(),summary,companies:demos,opportunities,campaigns,activities,suppressions},null,2),{mode:0o600,flag:'wx'});
    await tx.activityLog.deleteMany({where:{id:{in:activities.map(a=>a.id)}}});
    await tx.suppression.deleteMany({where:{id:{in:suppressions.map(s=>s.id)}}});
    await tx.company.deleteMany({where:{id:{in:companyIds},isDemo:true}});
    await tx.opportunity.deleteMany({where:{id:{in:opportunities.map(o=>o.id)}}});
    await tx.campaign.deleteMany({where:{id:{in:campaigns.map(c=>c.id)}}});
    assert.equal(await realSnapshot(),realBefore,'Real records changed: rolling back demo cleanup');
    await tx.activityLog.create({data:{action:'DEMO_DATA_REMOVED',message:`${companyIds.length} entreprises de démonstration supprimées ; données réelles préservées.`,metadata:{...summary,backup}}});
    return {apply,summary,backup,realRecordsUnchanged:true};
  },{timeout:30000});
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error instanceof Error ? error.message : 'Cleanup failed');process.exitCode=1;}).finally(()=>db.$disconnect());
