import { z } from 'zod';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { parseEmailAlert } from '@/lib/providers';
import { discover, ingestOpportunities, enrichCompany, findLeadContact, researchLead, scoreLead, generateOffer, generateOutreach, sendMessage, processReply, runFollowups, sendDeferred, dailyMetrics, cleanupBounces } from '@/lib/services/engine';
import { audit } from '@/lib/services/shared';
import { countryLabel } from '@/lib/domain';
import { inngest } from './client';

const leadInput = z.object({leadId:z.string().min(1),campaignId:z.string().optional()});
const discoverInput = z.object({query:z.string().min(2).max(500),campaignId:z.string().optional()});

const discoverOpportunities = inngest.createFunction({id:'discover-opportunities',retries:3},{event:'mdl/opportunity.discover'},async ({event,step}) => {
  const input = z.object({subject:z.string(),body:z.string(),sourceUrl:z.string().url().optional(),campaignId:z.string().optional()}).parse(event.data);
  const leads = await step.run('ingest-email-alert',()=>ingestOpportunities(parseEmailAlert(input),input.campaignId));
  await step.run('flag-unverified-employers',async()=>{
    for (const lead of leads) {
      await db.reviewItem.create({data:{leadId:lead.id,type:'OPPORTUNITY',title:'Verify the employer behind this alert',description:'Email alert parsing cannot establish the employer or the right contact. Verify the opportunity before qualification.',proposedAction:'Open the original source, verify the employer, and import the actual company and contact.'}});
      await audit('EMAIL_ALERT_IMPORTED','Email opportunity awaits employer identity verification',lead.id);
    }
  });
  return {leads:leads.map(l=>l.id)};
});

const discoverCompanies = inngest.createFunction({id:'discover-companies',retries:3},[{event:'mdl/discover'},{cron:'0 7 * * 1-5'}],async ({event,step}) => {
  const requests = event.name === 'mdl/discover' ? [discoverInput.parse(event.data)] : await step.run('active-campaigns',async()=>{
    const settings = await getSettings();
    if (!settings.autopilotEnabled) return [];
    const campaigns = await db.campaign.findMany({where:{status:'ACTIVE',autopilotEnabled:true}});
    return campaigns.map(c=>({query:`${c.target} ${countryLabel(c.country)}`.trim(),campaignId:c.id}));
  });
  for (let i=0;i<requests.length;i++) {
    const leads = await step.run(`discover-${i}`,()=>discover(requests[i]));
    if (leads.length) await step.sendEvent(`enrich-${i}`,leads.map(lead=>({name:'mdl/lead.process',data:{leadId:lead.id,campaignId:requests[i].campaignId}})));
  }
  return {searches:requests.length};
});

const enrich = inngest.createFunction({id:'enrich-company',retries:3},{event:'mdl/lead.process'},async ({event,step}) => {
  const input = leadInput.parse(event.data);
  const eligible = await step.run('check-lead-state',async()=>{
    const lead = await db.lead.findUniqueOrThrow({where:{id:input.leadId}});
    return !lead.sequenceStopped && ['DISCOVERED','WATCH','IGNORE','REVIEW','QUALIFIED'].includes(lead.status);
  });
  if (!eligible) return {skipped:true};
  await step.run('enrich-company',()=>enrichCompany(input.leadId));
  await step.sendEvent('find-contact',{name:'mdl/contact.find',data:input});
});
const contacts = inngest.createFunction({id:'find-contacts',retries:3},{event:'mdl/contact.find'},async ({event,step}) => {
  const input = leadInput.parse(event.data);
  await step.run('hunter-contact',()=>findLeadContact(input.leadId));
  await step.sendEvent('research',{name:'mdl/lead.research',data:input});
});
const research = inngest.createFunction({id:'research-lead',retries:3},{event:'mdl/lead.research'},async ({event,step}) => {
  const input = leadInput.parse(event.data);
  await step.run('research-evidence',()=>researchLead(input.leadId));
  await step.sendEvent('score',{name:'mdl/lead.score',data:input});
});
const score = inngest.createFunction({id:'score-lead',retries:3},{event:'mdl/lead.score'},async ({event,step}) => {
  const input = leadInput.parse(event.data);
  const lead = await step.run('score-evidence',()=>scoreLead(input.leadId));
  if (lead.totalScore >= 65) await step.sendEvent('offer',{name:'mdl/offer.generate',data:input});
  return {score:lead.totalScore};
});
const offer = inngest.createFunction({id:'generate-offer',retries:3},{event:'mdl/offer.generate'},async ({event,step}) => {
  const input = leadInput.parse(event.data);
  await step.run('adaptive-offer',()=>generateOffer(input.leadId));
  await step.sendEvent('draft',{name:'mdl/outreach.generate',data:input});
});
const outreach = inngest.createFunction({id:'generate-outreach',retries:3},{event:'mdl/outreach.generate'},async ({event,step}) => {
  const input = leadInput.parse(event.data);
  const message = await step.run('personalized-draft',()=>generateOutreach(input.leadId,input.campaignId));
  await step.sendEvent('send',{name:'mdl/outreach.send',data:{messageId:message.id}});
});
const send = inngest.createFunction({id:'send-outreach',retries:0,concurrency:{limit:1}},{event:'mdl/outreach.send'},async ({event,step}) => {
  const {messageId} = z.object({messageId:z.string().min(1)}).parse(event.data);
  return step.run('claim-and-dispatch',()=>sendMessage(messageId));
});
const reply = inngest.createFunction({id:'process-reply',retries:3,concurrency:{limit:1,key:'event.data.leadId'}},{event:'mdl/reply.process'},async ({event,step}) => {
  const input = z.object({leadId:z.string().min(1),body:z.string().min(1),subject:z.string().optional(),externalId:z.string().optional()}).parse(event.data);
  return step.run('classify-and-act',()=>processReply(input));
});
const followups = inngest.createFunction({id:'send-followups',retries:1},[{cron:'15 * * * *'},{event:'mdl/followups.run'}],async ({step}) => {
  await step.run('retry-cap-deferred',sendDeferred);
  return step.run('due-sequence-steps',runFollowups);
});
const metrics = inngest.createFunction({id:'daily-metrics',retries:3},{cron:'50 23 * * *'},async ({step})=>step.run('snapshot',dailyMetrics));
const bounces = inngest.createFunction({id:'cleanup-bounces',retries:3},{cron:'*/30 * * * *'},async ({step})=>step.run('suppress-and-flag',cleanupBounces));
export const functions = [discoverOpportunities,discoverCompanies,enrich,contacts,score,research,offer,outreach,send,reply,followups,metrics,bounces];
