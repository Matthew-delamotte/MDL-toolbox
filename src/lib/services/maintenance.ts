import { db } from '@/lib/db';
import { generateOutreach } from './composition';
import { sendMessage } from './sending';
import { blacklistLead } from './replies';
import { audit, errorText, json } from './shared';

export async function runFollowups() {
  const leads = await db.lead.findMany({
    where:{sequenceStopped:false,nextFollowupAt:{lte:new Date()},status:{not:'BLACKLISTED'}},take:100,orderBy:{nextFollowupAt:'asc'},
    include:{messages:{where:{direction:'OUTBOUND',type:{in:['INITIAL','FOLLOWUP']},status:{in:['SENT','DELIVERED','SIMULATED']}}},campaign:{include:{sequences:true}}},
  });
  const results = [];
  for (const lead of leads) {
    try {
      const step = Math.max(...lead.messages.map(m=>m.sequenceStep),0)+1;
      if (step > 2) { await db.lead.update({where:{id:lead.id},data:{sequenceStopped:true,nextFollowupAt:null}}); continue; }
      const configured = lead.campaign?.sequences.find(s=>s.stepNumber===step);
      if (configured && !configured.enabled) { await db.lead.update({where:{id:lead.id},data:{sequenceStopped:true,nextFollowupAt:null}}); continue; }
      const message = await generateOutreach(lead.id,lead.campaignId ?? undefined,step);
      results.push(await sendMessage(message.id));
    } catch(error) { await audit('FOLLOWUP_FAILED',errorText(error),lead.id,{},'ERROR'); }
  }
  return results;
}
export async function sendDeferred() {
  const messages = await db.message.findMany({where:{status:'DEFERRED'},take:100,orderBy:{createdAt:'asc'}});
  for (const message of messages) await sendMessage(message.id);
  return {checked:messages.length};
}
export async function cleanupBounces() {
  const messages = await db.message.findMany({where:{status:{in:['BOUNCED','COMPLAINED']},lead:{status:{not:'BLACKLISTED'}}},select:{leadId:true,status:true}});
  for (const message of messages) await blacklistLead(message.leadId,message.status);
  // A crashed worker may leave a claim behind. Escalate it, never retry automatically.
  const stale = await db.message.findMany({where:{status:'SENDING',sentAt:{lt:new Date(Date.now()-3600000)}}});
  for (const message of stale) {
    await db.message.updateMany({where:{id:message.id,status:'SENDING'},data:{status:'SEND_UNCERTAIN',error:'Worker stopped after claiming the send. Verify delivery with Resend.'}});
    await audit('STALE_SEND_REQUIRES_REVIEW','Envoi incertain : vérification nécessaire chez le fournisseur',message.leadId,{messageId:message.id},'WARN');
  }
  await audit('BOUNCES_CLEANED',`${messages.length} lead(s) bloqué(s) après rejet ou plainte ; ${stale.length} envoi(s) incertain(s) signalé(s).`);
  return {suppressed:messages.length,uncertain:stale.length};
}
export async function dailyMetrics() {
  const date = new Date().toISOString().slice(0,10);
  const [leads,qualified,sent,simulated,replies,positive,meetings,wins,offers] = await Promise.all([db.lead.count(),db.lead.count({where:{totalScore:{gte:75}}}),db.message.count({where:{direction:'OUTBOUND',dryRun:false,status:{in:['SENT','DELIVERED']}}}),db.message.count({where:{status:'SIMULATED'}}),db.message.count({where:{direction:'INBOUND'}}),db.message.count({where:{direction:'INBOUND',aiClassification:{in:['POSITIVE','MEETING_REQUEST']}}}),db.pipelineDeal.count({where:{stage:'MEETING'}}),db.pipelineDeal.aggregate({where:{stage:'WON'},_count:true,_sum:{estimatedValue:true}}),db.generatedOffer.count()]);
  const metrics = {leads,qualified,sent,simulated,replies,positive,meetings,wins:wins._count,revenue:wins._sum.estimatedValue ?? 0,offers};
  await db.dailyMetric.upsert({where:{date},create:{date,metrics:json(metrics)},update:{metrics:json(metrics)}});
  await audit('DAILY_METRICS','Instantané quotidien des statistiques enregistré',undefined,metrics);
  return metrics;
}
