import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { createEmailProvider } from '@/lib/providers';
import { campaignTargetingReason, evaluateAutopilot, suppressionReason } from '@/lib/domain';
import { audit, errorText, pipeline, review } from './shared';

const dispatchedStatuses = ['SENDING','SENT','DELIVERED','SIMULATED','BOUNCED','COMPLAINED','SUPPRESSED','SEND_UNCERTAIN'];
export async function sendMessage(messageId:string,approved=false) {
  const settings = await getSettings();
  const claimed = await db.$transaction(async tx => {
    // One transaction-wide lock protects every recipient and all global/campaign caps.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401902)`;
    const message = await tx.message.findUniqueOrThrow({where:{id:messageId},include:{lead:{include:{contact:true,company:true,conversation:true}},campaign:true}});
    if (dispatchedStatuses.includes(message.status)) return {message,claimed:false,reason:`Message already ${message.status.toLowerCase()}.`};
    if (!['DRAFT','APPROVED','DEFERRED'].includes(message.status)) throw new Error(`Un message au statut ${message.status} ne peut pas être envoyé.`);
    const recipient = message.lead.contact?.email?.trim().toLowerCase();
    const suppressed = recipient ? await tx.suppression.findUnique({where:{email:recipient}}) : null;
    let reason = suppressionReason({email:recipient ?? null,emailStatus:message.lead.contact?.emailStatus ?? 'UNKNOWN',suppressed:!!suppressed,isDemo:message.lead.company.isDemo,dryRun:settings.dryRun});
    if (!reason && message.direction !== 'OUTBOUND') reason = 'Un message reçu ne peut pas être envoyé.';
    if (!reason && message.lead.status === 'BLACKLISTED') reason = 'Ce lead est en liste noire.';
    if (!reason && !settings.dryRun && !process.env.RESEND_API_KEY) reason = 'La clé RESEND_API_KEY est absente.';
    if (!reason && !settings.dryRun && !process.env.OPENAI_API_KEY && !approved) reason = 'Un texte produit sans IA connectée exige votre approbation explicite avant un envoi réel.';
    if (!reason && !settings.dryRun && (!settings.fromEmail || !settings.fromEmail.includes('@'))) reason = 'Configurez un email expéditeur vérifié avant tout envoi réel.';
    if (!reason && message.recipientEmail && message.recipientEmail.toLowerCase() !== recipient) reason = 'Le destinataire a changé depuis la rédaction ; préparez un nouveau brouillon pour le contact actuel.';
    if (!reason && message.type !== 'REPLY' && message.lead.sequenceStopped) reason = 'Séquence arrêtée après une réponse ou une intervention manuelle.';
    if (!reason && message.campaign && message.campaign.status !== 'ACTIVE') reason = 'La campagne n’est pas active.';
    if (!reason && !approved) {
      if (message.type !== 'REPLY') reason = campaignTargetingReason(message.lead.company, message.campaign);
      const policy = evaluateAutopilot({body:message.body,autopilotEnabled:settings.autopilotEnabled && (!message.campaign || message.campaign.autopilotEnabled),...(message.type === 'REPLY' ? {confidence:message.aiConfidence ?? 0,threshold:Math.max(.85,settings.autoReplyConfidence)} : {})});
      if (policy.mode !== 'AUTOPILOT') reason = policy.reasons.join(' ') || 'Manual approval required.';
      if (message.type !== 'REPLY' && message.lead.totalScore < Math.max(settings.minLeadScore,message.campaign?.minLeadScore ?? 0)) reason = 'Le score du lead est sous le seuil d’envoi automatique.';
      if (message.type === 'REPLY' && message.lead.conversation?.requiresHuman) reason = 'Cette conversation demande votre intervention.';
      if (message.type === 'REPLY' && (!['POSITIVE','QUESTION'].includes(message.aiClassification ?? '') || (message.aiConfidence ?? 0) <= Math.max(.85,settings.autoReplyConfidence))) reason = 'Cette réponse ne remplit pas les conditions de confiance et d’intention pour une réponse automatique.';
      if (message.type === 'REPLY') {
        const parentKey = message.idempotencyKey?.endsWith(':response')
          ? message.idempotencyKey.slice(0, -':response'.length)
          : null;
        const parent = parentKey
          ? await tx.message.findUnique({ where: { idempotencyKey: parentKey } })
          : null;
        const newerInbound = await tx.message.findFirst({
          where: {
            lead: { contact: { email: recipient } },
            direction: 'INBOUND',
            createdAt: { gt: parent?.createdAt ?? message.createdAt },
          },
        });
        if (newerInbound) reason = 'Une réponse plus récente est arrivée après ce brouillon ; relisez la conversation avant d’envoyer.';
      }
    }
    if (!reason && message.type === 'INITIAL') {
      const prior = await tx.message.findFirst({where:{recipientEmail:recipient,type:'INITIAL',direction:'OUTBOUND',status:{in:dispatchedStatuses},id:{not:messageId}}});
      if (prior) reason = 'Ce destinataire a déjà reçu un premier email ; doublon évité.';
      const inbound = await tx.message.findFirst({where:{lead:{contact:{email:recipient}},direction:'INBOUND'}});
      if (inbound) reason = 'Ce destinataire a déjà répondu ; une nouvelle approche à froid est bloquée.';
    }
    if (!reason && message.type === 'FOLLOWUP') {
      if (![1, 2].includes(message.sequenceStep)) reason = 'Seules deux relances sont autorisées.';
      const inbound = await tx.message.findFirst({where:{lead:{contact:{email:recipient}},direction:'INBOUND',OR:[{aiClassification:null},{aiClassification:{not:'OUT_OF_OFFICE'}}]}});
      if (inbound) reason = 'Une réponse a mis fin aux relances.';
      const initial = await tx.message.findFirst({where:{leadId:message.leadId,type:'INITIAL',status:{in:['SENT','SIMULATED','DELIVERED']}}});
      if (!initial) reason = 'Le premier email n’a pas encore été envoyé.';
      if (message.lead.nextFollowupAt && message.lead.nextFollowupAt > new Date()) reason = 'La relance n’est pas encore due.';
      const previous = await tx.message.findFirst({where:{recipientEmail:recipient,type:'FOLLOWUP',sequenceStep:message.sequenceStep,status:{in:dispatchedStatuses},id:{not:messageId}}});
      if (previous) reason = 'Ce destinataire a déjà reçu cette relance.';
    }
    if (reason) return {message,claimed:false,reason};
    const start = new Date(); start.setUTCHours(0,0,0,0);
    const sentToday = {direction:'OUTBOUND',status:{in:dispatchedStatuses},sentAt:{gte:start}};
    const [emails,newContacts,campaignEmails] = await Promise.all([tx.message.count({where:sentToday}),tx.message.count({where:{...sentToday,type:'INITIAL'}}),message.campaignId ? tx.message.count({where:{...sentToday,campaignId:message.campaignId,type:'INITIAL'}}) : Promise.resolve(0)]);
    if (emails >= settings.dailyEmailCap || (message.type === 'INITIAL' && (newContacts >= settings.dailyNewContactCap || (message.campaign && campaignEmails >= message.campaign.dailyLimit)))) {
      await tx.message.update({where:{id:messageId},data:{status:'DEFERRED',error:'Plafond d’envoi quotidien atteint ; nouvelle tentative le jour suivant (UTC).'}});
      return {message,claimed:false,reason:'Plafond d’envoi quotidien atteint.'};
    }
    const updated = await tx.message.update({where:{id:messageId},data:{status:'SENDING',sentAt:new Date(),recipientEmail:recipient,dryRun:settings.dryRun,error:null}});
    await tx.activityLog.create({data:{action:'SEND_CLAIMED',entityType:'Message',entityId:messageId,message:'Envoi réservé sous le verrou de sécurité global.'}});
    return {message:{...message,...updated},claimed:true,reason:null};
  });
  if (!claimed.claimed) {
    if (!dispatchedStatuses.includes(claimed.message.status)) {
      const policy = evaluateAutopilot({
        body: claimed.message.body,
        autopilotEnabled: settings.autopilotEnabled,
      });
      const handoff = policy.mode === 'HANDOFF';
      if (handoff) {
        await db.lead.update({
          where: { id: claimed.message.leadId },
          data: { sequenceStopped: true, nextFollowupAt: null },
        });
        await db.conversation.upsert({
          where: { leadId: claimed.message.leadId },
          create: { leadId: claimed.message.leadId, requiresHuman: true },
          update: { requiresHuman: true },
        });
      }
      await review({
        leadId: claimed.message.leadId,
        messageId,
        type: handoff ? 'HANDOFF' : 'SEND_SAFETY',
        title: handoff ? 'Réponse humaine nécessaire' : 'Envoi à examiner',
        description: claimed.reason ?? 'Envoi impossible.',
      });
      await audit('SEND_BLOCKED',claimed.reason ?? 'Envoi impossible.',claimed.message.leadId,{messageId});
    }
    return {message:claimed.message,sent:false,reason:claimed.reason};
  }
  try {
    const message = claimed.message;
    const language = message.lead.contact?.language ?? 'en';
    const footer = language === 'fr' ? 'Pas pertinent ? Répondez simplement « non » et je ne vous recontacterai plus.' : "Not relevant? Just reply 'no' and I won't contact you again.";
    const body = message.body.includes(footer) ? message.body : `${message.body}\n\n${footer}`;
    const result = await createEmailProvider(settings.dryRun).send({id:message.id,to:message.recipientEmail!,from:settings.fromEmail,replyTo:settings.replyTo || undefined,subject:message.subject,body});
    const sent = await db.message.update({where:{id:messageId},data:{status:result.dryRun ? 'SIMULATED' : 'SENT',providerMessageId:result.id,dryRun:result.dryRun,body}});
    await db.reviewItem.updateMany({where:{messageId,status:'PENDING'},data:{status:'APPROVED',resolvedAt:new Date()}});
    if (message.type !== 'REPLY') {
      const initial = message.type === 'INITIAL' ? sent : await db.message.findFirst({where:{leadId:message.leadId,type:'INITIAL',sentAt:{not:null}}});
      const next = message.sequenceStep < 2 && initial?.sentAt ? new Date(initial.sentAt.getTime() + (message.sequenceStep === 0 ? 3 : 7)*86400000) : null;
      await db.lead.updateMany({where:{id:message.leadId,sequenceStopped:false},data:{status:'CONTACTED',nextFollowupAt:next,...(message.sequenceStep >= 2 ? {sequenceStopped:true} : {})}});
      const current = await db.lead.findUniqueOrThrow({where:{id:message.leadId}});
      if (current.status === 'CONTACTED') await pipeline(message.leadId,'CONTACTED',next ? 'En attente de réponse ; relance programmée' : 'Séquence terminée ; en attente de réponse',current.estimatedPriceMin ?? undefined);
    }
    await audit(result.dryRun ? 'EMAIL_SIMULATED' : 'EMAIL_SENT',`${result.dryRun ? 'Simulation' : 'Envoyé'} : ${message.subject}`,message.leadId,{messageId,providerId:result.id});
    return {message:sent,sent:true,reason:null};
  } catch(error) {
    // Provider timeouts can happen after acceptance. Never automatically replay an uncertain send,
    // even after Resend's 24-hour idempotency retention period.
    const detail = errorText(error);
    await db.message.update({where:{id:messageId},data:{status:'SEND_UNCERTAIN',error:detail}});
    await review({leadId:claimed.message.leadId,messageId,type:'SEND_UNCERTAIN',title:'Vérifier la livraison chez Resend',description:`Le résultat de l’envoi est incertain : ${detail}. Vérifiez chez le fournisseur avant de créer un autre message. La reprise automatique est désactivée.`});
    await audit('EMAIL_SEND_UNCERTAIN',detail,claimed.message.leadId,{messageId},'ERROR');
    throw error;
  }
}
