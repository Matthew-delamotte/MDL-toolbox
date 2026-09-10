import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { createAIService } from '@/lib/providers';
import { classifyReplyRules, evaluateAutopilot } from '@/lib/domain';
import { audit, contextFor, pipeline, review } from './shared';
import { sendMessage } from './sending';

export async function blacklistLead(leadId:string,reason:string) {
  const lead = await db.lead.findUniqueOrThrow({where:{id:leadId},include:{contact:true}});
  const email = lead.contact?.email?.toLowerCase();
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401902)`;
    if (email) await tx.suppression.upsert({where:{email},create:{email,reason},update:{reason}});
    const where = email ? {contact:{email}} : {id:leadId};
    await tx.lead.updateMany({where,data:{status:'BLACKLISTED',sequenceStopped:true,nextFollowupAt:null}});
    await tx.message.updateMany({where:{lead:where,direction:'OUTBOUND',status:{in:['DRAFT','APPROVED','DEFERRED']}},data:{status:'CANCELLED',error:reason}});
    await tx.reviewItem.updateMany({where:{lead:where,status:'PENDING'},data:{status:'REJECTED',resolvedAt:new Date()}});
  });
  await pipeline(leadId,'LOST',reason);
  await audit('LEAD_BLACKLISTED',reason,leadId,{email});
  return {leadId,suppressed:true};
}

type ReplyInput = {leadId:string;body:string;subject?:string;externalId?:string};
export async function recordInboundReply({leadId,body,subject,externalId}:ReplyInput) {
  if (!body.trim()) throw new Error('La réponse reçue est vide.');
  const immediate = classifyReplyRules(body);
  const optOut = ['UNSUBSCRIBE', 'NOT_INTERESTED'].includes(immediate.category);
  const key = `inbound:${externalId ?? createHash('sha256').update(`${leadId}:${subject ?? ''}:${body}`).digest('hex')}`;
  const received = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401902)`;
    const lead = await tx.lead.findUniqueOrThrow({where:{id:leadId},include:{contact:true}});
    const existing = await tx.message.findUnique({where:{idempotencyKey:key}});
    if (existing) return existing;
    const where = lead.contact?.email ? {contact:{email:lead.contact.email}} : {id:leadId};
    if (optOut && lead.contact?.email) {
      const email = lead.contact.email.trim().toLowerCase();
      const reason = immediate.category === 'UNSUBSCRIBE'
        ? 'Désinscription demandée'
        : 'Le prospect ne souhaite plus être contacté';
      await tx.suppression.upsert({
        where: { email },
        create: { email, reason },
        update: { reason },
      });
    }
    await tx.lead.updateMany({
      where,
      data: {
        sequenceStopped: true,
        nextFollowupAt: null,
        ...(optOut ? { status: 'BLACKLISTED' } : {}),
      },
    });
    if (!optOut) {
      await tx.lead.updateMany({
        where: {
          ...where,
          status: { in: ['DISCOVERED', 'WATCH', 'IGNORE', 'REVIEW', 'QUALIFIED', 'CONTACTED'] },
        },
        data: { status: 'REPLIED' },
      });
      await tx.pipelineDeal.updateMany({
        where: {
          lead: where,
          stage: { in: ['DISCOVERED', 'QUALIFIED', 'CONTACTED'] },
        },
        data: { stage: 'REPLIED', probability: 35, nextAction: 'Classify incoming reply' },
      });
    }
    // A new inbound message invalidates every older draft, including replies.
    await tx.message.updateMany({
      where: {
        lead: where,
        direction: 'OUTBOUND',
        status: { in: ['DRAFT', 'APPROVED', 'DEFERRED'] },
      },
      data: { status: 'CANCELLED', error: 'Stopped by inbound reply.' },
    });
    return tx.message.create({data:{leadId,direction:'INBOUND',type:'REPLY',subject:subject ?? 'Re: your message',body,status:'RECEIVED',receivedAt:new Date(),recipientEmail:lead.contact?.email,providerMessageId:externalId ? `inbound:${externalId}` : undefined,idempotencyKey:key,dryRun:externalId?.startsWith('simulation:') ?? !externalId}});
  });
  if (received.aiClassification) return received;
  if (immediate.category === 'UNSUBSCRIBE' || immediate.category === 'NOT_INTERESTED') {
    await blacklistLead(leadId,immediate.category === 'UNSUBSCRIBE' ? 'Désinscription demandée' : 'Le prospect ne souhaite plus être contacté');
    await db.conversation.upsert({where:{leadId},create:{leadId,status:'CLOSED',intent:immediate.category},update:{status:'CLOSED',intent:immediate.category,requiresHuman:false,lastMessageAt:new Date()}});
    const result = await db.message.update({where:{id:received.id},data:{aiClassification:immediate.category,aiConfidence:immediate.confidence}});
    await audit('REPLY_CLASSIFIED',`${immediate.category} immédiat : blocage appliqué avant tout appel à l’IA`,leadId,{messageId:received.id});
    return result;
  }
  return received;
}

