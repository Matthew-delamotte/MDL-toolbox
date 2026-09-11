import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { createAIService } from '@/lib/providers';
import { companyProfileFromResearch, isUnknown, scoreStatus } from '@/lib/domain';
import { audit, contextFor, json, review } from './shared';
import { enrichCompany, findLeadContact } from './acquisition';

export async function researchLead(leadId:string) {
  const {lead,context} = await contextFor(leadId);
  const settings = await getSettings();
  const research = await createAIService(settings.aiModel).research(context);
  // Scoring reads the company record, not the evidence list: promote what research established.
  const profile = companyProfileFromResearch(research);
  const known = (value?:string|null) => !isUnknown(value);
  const enrichment = {
    ...(profile.country && !known(lead.company.country) ? {country:profile.country} : {}),
    ...(profile.industry && !known(lead.company.industry) ? {industry:profile.industry} : {}),
    ...(profile.employeeEstimate && !lead.company.employeeEstimate ? {employeeEstimate:profile.employeeEstimate} : {}),
    ...(profile.description && lead.company.description.length < 40 ? {description:profile.description} : {}),
    ...(profile.technologies?.length && !lead.company.technologies.length ? {technologies:profile.technologies} : {}),
  };
  await db.company.update({where:{id:lead.companyId},data:{research:json(research),status:'RESEARCHED',...enrichment}});
  await audit('RESEARCH_COMPLETED',`${research.length} fait(s) enregistré(s) avec leur niveau de preuve`,leadId,{research,enrichment});
  return research;
}
export async function scoreLead(leadId:string) {
  const {context} = await contextFor(leadId);
  const settings = await getSettings();
  const score = await createAIService(settings.aiModel).score(context);
  const status = scoreStatus(score.totalScore);
  const lead = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401902)`;
    const current = await tx.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: { conversation: true, deal: true },
    });
    const mayQualify = !current.sequenceStopped
      && !current.conversation
      && ['DISCOVERED', 'WATCH', 'IGNORE', 'REVIEW', 'QUALIFIED'].includes(current.status)
      && (!current.deal || ['DISCOVERED', 'QUALIFIED'].includes(current.deal.stage));
    // Delayed scoring jobs must not reopen a suppressed or active conversation.
    const updated = await tx.lead.update({
      where: { id: leadId },
      data: { ...score, ...(mayQualify ? { status } : {}) },
    });
    if (mayQualify && status === 'QUALIFIED') {
      await tx.pipelineDeal.upsert({
        where: { leadId },
        create: { leadId, stage: 'QUALIFIED', probability: 20, nextAction: 'Préparer une approche sur mesure' },
        update: { stage: 'QUALIFIED', probability: 20, nextAction: 'Préparer une approche sur mesure' },
      });
    }
    return updated;
  });
  if (lead.status === 'REVIEW') await review({leadId,type:'QUALIFICATION',title:'Qualification du lead à valider',description:score.reasoning});
  await audit('LEAD_SCORED',`Lead scoré ${score.totalScore}/100 — ${status}`,leadId,{score});
  return lead;
}
export async function generateOffer(leadId:string) {
  const existing = await db.generatedOffer.findFirst({where:{leadId},orderBy:{createdAt:'desc'}});
  if (existing) {
    await db.pipelineDeal.updateMany({where:{leadId,estimatedValue:0,stage:{in:['DISCOVERED','QUALIFIED']}},data:{estimatedValue:(existing.estimatedPriceMin+existing.estimatedPriceMax)/2}});
    return existing;
  }
  const {context} = await contextFor(leadId);
  const settings = await getSettings();
  const templates = await db.offerTemplate.findMany({where:{enabled:true}});
  if (!templates.length) throw new Error('Activez au moins une famille d’offre.');
  const proposal = await createAIService(settings.aiModel).generateOffer(context,templates);
  const offer = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leadId}))`;
    const found = await tx.generatedOffer.findFirst({where:{leadId},orderBy:{createdAt:'desc'}});
    if (found) return found;
    const created = await tx.generatedOffer.create({data:{...proposal,leadId}});
    await tx.lead.update({where:{id:leadId},data:{recommendedOfferId:proposal.offerTemplateId,estimatedPriceMin:proposal.estimatedPriceMin,estimatedPriceMax:proposal.estimatedPriceMax}});
    await tx.pipelineDeal.updateMany({where:{leadId,estimatedValue:0,stage:{in:['DISCOVERED','QUALIFIED']}},data:{estimatedValue:(proposal.estimatedPriceMin+proposal.estimatedPriceMax)/2}});
    return created;
  });
  await audit('OFFER_GENERATED',offer.title,leadId,{offerId:offer.id,estimate:[offer.estimatedPriceMin,offer.estimatedPriceMax]});
  return offer;
}
export async function generateOutreach(leadId:string,campaignId?:string,step=0) {
  const key = `lead:${leadId}:sequence:${step}`;
  const existing = await db.message.findUnique({where:{idempotencyKey:key}});
  if (existing) return existing;
  const {lead,context} = await contextFor(leadId);
  const settings = await getSettings();
  const offer = await generateOffer(leadId);
  const draft = await createAIService(settings.aiModel).draftOutreach(context,offer,settings,step);
  // Without this the template silently replacing a personalised draft leaves no trace at all.
  if (draft.fallbackReason) await audit('OUTREACH_FALLBACK',`Gabarit utilisé : ${draft.fallbackReason}`.slice(0,400),leadId,{step},'WARN');
  const message = await db.message.upsert({where:{idempotencyKey:key},create:{leadId,campaignId:campaignId ?? lead.campaignId,direction:'OUTBOUND',type:step === 0 ? 'INITIAL' : 'FOLLOWUP',subject:draft.subject,body:draft.body,idempotencyKey:key,recipientEmail:lead.contact?.email,sequenceStep:step,dryRun:settings.dryRun},update:{}});
  await review({leadId,messageId:message.id,type:'OUTREACH',title:step ? `Relance ${step} prête` : 'Approche personnalisée prête',description:'Relisez les preuves, le destinataire et le message. L’envoi automatique n’a lieu que si toutes les règles de sécurité et de campagne sont respectées.'});
  await audit('OUTREACH_GENERATED',`Email rédigé : ${message.subject}`,leadId,{messageId:message.id,step});
  return message;
}
export async function processLead(leadId:string,campaignId?:string) {
  const original = await db.lead.findUniqueOrThrow({where:{id:leadId},include:{conversation:true,deal:true}});
  if (original.sequenceStopped || original.conversation || (original.deal && !['DISCOVERED','QUALIFIED'].includes(original.deal.stage)) || !['DISCOVERED','WATCH','IGNORE','REVIEW','QUALIFIED'].includes(original.status)) return original;
  if (campaignId && !original.campaignId) await db.lead.update({where:{id:leadId},data:{campaignId}});
  await enrichCompany(leadId);
  await findLeadContact(leadId);
  await researchLead(leadId);
  const lead = await scoreLead(leadId);
  if (lead.totalScore >= 65) { await generateOffer(leadId); await generateOutreach(leadId,campaignId); }
  return lead;
}
