import { describe, expect, it } from "vitest";
import { classifyReplyRules, companyProfileFromResearch, countryFromDomain, evaluateAutopilot, followupAt, hasAuthenticatedSender, leadDedupeKey, normalizeDomain, normalizeEmail, normalizeScore, sanitizeExternalText, scoreStatus, suppressionReason, validateOffer } from "../../src/lib/domain";
import { DevelopmentAIService } from "../../src/lib/providers/ai";
import type { LeadContext, OfferTemplateInput, ReplyCategory } from "../../src/lib/providers/types";

const context: LeadContext = { company: { name: "Example Logistics", domain: "logistics.example.com", website: "https://logistics.example.com", country: "France", industry: "logistics", employeeEstimate: 45, description: "Spreadsheet reporting automation", isDemo: true }, contact: { fullName: "Camille Martin", email: "camille@logistics.example.com", emailStatus: "DEMO", language: "fr" } };
const templates: OfferTemplateInput[] = [{ id: "workflow", name: "Workflow Rescue", slug: "workflow-rescue", description: "Simplify a workflow", minPrice: 600, maxPrice: 1200, typicalDeliveryDays: "2–5 days", enabled: true }, { id: "tool", name: "Internal Tool Sprint", slug: "internal-tool-sprint", description: "Build an internal tool", minPrice: 1500, maxPrice: 3000, typicalDeliveryDays: "5–10 days", enabled: true }, { id: "data", name: "Ops & Data Cleanup", slug: "ops-data-cleanup", description: "Improve data", minPrice: 800, maxPrice: 1800, typicalDeliveryDays: "3–7 days", enabled: true }];
describe("lead scoring", () => {
  it("bounds each weighted component and recomputes the total", () => {
    const score = normalizeScore({ fitScore: 200, valueScore: -2, deliverabilityScore: 30, clientQualityScore: 16, recurringPotentialScore: Number.NaN, totalScore: 99, confidence: 3, detectedProblems: [], reasoning: "test" });
    expect(score).toMatchObject({ fitScore: 30, valueScore: 0, deliverabilityScore: 20, clientQualityScore: 15, recurringPotentialScore: 0, totalScore: 65, confidence: 1 });
  });
  it.each([[0, "IGNORE"], [49, "IGNORE"], [50, "WATCH"], [64, "WATCH"], [65, "REVIEW"], [74, "REVIEW"], [75, "QUALIFIED"], [100, "QUALIFIED"]])("maps %s to %s", (score, status) => { expect(scoreStatus(score as number)).toBe(status); });
  it("does not score an unknown real address as deliverable", async () => { const ai = new DevelopmentAIService(); const result = await ai.score({ ...context, company: { ...context.company, isDemo: false }, contact: { ...context.contact!, emailStatus: "UNKNOWN" } }); expect(result.deliverabilityScore).toBe(5); expect(result.reasoning).toContain("Heuristique locale"); });
});
describe("deduplication", () => {
  it("normalizes web domains, email case and contact spacing", () => { expect(normalizeDomain("https://WWW.Example.COM/path?q=1")).toBe("example.com"); expect(normalizeEmail(" A@Example.com ")).toBe("a@example.com"); expect(leadDedupeKey({ domain: "www.example.com", contact: "  Jane   Doe " })).toBe(leadDedupeKey({ domain: "https://example.com", contact: "jane doe" })); });
  it("deduplicates emails across sources and domains", () => { expect(leadDedupeKey({ domain: "a.com", email: "Jane@Example.com", externalId: "one" })).toBe(leadDedupeKey({ domain: "b.com", email: "jane@example.com", externalId: "two" })); });
  it("deduplicates external opportunities", () => { expect(leadDedupeKey({ domain: "a.com", externalId: "upwork:123" })).toBe(leadDedupeKey({ domain: "b.com", externalId: "upwork:123" })); });
  it.each(["localhost", "https://app.localhost", "http://127.0.0.1", "file:///etc/passwd", "https://name:password@example.com"])("rejects unsafe company address %s", address => { expect(() => normalizeDomain(address)).toThrow(); });
});
describe("autopilot policy", () => {
  it.each([
    'Can you deliver within 2 days?',
    'Can you finish in 3 days?',
    'Pouvez-vous livrer sous 2 jours ?',
    'We will deliver by next Friday.',
    'This must ship by 2026-12-31.',
  ])('hands off deadline requests: %s', body => {
    expect(evaluateAutopilot({ body, autopilotEnabled: true }).mode).toBe('HANDOFF');
  });
  it.each(["Please sign the contract", "Pouvez-vous proposer une remise ?", "We guarantee delivery by Friday", "Pouvez-vous confirmer une date ferme ?", "We need a complex architecture", "How do you handle GDPR compliance?", "Pouvez-vous réaliser un audit de sécurité ?", "Send production access credentials", "Donnez un accès admin", "A complete rewrite of the platform"])("hands off risk: %s", body => { expect(evaluateAutopilot({ body, autopilotEnabled: true, category: "QUESTION", confidence: 1 }).mode).toBe("HANDOFF"); });
  it("requires confidence strictly above 0.85 and the configured threshold", () => { expect(evaluateAutopilot({ body: "What do you do?", autopilotEnabled: true, category: "QUESTION", confidence: 0.85 }).mode).toBe("REVIEW"); expect(evaluateAutopilot({ body: "What do you do?", autopilotEnabled: true, category: "QUESTION", confidence: 0.91, threshold: 0.92 }).mode).toBe("REVIEW"); expect(evaluateAutopilot({ body: "What do you do?", autopilotEnabled: true, category: "QUESTION", confidence: 0.94 }).mode).toBe("AUTOPILOT"); });
  it("honors master switch and meeting handoff", () => { expect(evaluateAutopilot({ body: "Hello", autopilotEnabled: false }).mode).toBe("REVIEW"); expect(evaluateAutopilot({ body: "Tomorrow", autopilotEnabled: true, category: "MEETING_REQUEST", confidence: 1 }).mode).toBe("HANDOFF"); });
});
describe('incoming sender authentication', () => {
  it.each(['', 'spf=pass', 'dkim=pass', 'dmarc=none', 'dmarc=fail', 'dmarc=pass; spf=softfail', 'dmarc=pass; dkim=permerror'])(
    'requires human verification for missing or failed alignment: %s',
    header => expect(hasAuthenticatedSender(header)).toBe(false),
  );
  it('allows automated handling only with successful alignment and no explicit failure', () => {
    expect(hasAuthenticatedSender('mx.example; spf=pass; dkim=pass; dmarc=pass')).toBe(true);
  });
});
describe("bilingual reply classification", () => {
  const cases: [string, ReplyCategory][] = [["Sounds good, send me details", "POSITIVE"], ["Oui volontiers, envoyez les détails", "POSITIVE"], ["How does it work?", "QUESTION"], ["Comment cela fonctionne ?", "QUESTION"], ["Maybe next quarter", "NOT_NOW"], ["Recontactez-moi plus tard", "NOT_NOW"], ["Not interested, thanks", "NOT_INTERESTED"], ["Non merci", "NOT_INTERESTED"], ["Contact our operations manager", "REFERRAL"], ["Contactez notre responsable", "REFERRAL"], ["Let's schedule a call", "MEETING_REQUEST"], ["Avez-vous un créneau pour un rendez-vous ?", "MEETING_REQUEST"], ["Can you offer a discount?", "NEGOTIATION"], ["Une remise est-elle possible ?", "NEGOTIATION"], ["Please unsubscribe", "UNSUBSCRIBE"], ["Ne me contactez plus", "UNSUBSCRIBE"], ["No", "UNSUBSCRIBE"], ["Non", "UNSUBSCRIBE"], ["Out of office until 2027-01-15", "OUT_OF_OFFICE"], ["Je suis en congé jusqu'au 2027-01-15", "OUT_OF_OFFICE"], ["Purple monkey", "UNKNOWN"]];
  it.each(cases)("%s → %s", (body, category) => { expect(classifyReplyRules(body).category).toBe(category); });
  it("ignores opt-out text in quoted original mail", () => { expect(classifyReplyRules("Sounds good\nOn Monday Matthew wrote:\nReply no to unsubscribe").category).toBe("POSITIVE"); });
  it.each([
    'No.\n\nSarah\nOperations Director',
    'Non\n\nCamille Martin',
    'Stop!\nSent from my phone',
  ])('honors a short opt-out followed by a signature: %s', body => {
    expect(classifyReplyRules(body).category).toBe('UNSUBSCRIBE');
  });
  it('does not interpret the start of a longer positive sentence as an opt-out', () => {
    expect(classifyReplyRules('No problem, sounds good.').category).toBe('POSITIVE');
  });
  it("detects an explicit return date without inventing dates", () => { expect(classifyReplyRules("Out of office until 2027-01-15", new Date("2026-01-01")).returnDate).toBe("2027-01-15T09:00:00.000Z"); expect(classifyReplyRules("Out of office next week").returnDate).toBeNull(); });
});
describe("follow-up scheduling", () => {
  const first = new Date("2026-09-09T12:00:00Z");
  it("uses absolute day 3 and 7 from the initial message", () => { expect(followupAt(first, 1)?.toISOString()).toBe("2026-09-12T12:00:00.000Z"); expect(followupAt(first, 2)?.toISOString()).toBe("2026-09-16T12:00:00.000Z"); expect(followupAt(first, 3)).toBeNull(); });
  it("stops immediately on reply or explicit stop", () => { expect(followupAt(first, 1, true)).toBeNull(); expect(followupAt(first, 2, false, true)).toBeNull(); });
});
describe("blacklist and deliverability", () => {
  it.each(["person@company.example", "person@nested.example.com", "person@nested.localhost", "person@domain.invalid", "person@domain.test"])("blocks reserved address %s", email => { expect(suppressionReason({ email, emailStatus: "VERIFIED", dryRun: false })).toBeTruthy(); });
  it("blocks suppression even in dry run", () => { expect(suppressionReason({ email: "a@example.com", emailStatus: "VERIFIED", dryRun: true, suppressed: true })).toContain("suppressed"); });
  it.each(["BOUNCED", "COMPLAINT", "INVALID", "UNSUBSCRIBED", "BLACKLISTED"])("blocks %s", emailStatus => { expect(suppressionReason({ email: "a@real-domain.com", emailStatus, dryRun: true })).toBeTruthy(); });
  it("requires verified real addresses for live send", () => { expect(suppressionReason({ email: "a@business.com", emailStatus: "UNKNOWN", dryRun: false })).toBeTruthy(); expect(suppressionReason({ email: "a@example.com", emailStatus: "VERIFIED", dryRun: false })).toBeTruthy(); expect(suppressionReason({ email: "a@business.com", emailStatus: "VERIFIED", dryRun: false })).toBeNull(); });
});
describe("offer generation validation and factual safeguards", () => {
  it("generates an adaptive offer in an enabled family", async () => { const offer = await new DevelopmentAIService().generateOffer(context, templates); expect(offer.title).toContain("Example Logistics"); expect(offer.estimatedPriceMin).toBe(600); expect(validateOffer(offer, templates)).toEqual(offer); expect(offer.problem).toContain("Si"); });
  it("selects the data and internal tool families from the need", async () => { const ai = new DevelopmentAIService(); expect((await ai.generateOffer({ ...context, opportunity: { title: "Migration", description: "CRM cleanup and deduplication" } }, templates)).offerTemplateId).toBe("data"); expect((await ai.generateOffer({ ...context, opportunity: { title: "Portal", description: "An internal tool for logistics" } }, templates)).offerTemplateId).toBe("tool"); });
  it("rejects disabled families, inversions and out-of-range prices", async () => { const offer = await new DevelopmentAIService().generateOffer(context, templates); expect(() => validateOffer({ ...offer, offerTemplateId: "made-up" }, templates)).toThrow(); expect(() => validateOffer({ ...offer, estimatedPriceMin: 1300 }, templates)).toThrow(); expect(() => validateOffer({ ...offer, estimatedPriceMax: 3000 }, templates)).toThrow(); });
  it("does not mark fallback research verified", async () => { expect((await new DevelopmentAIService().research(context)).every(f => f.status !== "verified")).toBe(true); });
  it("uses conditional French outreach and a stop footer", async () => { const ai = new DevelopmentAIService(); const offer = await ai.generateOffer(context, templates); const draft = await ai.draftOutreach(context, offer, { senderName: "Matthew de Lamotte", companyName: "MDL Advisory", signature: "Matthew de Lamotte\nMDL Advisory" }); expect(draft.language).toBe("fr"); expect(draft.body).toContain("?"); expect(draft.body).not.toMatch(/\bvous (avez|utilisez|perdez)\b/); expect(draft.body).not.toMatch(/\bnous\b|\bnotre\b/i); expect(draft.body).toContain("ne vous recontacterai plus"); expect(draft.body.split(/\s+/).length).toBeLessThanOrEqual(125); });
});