export async function processReply(input:ReplyInput) {
  const {leadId,body} = input;
  const received = await recordInboundReply(input);
  if (received.aiClassification) return received;
  const key = received.idempotencyKey;
  const settings = await getSettings();
  const ai = createAIService(settings.aiModel);
  const classification = await ai.classifyReply(body);
  const category = classification.category;
  const newerInbound = await db.message.findFirst({
    where: {
      leadId,
      direction: 'INBOUND',
      createdAt: { gt: received.createdAt },
    },
  });
  if (newerInbound && !['UNSUBSCRIBE', 'NOT_INTERESTED'].includes(category)) {
    // A delayed classifier must not act on an outdated conversation snapshot.
    const result = await db.message.update({
      where: { id: received.id },
      data: { aiClassification: category, aiConfidence: classification.confidence },
    });
    await audit('STALE_REPLY_CLASSIFIED', 'Ancienne réponse classée sans action automatique', leadId, {
      messageId: received.id,
      newerMessageId: newerInbound.id,
    });
    return result;
  }
  const policy = evaluateAutopilot({body,category,confidence:classification.confidence,autopilotEnabled:settings.autopilotEnabled,threshold:Math.max(.85,settings.autoReplyConfidence)});
  const handoff = classification.requiresHuman || policy.mode === 'HANDOFF' || ['MEETING_REQUEST','NEGOTIATION','REFERRAL'].includes(category);
  await db.conversation.upsert({where:{leadId},create:{leadId,status:category === 'NOT_INTERESTED' || category === 'UNSUBSCRIBE' ? 'CLOSED' : 'OPEN',intent:category,sentiment:category === 'POSITIVE' || category === 'MEETING_REQUEST' ? 'POSITIVE' : 'NEUTRAL',requiresHuman:handoff,lastMessageAt:new Date()},update:{intent:category,requiresHuman:handoff,lastMessageAt:new Date(),status:category === 'NOT_INTERESTED' || category === 'UNSUBSCRIBE' ? 'CLOSED' : 'OPEN'}});
  const {lead,context} = await contextFor(leadId);
  if (lead.contactId) await db.contact.update({where:{id:lead.contactId},data:{language:classification.language}});
  if (category === 'UNSUBSCRIBE' || category === 'NOT_INTERESTED') {
    await blacklistLead(leadId,category === 'UNSUBSCRIBE' ? 'Désinscription demandée' : 'Le prospect ne souhaite plus être contacté');
  } else if (lead.status === 'BLACKLISTED') {
    await audit('REPLY_ON_SUPPRESSED_LEAD','Réponse reçue sur un contact bloqué ; aucune action automatique.',leadId);
  } else if (category === 'OUT_OF_OFFICE') {
    const date = classification.returnDate ? new Date(classification.returnDate) : null;
    if (date && Number.isFinite(date.getTime()) && date > new Date()) {
      const otherReply = await db.message.findFirst({where:{leadId,direction:'INBOUND',id:{not:received.id},OR:[{aiClassification:null},{aiClassification:{not:'OUT_OF_OFFICE'}}]}});
      if (!otherReply) {
        await db.lead.update({where:{id:leadId},data:{sequenceStopped:false,nextFollowupAt:date,status:'CONTACTED'}});
        await db.message.updateMany({where:{leadId,type:'FOLLOWUP',status:'CANCELLED',error:'Arrêté par une réponse entrante.'},data:{status:'DRAFT',error:null}});
        await audit('OUT_OF_OFFICE_SCHEDULED',`Relance reportée au ${date.toISOString()}`,leadId);
      }
    } else await review({leadId,type:'REPLY',title:'Absence — date de retour inconnue',description:classification.reasoning,proposedAction:'Laissez la séquence arrêtée tant que la date de retour n’est pas confirmée.'});
  } else if (category === 'NOT_NOW') {
    await db.lead.update({where:{id:leadId},data:{status:'WATCH'}});
    await pipeline(leadId,'REPLIED','Décider quand recontacter');
    await review({leadId,type:'REPLY',title:'Le prospect préfère être recontacté plus tard',description:body,proposedAction:'Convenez d’une date avec le prospect. La séquence reste arrêtée.'});
  } else if (handoff) {
    const meeting = category === 'MEETING_REQUEST';
    await db.lead.update({where:{id:leadId},data:{status:meeting ? 'MEETING' : 'REPLIED'}});
    await pipeline(leadId,meeting ? 'MEETING' : 'REPLIED',meeting ? 'Matthew doit confirmer un rendez-vous' : category === 'REFERRAL' ? 'Vérifier le contact indiqué et demander une mise en relation' : 'Matthew reprend la conversation');
    await review({leadId,type:'HANDOFF',title:meeting ? 'Rendez-vous demandé' : category === 'REFERRAL' ? 'Renvoi vers un collègue à vérifier' : 'Réponse humaine nécessaire',description:`${classification.reasoning}\n\n${body}`,proposedAction:meeting && settings.calendarUrl ? `Confirmer une disponibilité : ${settings.calendarUrl}` : 'Matthew doit relire et répondre personnellement.'});
  } else if (category === 'POSITIVE' || category === 'QUESTION') {
    await db.lead.update({where:{id:leadId},data:{status:category === 'POSITIVE' ? 'INTERESTED' : 'REPLIED'}});
    await pipeline(leadId,category === 'POSITIVE' ? 'INTERESTED' : 'REPLIED','Répondre au prospect');
    const draft = await ai.draftReply(context,body,classification,settings);
    const draftPolicy = evaluateAutopilot({body:draft.body,category,confidence:classification.confidence,autopilotEnabled:settings.autopilotEnabled,threshold:Math.max(.85,settings.autoReplyConfidence)});
    const replyKey = `${key}:response`;
    const response = await db.message.upsert({where:{idempotencyKey:replyKey},create:{leadId,campaignId:lead.campaignId,direction:'OUTBOUND',type:'REPLY',subject:draft.subject,body:draft.body,status:'DRAFT',idempotencyKey:replyKey,recipientEmail:lead.contact?.email,dryRun:settings.dryRun,aiClassification:category,aiConfidence:classification.confidence},update:{}});
    if (policy.mode === 'AUTOPILOT' && draftPolicy.mode === 'AUTOPILOT' && classification.confidence > Math.max(.85,settings.autoReplyConfidence)) await sendMessage(response.id);
    else await review({leadId,messageId:response.id,type:draftPolicy.mode === 'HANDOFF' ? 'HANDOFF' : 'REPLY',title:'Brouillon de réponse à approuver',description:classification.reasoning,proposedAction:'Relisez et ajustez la réponse préparée avant de l’envoyer.'});
  } else {
    await db.lead.update({where:{id:leadId},data:{status:'REPLIED'}});
    await pipeline(leadId,'REPLIED','Examiner une réponse non classée');
    await review({leadId,type:'REPLY',title:'Réponse à examiner',description:body});
  }
  const result = await db.message.update({where:{id:received.id},data:{aiClassification:category,aiConfidence:classification.confidence}});
  await audit('REPLY_CLASSIFIED',`Réponse classée ${category} (${Math.round(classification.confidence*100)} %)`,leadId,{messageId:received.id,classification});
  return result;
}

