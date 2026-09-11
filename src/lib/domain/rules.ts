import { createHash } from "node:crypto";
import { z } from "zod";
import type { ReplyCategory, ScoreResult } from "../providers/types";

export const SCORE_WEIGHTS = { fitScore: 30, valueScore: 25, deliverabilityScore: 20, clientQualityScore: 15, recurringPotentialScore: 10 } as const;
export function normalizeScore(score: ScoreResult): ScoreResult {
  const bounded = { ...score };
  for (const key of Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]) bounded[key] = Math.max(0, Math.min(SCORE_WEIGHTS[key], Math.round(Number.isFinite(score[key]) ? score[key] : 0)));
  bounded.totalScore = Object.keys(SCORE_WEIGHTS).reduce((sum, key) => sum + bounded[key as keyof typeof SCORE_WEIGHTS], 0);
  bounded.confidence = Math.max(0, Math.min(1, Number.isFinite(score.confidence) ? score.confidence : 0));
  return bounded;
}
export function scoreStatus(score: number) { return score >= 75 ? "QUALIFIED" : score >= 65 ? "REVIEW" : score >= 50 ? "WATCH" : "IGNORE"; }
export function normalizeDomain(input: string): string {
  const parsed = new URL(/^[a-z]+:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("A public HTTP(S) company website is required");
  const domain = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!domain.includes(".") || domain === "localhost" || domain.endsWith(".localhost") || /^\d+(\.\d+){3}$/.test(domain) || domain.includes(":")) throw new Error("A public company domain is required");
  return domain;
}
export function normalizeEmail(email: string): string { return z.email().parse(email.trim().toLowerCase()); }
export function isReservedEmail(email: string): boolean { return /@(?:[^@]+\.)?(?:example\.(?:com|org|net)|example|test|invalid|localhost|local)$/i.test(email); }
export function leadDedupeKey(input: { domain: string; email?: string | null; contact?: string | null; externalId?: string | null }): string {
  const key = input.email ? `email:${normalizeEmail(input.email)}` : input.externalId ? `opportunity:${input.externalId.trim()}` : `company:${normalizeDomain(input.domain)}:${(input.contact || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
  return createHash("sha256").update(key).digest("hex");
}

const RISK_PATTERNS: [string, RegExp][] = [
  ["Contract or binding terms", /\b(contract|contrat|nda|legal agreement|terms and conditions|conditions contractuelles)\b/i],
  ["Negotiated price or discount", /\b(discount|remise|reduction|réduction|negotia\w*|négocia\w*|final price|prix final|price match|cheaper|moins cher)\b/i],
  ["Firm delivery commitment", /\b(guarantee\w*|garanti\w*|commit\w*|engage\w*|deadline|date ferme|livraison ferme|by (?:next )?(?:monday|tuesday|wednesday|thursday|friday|20\d{2}-\d{2}-\d{2})|avant (lundi|mardi|mercredi|jeudi|vendredi)|(?:deliver|finish|ship|complete|livrer|terminer).{0,35}(?:within|in|sous|en) \d+ (?:days?|hours?|jours?|heures?))\b/i],
  ["Material scope change", /\b(scope change|change.*scope|entire platform|whole platform|full migration|complete rewrite|changement.*périmètre|refonte complète|migration complète)\b/i],
  ["Complex technical architecture", /\b(architecture|microservices|distributed systems|multi[- ]region|kubernetes|high availability|haute disponibilit)\w*/i],
  ["Regulatory or sensitive security request", /\b(gdpr|rgpd|hipaa|pci|soc ?2|regulat\w*|réglement\w*|compliance|conformité|cyber\w*|penetration test|pentest|security audit|audit de sécurité)\b/i],
  ["Critical system access", /\b(root access|admin access|production access|credentials|password|secret key|accès (root|admin|production)|mot de passe|clé secrète)\b/i],
];
export function foldAccents(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
export function detectRisks(body: string): string[] { return RISK_PATTERNS.filter(([, pattern]) => new RegExp(foldAccents(pattern.source), pattern.flags).test(foldAccents(body))).map(([reason]) => reason); }
export function evaluateAutopilot(input: { body: string; category?: ReplyCategory; confidence?: number; autopilotEnabled: boolean; threshold?: number }): { mode: "AUTOPILOT" | "REVIEW" | "HANDOFF"; reasons: string[] } {
  const risks = detectRisks(input.body);
  if (input.category === "MEETING_REQUEST" || input.category === "NEGOTIATION") risks.push("A human must own this conversation");
  if (risks.length) return { mode: "HANDOFF", reasons: risks };
  if (!input.autopilotEnabled) return { mode: "REVIEW", reasons: ["Autopilot is disabled"] };
  if (input.category && !["POSITIVE", "QUESTION"].includes(input.category)) return { mode: "REVIEW", reasons: ["This reply is not eligible for an automatic response"] };
  if (input.category && (input.confidence ?? 0) <= Math.max(0.85, input.threshold ?? 0.85)) return { mode: "REVIEW", reasons: ["Reply confidence must exceed the configured threshold"] };
  return { mode: "AUTOPILOT", reasons: [] };
}
export function followupAt(firstSentAt: Date, step: number, hasReply = false, stopped = false): Date | null {
  if (hasReply || stopped || ![1, 2].includes(step)) return null;
  return new Date(firstSentAt.getTime() + (step === 1 ? 3 : 7) * 86400000);
}
export function suppressionReason(input: { email: string | null; emailStatus: string; suppressed?: boolean; isDemo?: boolean; dryRun?: boolean }): string | null {
  if (input.suppressed) return "Recipient is blacklisted or suppressed";
  if (!input.email || !z.email().safeParse(input.email).success) return "Recipient has no valid email";
  if (["BOUNCED", "COMPLAINT", "INVALID", "UNSUBSCRIBED", "BLACKLISTED"].includes(input.emailStatus.toUpperCase())) return "Recipient email is blocked";
  if (!input.dryRun && (input.isDemo || isReservedEmail(input.email))) return "Development contacts cannot receive live email";
  if (!input.dryRun && input.emailStatus.toUpperCase() !== "VERIFIED") return "Live sending requires a verified email";
  return null;
}
export function languageFor(country?: string, preferred?: string): "fr" | "en" { return preferred === "fr" || /^(fr|france|belgique francophone|wallonia)$/i.test(country || "") ? "fr" : "en"; }

export function normalizedCountry(value?: string | null): string | null {
  const name = foldAccents(value || '').trim().toLowerCase().replace(/[.]/g, '');
  const countries: Record<string, string> = {
    us:'US', usa:'US', 'united states':'US', 'united states of america':'US', 'etats-unis':'US',
    uk:'UK', gb:'UK', 'united kingdom':'UK', 'royaume-uni':'UK',
    ca:'CA', canada:'CA', fr:'FR', france:'FR', be:'BE', belgium:'BE', belgique:'BE',
    nl:'NL', netherlands:'NL', 'pays-bas':'NL', de:'DE', germany:'DE', allemagne:'DE',
    lu:'LU', luxembourg:'LU', ch:'CH', switzerland:'CH', suisse:'CH',
    ie:'IE', ireland:'IE', irlande:'IE', eire:'IE',
    es:'ES', spain:'ES', espagne:'ES', it:'IT', italy:'IT', italie:'IT',
  };
  return countries[name] ?? null;
}

const COUNTRY_LABEL: Record<string, string> = { US: "United States", UK: "United Kingdom", CA: "Canada", IE: "Ireland", FR: "France", BE: "Belgique", NL: "Pays-Bas", DE: "Allemagne", LU: "Luxembourg", CH: "Suisse", ES: "Espagne", IT: "Italie" };
/** A search engine answers "PME logistique France" far better than "PME logistique FR". */
// A search result title describes a page, not a business: "Entreprise de logistique et
// stockage de marchandises, préparation de commandes…" is a headline, and it ends up in the
// subject line of every email. When the title reads as a sentence, the domain is the better name.
const DESCRIPTIVE_TITLE = /^(entreprise|societe|prestataire|specialiste|fournisseur|expert|agence|cabinet|groupe|service|solution|logistique|transport|accueil|bienvenue|home|welcome|about|a propos|contact|nos|notre|le|la|les|un|une|votre|vos|your|our|the)\b/i;
export function domainLabel(domain: string): string {
  const parts = domain.split(".");
  const suffix = parts.slice(-2).join(".");
  const index = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/i.test(suffix) ? parts.length - 3 : parts.length - 2;
  const label = parts[Math.max(0, index)] || parts[0] || domain;
  const words = label.split("-").filter(Boolean);
  if (!words.length) return domain;
  return words.map(word => word.length <= 4 && !/[aeiouy]/i.test(word.replace(/\d/g, "")) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
/**
 * "Shopify & E-commerce Agency" is what a page is called, not what a company is called. A title
 * built only from sector words and platform names identifies nobody, and the domain does.
 */
const GENERIC_WORD = /^(agence|agency|studio|atelier|cabinet|groupe|group|societe|company|conseil|consulting|digital|digitale|web|ecommerce|e|commerce|marketing|solutions?|services?|expert|experts|expertise|specialiste|partner|partners|france|paris|lyon|shopify|prestashop|woocommerce|wordpress|magento|saas|the|and|et|de|du|des|la|le|les|pour|en)$/i;

export function companyNameFrom(title: string, domain: string): string {
  const head = (title || "").split(/ [|–—•·:] | - /)[0].trim().replace(/\s+/g, " ");
  const words = head ? head.split(" ") : [];
  // "&" and other punctuation carry no identity either way: judge on the actual words.
  const letters = words.map(word => foldAccents(word).replace(/[^\p{L}]/gu, "")).filter(Boolean);
  const anonymous = letters.length > 0 && letters.every(word => GENERIC_WORD.test(word));
  const descriptive = !head || head.length > 48 || words.length > 5 || head.includes(",") || DESCRIPTIVE_TITLE.test(foldAccents(head));
  return descriptive || anonymous ? domainLabel(domain) : head.slice(0, 120);
}

export function countryLabel(value?: string | null): string {
  const code = normalizedCountry(value);
  return code ? COUNTRY_LABEL[code] : (value || "").trim();
}

export function campaignTargetingReason(company: {country?: string | null; employeeEstimate?: number | null}, campaign?: {country: string; employeesMin: number; employeesMax: number} | null): string | null {
  const country = normalizedCountry(company.country);
  if (!country) return 'Pays du prospect non confirmé ou hors des marchés ciblés : validation humaine requise.';
  if (campaign && normalizedCountry(campaign.country) !== country) return 'Le pays du prospect ne correspond pas au ciblage de la campagne.';
  if (company.employeeEstimate == null) return 'Effectif du prospect inconnu : validation humaine requise.';
  if (company.employeeEstimate < (campaign?.employeesMin ?? 5) || company.employeeEstimate > (campaign?.employeesMax ?? 200)) return 'L’effectif du prospect est hors du ciblage de la campagne.';
  return null;
}

export function hasAuthenticatedSender(authenticationResults: string): boolean {
  const failed = /\b(?:dmarc|dkim|spf)\s*=\s*(?:fail|softfail|permerror)/i.test(authenticationResults);
  const aligned = /\bdmarc\s*=\s*pass\b/i.test(authenticationResults);
  return aligned && !failed;
}

/**
 * Text arriving from web pages, forwarded emails and CSV files carries control characters
 * PostgreSQL refuses outright (NUL) and invisible formatting characters that corrupt names.
 * Cleaning happens once, at the boundary, rather than at every write.
 */
export function sanitizeExternalText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One sentinel for "not established", written the way the workspace displays it. */
export const UNKNOWN = "Inconnu";
export const isUnknown = (value?: string | null) => !value || /^(unknown|inconnue?s?|non\s+(?:v\u00e9rifi\u00e9e?s?|connue?s?))$/i.test(value.trim());

const COUNTRY_BY_TLD: Record<string, string> = { uk: "Royaume-Uni", fr: "France", de: "Allemagne", nl: "Pays-Bas", be: "Belgique", ch: "Suisse", lu: "Luxembourg", ca: "Canada", ie: "Irlande", es: "Espagne", it: "Italie", us: "États-Unis" };
/** A country-code domain is weak but real evidence; a generic .com says nothing and stays unknown. */
export function countryFromDomain(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  return COUNTRY_BY_TLD[parts[parts.length - 1]] ?? UNKNOWN;
}

type ResearchInput = { field: string; value: string; status: string };
/**
 * Research facts are evidence, but scoring reads the company record. Without this the country,
 * size and sector stay "Unknown" for every discovered company and no real lead can qualify.
 */
export function companyProfileFromResearch(facts: ResearchInput[]) {
  const usable = facts.filter(fact => fact.status !== "unknown" && !isUnknown(fact.value));
  const valueOf = (pattern: RegExp) => usable.find(fact => pattern.test(fact.field))?.value.trim();
  const profile: { country?: string; industry?: string; description?: string; employeeEstimate?: number; technologies?: string[] } = {};
  const country = valueOf(/^country$/i);
  // A country is a short name, never a sentence the model wrote around one.
  if (country && country.length <= 40 && country.split(/\s+/).length <= 4 && /^[\p{L}\s'.-]+$/u.test(country)) profile.country = country;
  const industry = valueOf(/industry|sector/i);
  if (industry && industry.length <= 80) profile.industry = industry.split(/[.\n]/)[0].trim();
  const size = valueOf(/size|employee|headcount/i);
  const numbers = size?.match(/\d[\d ,.]*/g)?.map(value => Number(value.replace(/[^\d]/g, ""))).filter(value => value > 0 && value <= 100000) ?? [];
  if (numbers.length) profile.employeeEstimate = Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
  const description = valueOf(/business|description|about/i);
  if (description) profile.description = description.slice(0, 1000);
  const technologies = [...new Set(usable.filter(fact => /technolog|ecommerce|crm|automation|tool|platform/i.test(fact.field)).map(fact => fact.value.trim()).filter(value => value.length <= 60))];
  if (technologies.length) profile.technologies = technologies.slice(0, 12);
  return profile;
}