describe("company profile derived from discovery and research", () => {
  it("reads a country from a country-code domain and stays silent on generic ones", () => {
    expect(countryFromDomain("bysarahlondon.com")).toBe("Inconnu");
    expect(countryFromDomain("harbourgoods.co.uk")).toBe("Royaume-Uni");
    expect(countryFromDomain("atelier-colis.fr")).toBe("France");
    expect(countryFromDomain("klarwerk.de")).toBe("Allemagne");
  });
  it("promotes established facts so scoring stops seeing Unknown", () => {
    const profile = companyProfileFromResearch([
      { field: "country", value: "Royaume-Uni", status: "verified" },
      { field: "industry", value: "Skincare ecommerce. Sells direct to consumers.", status: "inferred" },
      { field: "companySize", value: "between 20 and 30 employees", status: "inferred" },
      { field: "business", value: "Independent skincare brand for sensitive skin", status: "verified" },
      { field: "ecommerce", value: "Shopify", status: "verified" },
      { field: "crm", value: "Klaviyo", status: "inferred" },
    ]);
    expect(profile.country).toBe("Royaume-Uni");
    expect(profile.industry).toBe("Skincare ecommerce");
    expect(profile.employeeEstimate).toBe(25);
    expect(profile.description).toContain("sensitive skin");
    expect(profile.technologies).toEqual(["Shopify", "Klaviyo"]);
  });
  it("ignores unknown facts and implausible values", () => {
    const profile = companyProfileFromResearch([
      { field: "country", value: "Inconnu", status: "inferred" },
      { field: "companySize", value: "Inconnu", status: "unknown" },
      { field: "crm", value: "Inconnu", status: "unknown" },
      { field: "country", value: "Trusted by Macmillan Cancer Support and rated best", status: "inferred" },
    ]);
    expect(profile.country).toBeUndefined();
    expect(profile.employeeEstimate).toBeUndefined();
    expect(profile.technologies).toBeUndefined();
  });
});