export async function resolveReview({id,decision,body}:{id:string;decision:string;body?:string}) {
  const item = await db.reviewItem.findUniqueOrThrow({where:{id},include:{message:true}});
  if (item.status !== 'PENDING') return item;
  const action = decision.toUpperCase();
  if (!['APPROVE','EDIT','REJECT','HANDOFF','BLACKLIST'].includes(action)) throw new Error('Décision de validation inconnue.');
  if (action === 'BLACKLIST' && item.leadId) await blacklistLead(item.leadId,'Mise en liste noire après validation');
  if (action === 'HANDOFF' && item.leadId) {
    await db.lead.update({where:{id:item.leadId},data:{sequenceStopped:true,nextFollowupAt:null}});
    await db.conversation.upsert({where:{leadId:item.leadId},create:{leadId:item.leadId,requiresHuman:true},update:{requiresHuman:true}});
    await review({leadId:item.leadId,type:'HANDOFF',title:'Reprise en main demandée',description:item.description});
  }
  if (action === 'EDIT') {
    if (!item.messageId || !body?.trim()) throw new Error('Le corps du message ne peut pas être vide.');
    if (!['DRAFT','APPROVED','DEFERRED'].includes(item.message!.status)) throw new Error('Seuls les messages non envoyés peuvent être modifiés.');
    await db.message.update({where:{id:item.messageId},data:{body:body.trim(),status:'DRAFT'}});
    await audit('REVIEW_EDITED','Message de validation modifié',item.leadId ?? undefined,{reviewId:id});
    return item;
  }
  if (action === 'APPROVE' && item.messageId) {
    if (body?.trim()) {
      if (!['DRAFT','APPROVED','DEFERRED'].includes(item.message!.status)) throw new Error('Seuls les messages non envoyés peuvent être modifiés.');
      await db.message.update({where:{id:item.messageId},data:{body:body.trim()}});
    }
    const result = await sendMessage(item.messageId,true);
    if (!result.sent) throw new Error(result.reason ?? 'Safety rules prevented sending.');
  }
  if (action === 'REJECT' && item.messageId) await db.message.updateMany({where:{id:item.messageId,status:{in:['DRAFT','APPROVED','DEFERRED']}},data:{status:'REJECTED'}});
  const updated = await db.reviewItem.update({where:{id},data:{status:action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' || action === 'BLACKLIST' ? 'REJECTED' : 'HANDED_OFF',resolvedAt:new Date()}});
  await audit('REVIEW_RESOLVED',`Validation : ${action.toLowerCase()}`,item.leadId ?? undefined,{reviewId:id});
  return updated;
}
