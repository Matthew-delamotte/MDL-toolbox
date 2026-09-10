import { Resend } from 'resend';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { inngest } from '@/lib/jobs/client';
import { parseEmailAlert } from '@/lib/providers';
import { hasAuthenticatedSender } from '@/lib/domain';
import { ingestOpportunities } from './acquisition';
import { blacklistLead, processReply, recordInboundReply } from './replies';
import { audit, json, review } from './shared';

export const resendEventSchema = z.object({type:z.string(),created_at:z.string().optional(),data:z.object({email_id:z.string().optional(),message_id:z.string().optional(),from:z.string().optional(),to:z.array(z.string()).optional(),subject:z.string().optional()}).passthrough()});
type ResendEvent = z.infer<typeof resendEventSchema>;
function mailbox(input:string) { return (input.match(/<([^<>]+)>/)?.[1] ?? input).trim().toLowerCase(); }
const subjectKey = (value:string) => value.replace(/^(?:(?:re|fw|fwd|rép)\s*:\s*)+/i,'').trim().toLowerCase();

async function unmatchedInbound(id:string,subject:string,body:string,reason:string) {
  await db.reviewItem.create({data:{type:'INBOUND',title:`Email entrant non rattaché : ${subject.slice(0,120)}`,description:`${reason}\n\n${body.slice(0,20000)}`,proposedAction:'Vérifiez l’expéditeur et rattachez ce message au bon lead avant de répondre.'}});
  await audit('INBOUND_REVIEW_REQUIRED',reason,undefined,{providerId:id});
}
async function receiveEmail(event:ResendEvent) {
  const emailId = event.data.email_id;
  if (!emailId) throw new Error('Le webhook reçu ne contient pas d’email_id.');
  if (!process.env.RESEND_API_KEY) throw new Error('La clé RESEND_API_KEY est nécessaire pour récupérer le contenu reçu.');
  const resend = new Resend(process.env.RESEND_API_KEY);
  // Resend webhooks only contain metadata. Always retrieve the actual received message.
  const {data,error} = await resend.emails.receiving.get(emailId);
  if (error || !data) throw new Error(`Unable to retrieve inbound email: ${error?.message ?? 'empty response'}`);
  const sender = mailbox(data.from);
  const headers = Object.fromEntries(Object.entries(data.headers ?? {}).map(([key,value])=>[key.toLowerCase(),value]));
  const text = data.text?.trim() || data.html?.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').trim() || '';
  if (!text) { await unmatchedInbound(emailId,data.subject,'[No readable text body]','Email has no readable text body.'); return; }
  const recipients = [...data.to,...(data.received_for ?? [])].map(mailbox);
  if (process.env.RESEND_ALERT_EMAIL && recipients.includes(mailbox(process.env.RESEND_ALERT_EMAIL))) {
    const allowed = (process.env.ALERT_ALLOWED_SENDERS ?? '').split(',').filter(Boolean).map(mailbox);
    if (!allowed.includes(sender)) { await unmatchedInbound(emailId,data.subject,text,'Alert sender is not in ALERT_ALLOWED_SENDERS.'); return; }
    const source = await db.sourceConfig.findUnique({where:{name:'Email alerts'}});
    if (source && !source.enabled) { await audit('EMAIL_ALERT_SOURCE_DISABLED','Alerte email ignorée : la source est désactivée'); return; }
    const items = parseEmailAlert({subject:data.subject,body:text});
    const leads = await ingestOpportunities(items);
    for (const lead of leads) await review({leadId:lead.id,type:'OPPORTUNITY',title:'Vérifier l’employeur issu de l’alerte email',description:'L’URL source peut être une place de marché ou une newsletter. Confirmez l’employeur réel et le contact avant de qualifier.'});
    if (!leads.length) await unmatchedInbound(emailId,data.subject,text,'Alert contains no usable source URL.');
    await audit('EMAIL_ALERT_RECEIVED',`${leads.length} opportunité(s) importée(s) pour validation`,undefined,{providerId:emailId,sender});
    return;
  }
  const settings = await getSettings();
  const owned = [settings.replyTo,settings.fromEmail].filter(Boolean).map(mailbox);
  if (!recipients.some(recipient=>owned.includes(recipient))) { await unmatchedInbound(emailId,data.subject,text,'Inbound recipient does not match the configured sender or reply-to mailbox.'); return; }
  const candidates = await db.message.findMany({where:{direction:'OUTBOUND',recipientEmail:sender,dryRun:false,status:{in:['SENT','DELIVERED','BOUNCED','COMPLAINED']}},orderBy:{sentAt:'desc'},take:30});
  let matching = candidates.filter(message=>subjectKey(message.subject)===subjectKey(data.subject));
  const references: string[] = `${headers['in-reply-to'] ?? ''} ${headers.references ?? ''}`.match(/<[^<>]+>/g) ?? [];
  if (references.length) {
    const referenceEvents = await db.webhookEvent.findMany({where:{OR:references.map(reference=>({payload:{path:['data','message_id'],equals:reference}}))},take:30});
    const providerIds = referenceEvents.flatMap(item=>{ const parsed = resendEventSchema.safeParse(item.payload); return parsed.success && parsed.data.type !== 'email.received' && parsed.data.data.email_id ? [parsed.data.data.email_id] : []; });
    const referenced = candidates.filter(message=>message.providerMessageId && providerIds.includes(message.providerMessageId));
    if (referenced.length) matching = referenced;
    else {
      // Provider event delivery can be out of order. Verify Message-ID against the Resend API.
      const verified = [];
      for (const candidate of candidates.slice(0,5)) {
        if (!candidate.providerMessageId) continue;
        const retrieved = await resend.emails.get(candidate.providerMessageId);
        if (retrieved.error) throw new Error(`Unable to correlate outgoing Message-ID: ${retrieved.error.message}`);
        if (retrieved.data && references.includes(retrieved.data.message_id)) verified.push(candidate);
      }
      if (verified.length) matching = verified;
    }
  }
  const leadIds = [...new Set(matching.map(message=>message.leadId))];
  if (leadIds.length !== 1) { await unmatchedInbound(emailId,data.subject,text,'Sender and message references do not identify one existing outbound conversation.'); return; }
  const input = {leadId:leadIds[0],body:text.slice(0,50000),subject:data.subject,externalId:emailId};
  const received = await recordInboundReply(input); // Stop the sequence and honor opt-outs before queueing any AI work.
  if (received.aiClassification) return;
  const authentication = headers['authentication-results'] ?? '';
  if (!hasAuthenticatedSender(authentication)) {
    await db.message.update({
      where: { id: received.id },
      data: { aiClassification: 'UNKNOWN', aiConfidence: 0 },
    });
    await db.conversation.upsert({
      where: { leadId: input.leadId },
      create: { leadId: input.leadId, requiresHuman: true, intent: 'UNKNOWN' },
      update: { requiresHuman: true, intent: 'UNKNOWN', lastMessageAt: new Date() },
    });
    await review({
      leadId: input.leadId,
      type: 'INBOUND_AUTH',
      title: 'Vérifier l’expéditeur entrant',
      description: 'Aucun résultat DMARC favorable, ou l’authentification échoue. La séquence est arrêtée ; vérifiez l’expéditeur avant de répondre.',
    });
    await audit('INBOUND_AUTH_REVIEW','L’authentification de l’expéditeur doit être vérifiée',input.leadId,{providerId:emailId});
    return;
  }
  if (process.env.INNGEST_EVENT_KEY) await inngest.send({id:`resend-reply:${emailId}`,name:'mdl/reply.process',data:input});
  else await processReply(input);
}