describe("external text sanitation", () => {
  const NUL = String.fromCharCode(0), ZWJ = String.fromCharCode(0x200d), BOM = String.fromCharCode(0xfeff);
  const NL = String.fromCharCode(10), TAB = String.fromCharCode(9), EACUTE = String.fromCharCode(0xe9);
  it("removes characters PostgreSQL refuses while keeping legitimate content", () => {
    expect(sanitizeExternalText("Acme" + NUL + " Ltd")).toBe("Acme Ltd");
    expect(sanitizeExternalText("Boutique" + ZWJ + " Shopify" + BOM)).toBe("Boutique Shopify");
    const accented = "Soci" + EACUTE + "t" + EACUTE + " G" + EACUTE + "n" + EACUTE + "rale";
    expect(sanitizeExternalText("  " + accented + "  Operations ")).toBe(accented + " Operations");
    expect(sanitizeExternalText(String.fromCodePoint(0x1f680) + " Logistics")).toBe(String.fromCodePoint(0x1f680) + " Logistics");
  });
  it("keeps paragraph structure without runaway blank lines", () => {
    expect(sanitizeExternalText("One" + NL + NL + NL + NL + "Two")).toBe("One" + NL + NL + "Two");
    expect(sanitizeExternalText("Line" + TAB + "one" + NL + "Line two")).toBe("Line one" + NL + "Line two");
  });
});
