import { db } from '@/lib/db';
import { createLeadSourceAdapter, findContact, parseManualCsv, type RawOpportunity } from '@/lib/providers';
import { languageFor, leadDedupeKey, normalizeDomain, normalizeEmail, normalizedCountry } from '@/lib/domain';
import { audit, json } from './shared';

function namedContactIdentity(companyId: string, fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized || /^(Contact name unavailable|Nom du contact indisponible)$/i.test(normalized) || normalized.includes('@')) return [];
  return [{ companyId, fullName: { equals: normalized, mode: 'insensitive' as const } }];
}

export async function ingestOpportunities(items:RawOpportunity[], campaignId?:string) {
  const leads = [];
  for (const item of items) {
    const domain = normalizeDomain(item.company.domain || item.company.website);
    if (!domain) throw new Error('Une source a renvoyé un domaine d’entreprise invalide.');
    const email = item.contact?.email ? normalizeEmail(item.contact.email) : null;
    const lead = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401901)`;
      const company = await tx.company.upsert({where:{domain}, create:{...item.company, domain, source:item.source, research:json(item.company.research ?? [])},update:{}});
      let contactId: string | undefined;
      if (item.contact) {
        const {firstName, lastName, jobTitle, emailStatus, linkedinUrl, language} = item.contact;
        const suppliedName = item.contact.fullName.trim().replace(/\s+/g, ' ');
        const fullName = /^(Contact name unavailable|Nom du contact indisponible)$/i.test(suppliedName) && email ? email : suppliedName;
        const existing = await tx.contact.findFirst({
          where: {
            OR: [
              ...(email ? [{ email }] : []),
              ...namedContactIdentity(company.id, fullName),
            ],
          },
        });
        const contact = existing ?? await tx.contact.create({data:{companyId:company.id,fullName,firstName,lastName,jobTitle,email,emailStatus,linkedinUrl,language,source:item.contact.source ?? item.source}});
        contactId = contact.id;
      }
      const externalId = item.externalId ? `${item.source}:${item.externalId}` : undefined;
      const dedupeKey = leadDedupeKey({domain,email,contact:item.contact?.fullName,externalId});
      const existingLead = await tx.lead.findFirst({where:{OR:[{dedupeKey},...(contactId ? [{contactId}] : []),...(externalId ? [{opportunity:{externalId}}] : []),...(!contactId && !externalId ? [{companyId:company.id,contactId:null}] : [])]}});
      if (existingLead) return existingLead;
      const opportunity = externalId ? await tx.opportunity.upsert({where:{externalId},create:{externalId,companyId:company.id,contactId,title:item.title,description:item.description,source:item.source,sourceUrl:item.sourceUrl,budgetMin:item.budgetMin,budgetMax:item.budgetMax,currency:item.currency,location:item.location,rawPayload:json(item.rawPayload ?? {})},update:{}}) : await tx.opportunity.create({data:{companyId:company.id,contactId,title:item.title,description:item.description,source:item.source,sourceUrl:item.sourceUrl,budgetMin:item.budgetMin,budgetMax:item.budgetMax,currency:item.currency,location:item.location,rawPayload:json(item.rawPayload ?? {})}});
      const created = await tx.lead.create({data:{dedupeKey,companyId:company.id,contactId,opportunityId:opportunity.id,campaignId,source:item.source}});
      await tx.activityLog.create({data:{action:'LEAD_DISCOVERED',entityType:'Lead',entityId:created.id,message:`Lead discovered: ${company.name}`,metadata:json({source:item.source,domain,fixture:company.isDemo})}});
      return created;
    });
    await db.pipelineDeal.upsert({where:{leadId:lead.id},create:{leadId:lead.id},update:{}});
    leads.push(lead);
  }
  return leads;
}

export async function discover({query,campaignId}:{query:string;campaignId?:string}) {
  const source = await db.sourceConfig.findUnique({where:{name:'Tavily web discovery'}});
  if (source && !source.enabled) throw new Error('La recherche web est désactivée dans les sources.');
  const items = await createLeadSourceAdapter().discover(query);
  const leads = await ingestOpportunities(items,campaignId);
  await audit('DISCOVERY_COMPLETED',`La recherche a retourné ${leads.length} lead(s)`,undefined,{query,campaignId});
  if (source) await db.sourceConfig.update({where:{id:source.id},data:{lastRunAt:new Date()}});
  return leads;
}
export async function importCsv(csv:string) {
  const source = await db.sourceConfig.findUnique({where:{name:'CSV import'}});
  if (source && !source.enabled) throw new Error('L’import CSV est désactivé dans les sources.');
  const result = await ingestOpportunities(parseManualCsv(csv));
  await audit('CSV_IMPORTED',`${result.length} ligne(s) CSV importée(s)`);
  return result;
}
export async function enrichCompany(leadId:string) {
  const lead = await db.lead.findUniqueOrThrow({where:{id:leadId},include:{company:true}});
  await db.company.update({where:{id:lead.companyId},data:{status:'ENRICHING'}});
  await audit('COMPANY_ENRICHMENT_STARTED',`Enrichissement lancé pour ${lead.company.name}`,leadId);
  return lead.company;
}
export async function findLeadContact(leadId:string) {
  const source = await db.sourceConfig.findUnique({where:{name:'Hunter contacts'}});
  if (source && !source.enabled) { await audit('CONTACT_DISCOVERY_DISABLED','La recherche de contacts Hunter est désactivée',leadId); return null; }
  const lead = await db.lead.findUniqueOrThrow({where:{id:leadId},include:{company:true,contact:true,campaign:true}});
  if (lead.contact?.emailStatus === 'VERIFIED') return lead.contact;
  if (lead.company.isDemo) return lead.contact;
  const found = await findContact(lead.company.domain,lead.company.employeeEstimate ?? undefined,/software|technical|saas/i.test(lead.company.industry));
  if (!found) { await audit('CONTACT_NOT_FOUND','Aucun contact vérifié trouvé ; l’approche devra être validée.',leadId); return lead.contact; }
  const email = found.email ? normalizeEmail(found.email) : null;
  const contact = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401901)`;
    const existing = await tx.contact.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...namedContactIdentity(lead.companyId, found.fullName),
        ],
      },
    });
    // Hunter returns no language: without this the contact keeps the "en" default and a French
    // prospect receives an English opt-out line.
    const language = languageFor(normalizedCountry(lead.company.country) ? lead.company.country : lead.campaign?.country, found.language);
    const result = existing ? await tx.contact.update({where:{id:existing.id},data:{...found,email,language}}) : await tx.contact.create({data:{...found,email,language,companyId:lead.companyId,source:found.source ?? 'HUNTER'}});
    await tx.lead.update({where:{id:leadId},data:{contactId:result.id}});
    return result;
  });
  await audit('CONTACT_FOUND',`Contact trouvé : ${contact.fullName} (${contact.emailStatus})`,leadId,{source:contact.source});
  await db.pipelineDeal.upsert({
    where: { leadId },
    create: { leadId, stage: 'DISCOVERED', nextAction: 'Research and qualify' },
    update: {},
  });
  await db.pipelineDeal.updateMany({
    where: { leadId, stage: 'DISCOVERED' },
    data: { nextAction: 'Research and qualify' },
  });
  return contact;
}