export async function handleResendEvent(event:ResendEvent) {
  if (event.type === 'email.received') return receiveEmail(event);
  const message = event.data.email_id ? await db.message.findUnique({where:{providerMessageId:event.data.email_id}}) : null;
  if (event.type === 'email.bounced' || event.type === 'email.complained' || event.type === 'email.suppressed') {
    const reason = event.type === 'email.bounced' ? 'BOUNCED' : event.type === 'email.complained' ? 'COMPLAINED' : 'SUPPRESSED';
    const emails = [...new Set([...(event.data.to ?? []),...(message?.recipientEmail ? [message.recipientEmail] : [])].map(mailbox))].filter(email=>z.email().safeParse(email).success);
    for (const email of emails) {
      await db.suppression.upsert({where:{email},create:{email,reason},update:{reason}});
      const leads = await db.lead.findMany({where:{contact:{email}},select:{id:true}});
      for (const lead of leads) await blacklistLead(lead.id,reason);
      await db.contact.updateMany({where:{email},data:{emailStatus:reason === 'COMPLAINED' ? 'COMPLAINT' : 'BOUNCED'}});
    }
    if (message) await db.message.update({where:{id:message.id},data:{status:reason}});
    await audit('EMAIL_SUPPRESSION',`Événement ${event.type} : ${emails.length} destinataire(s) bloqué(s)`,message?.leadId,{providerId:event.data.email_id});
  } else if (message && event.type === 'email.delivered') {
    await db.message.updateMany({where:{id:message.id,status:{notIn:['BOUNCED','COMPLAINED','SUPPRESSED']}},data:{status:'DELIVERED',deliveredAt:new Date(event.created_at ?? Date.now())}});
    await audit('EMAIL_DELIVERED',message.subject,message.leadId,{messageId:message.id});
  } else if (message && (event.type === 'email.failed' || event.type === 'email.delivery_delayed')) {
    await review({leadId:message.leadId,messageId:message.id,type:'DELIVERY',title:'Délivrabilité à surveiller',description:`Resend a signalé ${event.type}. Vérifiez les journaux du fournisseur avant de réessayer.`});
    await audit('EMAIL_DELIVERY_ISSUE',event.type,message.leadId,{event:json(event)},'WARN');
  }
}
