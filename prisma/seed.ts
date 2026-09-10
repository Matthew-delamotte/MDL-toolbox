import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail || password.length < 12) throw new Error("Renseignez ADMIN_EMAIL et ADMIN_PASSWORD (au moins 12 caractères) avant le seed.");
  await db.user.upsert({ where: { email: adminEmail }, update: {}, create: { email: adminEmail, name: "Matthew", passwordHash: await hash(password, 12) } });
  const families = [
    { slug: "workflow-rescue", name: "Workflow Rescue", description: "Supprimer un processus manuel ou cassé : synchronisation d’API, CRM/email, reporting Shopify, doubles saisies.", minPrice: 600, maxPrice: 1200, typicalDeliveryDays: "2–5 days" },
    { slug: "internal-tool-sprint", name: "Internal Tool Sprint", description: "Un petit outil interne ciblé : tableau de bord, portail, mini CRM, suivi logistique ou génération de documents.", minPrice: 1500, maxPrice: 3000, typicalDeliveryDays: "5–10 days" },
    { slug: "ops-data-cleanup", name: "Ops & Data Cleanup", description: "Nettoyer, migrer et dédoublonner les données ; restructurer le CRM et fiabiliser le reporting.", minPrice: 800, maxPrice: 1800, typicalDeliveryDays: "3–7 days" },
  ];
  const offers = await Promise.all(families.map(family => db.offerTemplate.upsert({ where: { slug: family.slug }, update: {}, create: family })));
  for (const name of ["Tavily web discovery", "Hunter contacts", "Email alerts", "CSV import"]) {
    await db.sourceConfig.upsert({ where: { name }, update: {}, create: { name } });
  }
  if (process.env.SEED_DEMO !== "true" || process.env.DRY_RUN === "false") {
    console.log("Compte administrateur, familles d’offres et sources prêts. Données de démonstration désactivées."); return;
  }
  const campaign = await db.campaign.upsert({ where: { id: "seed-campaign-ops" }, update: {}, create: {
    id: "seed-campaign-ops", name: "Équipes opérationnelles · Europe", status: "ACTIVE", target: "opérations ecommerce et logistique", country: "FR", dailyLimit: 10,
    sequences: { create: [{ stepNumber: 0, delayHours: 0, instruction: "Introduction personnelle" }, { stepNumber: 1, delayHours: 72, instruction: "Relance courte et utile" }, { stepNumber: 2, delayHours: 168, instruction: "Dernier message, puis arrêt" }] },
  } });
  const companies = [
    ["Northline Commerce", "US", "Ecommerce", 32, "Sarah Bennett", "COO", "Shopify", "Rapprochement manuel des commandes entre boutiques", 86],
    ["Atelier Colis", "FR", "Logistique", 24, "Camille Laurent", "Responsable des opérations", "Google Sheets", "Suivi des expéditions sur tableur", 82],
    ["Harbor Digital", "UK", "Agence digitale", 18, "James Collins", "Fondateur", "HubSpot", "Fiches clients en double et reporting éclaté", 79],
    ["Maple & Co", "CA", "Ecommerce", 45, "Emma Walker", "Responsable ecommerce", "Shopify", "Rapports de commandes assemblés à la main chaque jour", 91],
    ["Forma Studio", "BE", "Agence marketing", 12, "Louis Martin", "Directeur général", "Airtable", "L’arrivée d’un client impose des ressaisies", 73],
    ["Transit Works", "NL", "Logistique", 78, "Sophie de Vries", "COO", "Excel", "Suivi des expéditions et des factures déconnectés", 88],
    ["Klarwerk", "DE", "Petit éditeur SaaS", 26, "Felix Weber", "CTO", "PostgreSQL", "Besoin d’un tableau de bord interne de santé des comptes", 80],
    ["Lumen Partners", "LU", "Conseil", 9, "Julie Muller", "Fondatrice", "Pipedrive", "Migration et nettoyage des données CRM", 67],
    ["Alpine Supply", "CH", "Ecommerce", 56, "Alex Meyer", "Responsable des opérations", "Shopify", "Exports de stock et incohérences de reporting", 62],
    ["Relay Automation", "US", "Agence d’automatisation", 15, "Daniel Brooks", "Fondateur", "Make", "Besoin d’un suivi interne des livraisons", 84],
  ] as const;
  const stages = ["QUALIFIED", "MEETING", "CONTACTED", "INTERESTED", "DISCOVERED", "PROPOSAL", "QUALIFIED", "REPLIED", "DISCOVERED", "WON"];
  for (let index = 0; index < companies.length; index++) {
    const [name, country, industry, size, fullName, title, technology, problem, score] = companies[index];
    const domain = `${name.toLowerCase().replace(/[^a-z]/g, "")}.example`;
    const createdAt = new Date(Date.now() - (index % 7) * 86400000);
    const company = await db.company.upsert({ where: { domain }, update: {}, create: { name, domain, website: `https://${domain}`, country, industry, employeeEstimate: size, description: `${name} est une équipe ${industry.toLowerCase()} fictive, utilisée pour tester MDL Lead Engine. ${problem}.`, technologies: [technology], source: "DEMO", isDemo: true, status: "ENRICHED", createdAt,
      research: [{ field: "technology", value: technology, status: "verified", source: "Donnée de démonstration (fictive)", sourceUrl: `https://${domain}` }, { field: "potential_problem", value: problem, status: "inferred", source: "Hypothèse de démonstration", sourceUrl: `https://${domain}` }] } });
    const email = `${fullName.split(" ")[0].toLowerCase()}@${domain}`;
    const contact = await db.contact.upsert({ where: { email }, update: {}, create: { companyId: company.id, fullName, firstName: fullName.split(" ")[0], lastName: fullName.split(" ").slice(1).join(" "), jobTitle: title, email, emailStatus: "VERIFIED", language: ["FR", "BE"].includes(country) ? "fr" : "en", source: "DEMO — contact fictif", createdAt } });
    const offer = offers[index % 3];
    let opportunityId: string | undefined;
    if (index < 4) {
      const opportunity = await db.opportunity.upsert({ where: { externalId: `demo:opportunity:${index}` }, update: {}, create: { externalId: `demo:opportunity:${index}`, companyId: company.id, contactId: contact.id, source: "DEMO_EMAIL_ALERT", sourceUrl: `https://${domain}/brief`, title: problem, description: `Brief fictif transféré : ${problem}. Recherche un partenaire pour une mise en œuvre ciblée.`, budgetMin: offer.minPrice, budgetMax: offer.maxPrice, location: country, postedAt: createdAt } });
      opportunityId = opportunity.id;
    }
    const lead = await db.lead.upsert({ where: { dedupeKey: email }, update: {}, create: { companyId: company.id, contactId: contact.id, opportunityId, campaignId: campaign.id, dedupeKey: email, source: "DEMO", status: score >= 75 ? "QUALIFIED" : score >= 65 ? "REVIEW" : "WATCH", fitScore: 26, valueScore: 20, deliverabilityScore: 18, clientQualityScore: 12, recurringPotentialScore: score - 76 > 0 ? Math.min(score - 76, 10) : 0, totalScore: score, detectedProblems: [problem], reasoning: "Donnée de démonstration. Bonne adéquation opérationnelle ; le besoin reste à confirmer en conversation.", recommendedOfferId: offer.id, estimatedPriceMin: offer.minPrice, estimatedPriceMax: offer.maxPrice, confidence: 0.81, createdAt } });
    // Keep the breakdown consistent with the displayed score.
    if (!(await db.generatedOffer.findFirst({ where: { leadId: lead.id } }))) {
      await db.lead.update({ where: { id: lead.id }, data: { fitScore: Math.min(30, Math.round(score * .30)), valueScore: Math.min(25, Math.round(score * .25)), deliverabilityScore: Math.min(20, Math.round(score * .20)), clientQualityScore: Math.min(15, Math.round(score * .15)), recurringPotentialScore: score - Math.round(score*.30) - Math.round(score*.25) - Math.round(score*.20) - Math.round(score*.15) } });
      await db.generatedOffer.create({ data: { leadId: lead.id, offerTemplateId: offer.id, title: `${name} · ${offer.name}`, problem: `Besoin à valider : ${problem.toLowerCase()}.`, proposedSolution: offer.description, deliverables: ["Confirmer le processus actuel", "Construire et valider la solution ciblée", "Documenter la reprise et la surveillance"], estimatedPriceMin: offer.minPrice, estimatedPriceMax: offer.maxPrice, estimatedDuration: offer.typicalDeliveryDays, rationale: "Périmètre et estimation indicatifs ; à confirmer avant tout engagement." } });
    }
    await db.pipelineDeal.upsert({ where: { leadId: lead.id }, update: {}, create: { leadId: lead.id, stage: stages[index], estimatedValue: (offer.minPrice + offer.maxPrice)/2, probability: stages[index] === "WON" ? 100 : stages[index] === "PROPOSAL" ? 65 : 25, nextAction: stages[index] === "MEETING" ? "Matthew : organiser un premier échange" : "Valider le besoin opérationnel", createdAt } });
    if ([1, 2, 3, 5, 7, 9].includes(index)) {
      const sentAt = new Date(Date.now() - 2 * 86400000);
      await db.message.upsert({ where: { idempotencyKey: `seed:initial:${index}` }, update: {}, create: { leadId: lead.id, campaignId: campaign.id, direction: "OUTBOUND", type: "INITIAL", status: "SIMULATED", subject: `Une question sur les opérations de ${name}`, body: `Bonjour ${fullName.split(" ")[0]},\n\nDans les équipes ${industry.toLowerCase()}, ${problem.toLowerCase()} crée parfois du travail en plus. Si c’est d’actualité chez ${name}, je peux vous envoyer en quelques lignes une piste d’amélioration ciblée.\n\nEst-ce utile ?\n\nMatthew\nMDL Advisory\n\nPas pertinent ? Répondez simplement « non » et je ne vous recontacterai plus.`, recipientEmail: email, sentAt, dryRun: true, idempotencyKey: `seed:initial:${index}` } });
    }
    if ([1, 3, 7, 9].includes(index)) {
      const classification = index === 1 ? "MEETING_REQUEST" : index === 7 ? "QUESTION" : "POSITIVE";
      const body = index === 1 ? "Bonjour Matthew, pouvons-nous organiser un appel cette semaine ?" : index === 7 ? "Pouvez-vous garantir que la migration sera terminée vendredi ?" : "Oui, cela nous serait utile. Envoyez-moi les grandes lignes.";
      await db.message.upsert({ where: { idempotencyKey: `seed:reply:${index}` }, update: {}, create: { leadId: lead.id, direction: "INBOUND", type: "REPLY", status: "RECEIVED", subject: "Re : Une question sur vos opérations", body, receivedAt: new Date(), aiClassification: classification, aiConfidence: .96, idempotencyKey: `seed:reply:${index}` } });
      await db.conversation.upsert({ where: { leadId: lead.id }, update: {}, create: { leadId: lead.id, status: [1,7].includes(index) ? "HANDOFF" : "OPEN", sentiment: "POSITIVE", intent: classification, requiresHuman: [1,7].includes(index) } });
      await db.lead.update({ where: { id: lead.id }, data: { sequenceStopped: true } });
    }
    if ([0, 1, 4, 7].includes(index)) {
      await db.reviewItem.upsert({ where: { id: `seed:review:${index}` }, update: {}, create: { id: `seed:review:${index}`, leadId: lead.id, type: [1,7].includes(index) ? "HANDOFF" : "REVIEW", title: index === 1 ? "Rendez-vous demandé" : index === 7 ? "Engagement ferme sur un délai demandé" : "Valider la première approche", description: index === 7 ? "Une garantie de délai demande l’avis de Matthew." : "Vérifiez le contexte et confirmez la suite.", proposedAction: [1,7].includes(index) ? "Matthew reprend la conversation" : "Générer et relire une introduction sur mesure" } });
    }
    await db.activityLog.upsert({ where: { id: `seed:activity:${index}` }, update: {}, create: { id: `seed:activity:${index}`, action: "lead.seeded", entityType: "Lead", entityId: lead.id, message: `${name} : lead de démonstration prêt (${score}/100)`, metadata: { dryRun: true, fixture: true }, createdAt } });
  }
  console.log("Seed terminé : compte administrateur, 3 familles d’offres, 10 entreprises/contacts/leads fictifs et quelques conversations. Les données existantes sont conservées.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
