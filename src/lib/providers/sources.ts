import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { companyNameFrom, countryFromDomain, normalizeDomain, normalizeEmail, sanitizeExternalText, UNKNOWN } from "../domain/rules";
import { consumeBudget, isBudgetError } from "./budget";
import type { ContactInput, LeadSourceAdapter, RawOpportunity } from "./types";

const searchSchema = z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string().default(""), raw_content: z.string().nullable().optional() })) });
export async function tavilySearch(query: string, domains?: string[]) {
  if (!process.env.TAVILY_API_KEY) return [];
  // One Tavily credit per call: reserve it before spending it.
  await consumeBudget("tavily.search");
  const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, max_results: 8, search_depth: "basic", include_raw_content: "text", ...(domains ? { include_domains: domains } : {}) }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`La recherche Tavily a échoué (${response.status}).`);
  return searchSchema.parse(await response.json()).results;
}
// Search engines answer "shopify agencies UK" with articles ranking agencies, not with the
// agencies themselves. Publishers, directories and listicles are dropped before they consume
// a contact-discovery credit or reach the workspace as a prospect.
const AGGREGATOR_DOMAIN = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|pinterest\.[a-z.]+|clutch\.co|upwork\.com|fiverr\.com|wikipedia\.org|youtube\.com|reddit\.com|quora\.com|medium\.com|substack\.com|blogspot\.com|wordpress\.com|g2\.com|capterra\.com|trustpilot\.com|yelp\.[a-z.]+|glassdoor\.[a-z.]+|indeed\.[a-z.]+|francetravail\.fr|pole-emploi\.fr|apec\.fr|hellowork\.com|welcometothejungle\.com|jobteaser\.com|monster\.[a-z.]+|stepstone\.[a-z.]+|totaljobs\.com|reed\.co\.uk|irishjobs\.ie|cadremploi\.fr|meteojob\.com|jobijoba\.com|crunchbase\.com|producthunt\.com|gouv\.fr|gov|gov\.uk|gov\.ie|europa\.eu|admin\.ch|gc\.ca|belgium\.be|service-public\.fr|data\.gouv\.fr|designrush\.com|goodfirms\.co|sortlist\.[a-z.]+|semrush\.com|ahrefs\.com|hubspot\.com|shopify\.com|wix\.com|squarespace\.com)$/i;
const ARTICLE_PATH = /\/(blogs?|articles?|news|guides?|resources?|insights?|magazine|posts?|press|actualites?|actus?|conseils?|dossiers?|astuces|publications?|livres?-blancs?|a-la-une)(\/|$)|\/20\d\d\/|-(guide|dossier|livre-blanc|checklist|comparatif)-20\d\d(\/|$|\.)/i;
// Editorial titles ask a question or rank things; company home pages state who they are.
const LISTICLE_TITLE = /^\s*\[pdf\]|^\s*\d{1,3}\s+(\p{L}+\s+){2,}|\b(les|nos|the)\s+\d{1,3}\s+\p{L}|^\s*(the\s+)?(top|best)\b|^\s*(where|how|what|why|which|when)\b|^\s*(comment|pourquoi|quels?|quelles?|quand|combien)\b|\b(top|best)\s*\d+|\b\d{1,3}\s*\+?\s+(best|top|leading|great)\b|\b(les|nos)\s+\d{1,3}\s+(meilleurs?|meilleures?)\b|\b\d{1,3}\s+(meilleurs?|meilleures?|astuces?|conseils?|raisons?|[eé]tapes?|outils?)\b|\b(listicle|roundup|ranking|directory|comparison|alternatives|ultimate guide)\b|\b(guide (complet|ultime|pratique)|tout savoir|livre blanc|comparatif|classement|palmar[eè]s|d[eé]finition|checklist)\b/iu;
export function looksLikeDirectory(url: string, title: string) {
  let path = "";
  try { path = new URL(url).pathname; } catch { path = url; }
  // A PDF is a document, never a company home page.
  if (/.pdf$/i.test(path)) return true;
  return ARTICLE_PATH.test(path) || LISTICLE_TITLE.test(title);
}
const stripMarkup = (value: string) => value.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]{0,300}>/g, " ");

export class TavilyLeadSourceAdapter implements LeadSourceAdapter {
  async discover(query: string): Promise<RawOpportunity[]> {
    if (!query.trim()) throw new Error("Saisissez une requête de recherche.");
    if (!process.env.TAVILY_API_KEY) return developmentDiscovery(query);
    const results = await tavilySearch(query);
    const seen = new Set<string>();
    const companies = results.flatMap(result => {
      let domain: string;
      try { domain = normalizeDomain(result.url); } catch { return []; }
      if (seen.has(domain) || AGGREGATOR_DOMAIN.test(domain)) return [];
      if (looksLikeDirectory(result.url, stripMarkup(result.title))) return [];
      seen.add(domain);
      const title = sanitizeExternalText(stripMarkup(result.title));
      const content = sanitizeExternalText(stripMarkup(result.content));
      return [{ externalId: `tavily:${domain}`, company: { name: companyNameFrom(title, domain), domain, website: `https://${domain}`, description: content, country: countryFromDomain(domain), industry: UNKNOWN, isDemo: false }, title: title || domain, description: content, source: "TAVILY", sourceUrl: result.url, rawPayload: { query, retrievedAt: new Date().toISOString(), snippet: content } }];
    });
    if (!companies.length && results.length) throw new Error(`${results.length} résultat(s) trouvé(s), mais tous sont des articles, classements ou annuaires plutôt que des entreprises. Décrivez les entreprises elles-mêmes, par exemple « marque de skincare indépendante Londres Shopify » plutôt que « meilleures agences Shopify ».`);
    return companies;
  }
}
function developmentDiscovery(query: string): RawOpportunity[] {
  const key = createHash("sha256").update(query.toLowerCase().trim()).digest("hex").slice(0, 6);
  return ["Harbour", "Northstar", "Meridian"].map((name, index) => ({ externalId: `development:${key}:${index}`, company: { name: `${name} Operations [Demo]`, domain: `${name.toLowerCase()}-${key}.example.com`, website: `https://${name.toLowerCase()}-${key}.example.com`, country: /france/i.test(query) ? "France" : "États-Unis", industry: /agence|agency|agencies/i.test(query) ? "Agence digitale" : "Ecommerce", employeeEstimate: 12 + index * 15, description: `Exemple de démonstration pour « ${query} ». Équipe fictive qui explore le reporting sur tableur et l’automatisation.`, technologies: ["Spreadsheets"], isDemo: true }, contact: { fullName: ["Alex Morgan", "Camille Martin", "Jordan Lee"][index], firstName: ["Alex", "Camille", "Jordan"][index], jobTitle: "Responsable des opérations", email: `operations@${name.toLowerCase()}-${key}.example.com`, emailStatus: "DEMO", source: "DEVELOPMENT_FIXTURE", language: /france/i.test(query) ? "fr" : "en" }, title: "Exemple de démonstration : simplifier le reporting opérationnel", description: `Exemple de démonstration explicite, pas une opportunité réelle. Recherche : ${query}`, source: "DEVELOPMENT_FIXTURE", sourceUrl: `https://${name.toLowerCase()}-${key}.example.com`, rawPayload: { developmentFixture: true, query } }));
}
export function createLeadSourceAdapter(): LeadSourceAdapter { return new TavilyLeadSourceAdapter(); }

const hunterSchema = z.object({ data: z.object({ emails: z.array(z.object({ value: z.string(), first_name: z.string().nullable().optional(), last_name: z.string().nullable().optional(), position: z.string().nullable().optional(), linkedin: z.string().nullable().optional(), confidence: z.number().optional(), verification: z.object({ status: z.string().nullable().optional(), date: z.string().nullable().optional() }).nullable().optional(), sources: z.array(z.object({ uri: z.string().optional(), domain: z.string().optional() })).optional() })) }) });
type HunterEmail = z.infer<typeof hunterSchema>["data"]["emails"][number];
function contactFrom(selected: HunterEmail, domain: string, status: string | null | undefined): ContactInput {
  const firstName = sanitizeExternalText(selected.first_name || ""), lastName = sanitizeExternalText(selected.last_name || "");
  return { fullName: [firstName, lastName].filter(Boolean).join(" ") || normalizeEmail(selected.value), firstName, lastName, jobTitle: sanitizeExternalText(selected.position || ""), email: normalizeEmail(selected.value), emailStatus: status === "valid" ? "VERIFIED" : status === "invalid" ? "INVALID" : "UNKNOWN", linkedinUrl: selected.linkedin || null, source: JSON.stringify({ provider: "HUNTER", domain, status: status ?? "unverified", verifiedAt: new Date().toISOString(), sources: selected.sources || [] }) };
}
export async function findContact(domainInput: string, employeeEstimate?: number | null, technical = false): Promise<ContactInput | null> {
  const domain = normalizeDomain(domainInput);
  if (!process.env.HUNTER_API_KEY || domain.endsWith(".example.com")) return null;
  await consumeBudget("hunter.search");
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", domain); url.searchParams.set("api_key", process.env.HUNTER_API_KEY); url.searchParams.set("limit", "10");
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`La recherche de contact Hunter a échoué (${response.status}).`);
  const data = hunterSchema.parse(await response.json());
  const priority = technical ? /cto|tech lead|technology/i : (employeeEstimate ?? 20) <= 30 ? /founder|ceo|managing director/i : /coo|operations|ecommerce/i;
  const candidates = data.data.emails.filter(item => z.email().safeParse(item.value).success).sort((a, b) => (Number(priority.test(b.position || "")) * 200 + (b.confidence || 0)) - (Number(priority.test(a.position || "")) * 200 + (a.confidence || 0)));
  const selected = candidates[0];
  if (!selected) return null;
  let status = selected.verification?.status;
  // Search confidence is not verification. Verify the selected address when necessary.
  if (status !== "valid") {
    // Without a verification call the address stays UNKNOWN: an unverified contact is never emailed automatically.
    try { await consumeBudget("hunter.verify"); } catch (error) { if (isBudgetError(error)) return contactFrom(selected, domain, undefined); throw error; }
    const verifyUrl = new URL("https://api.hunter.io/v2/email-verifier");
    verifyUrl.searchParams.set("email", selected.value); verifyUrl.searchParams.set("api_key", process.env.HUNTER_API_KEY);
    const verification = await fetch(verifyUrl, { signal: AbortSignal.timeout(30000) });
    if (!verification.ok) throw new Error(`La vérification d’email Hunter a échoué (${verification.status}).`);
    status = z.object({ data: z.object({ status: z.string() }) }).parse(await verification.json()).data.status;
  }
  return contactFrom(selected, domain, status);
}

const rowSchema = z.object({ company: z.string().min(1), website: z.string().min(1), contact: z.string().optional(), email: z.string().optional(), job_title: z.string().optional(), opportunity: z.string().optional(), source_url: z.string().optional() });
export function parseManualCsv(csv: string): RawOpportunity[] {
  if (Buffer.byteLength(csv, "utf8") > 2_000_000) throw new Error("L’import CSV est limité à 2 Mo.");
  const rows = parse(csv, { columns: (headers: string[]) => headers.map(h => h.trim().toLowerCase()), bom: true, skip_empty_lines: true, trim: true, max_record_size: 25000 }) as unknown[];
  if (rows.length > 1000) throw new Error("Importez au maximum 1 000 lignes à la fois.");
  return rows.map((raw, index) => {
    const row = rowSchema.parse(raw);
    const domain = normalizeDomain(row.website);
    const email = row.email ? normalizeEmail(row.email) : null;
    return { company: { name: sanitizeExternalText(row.company), domain, website: `https://${domain}`, isDemo: false }, contact: row.contact || email ? { fullName: sanitizeExternalText(row.contact || "") || "Nom du contact indisponible", email, emailStatus: "UNKNOWN", jobTitle: row.job_title || "", source: `MANUAL_CSV:row:${index + 2}` } : undefined, title: sanitizeExternalText(row.opportunity || `Prospect ajouté à la main : ${row.company}`), description: sanitizeExternalText(row.opportunity || "Importé par le propriétaire de l’espace"), source: "MANUAL_CSV", sourceUrl: row.source_url || `https://${domain}`, rawPayload: { row: index + 2 } };
  });
}
export function parseEmailAlert(input: { subject: string; body: string; sourceUrl?: string }): RawOpportunity[] {
  const urls = input.sourceUrl ? [input.sourceUrl] : input.body.match(/https?:\/\/[^\s<>"\)]+/g) || [];
  return [...new Set(urls)].slice(0, 20).flatMap(url => {
    let domain: string;
    try { domain = normalizeDomain(url); } catch { return []; }
    return [{ externalId: `email-alert:${createHash("sha256").update(`${input.subject}:${url}`).digest("hex")}`, company: { name: domain, domain, website: `https://${domain}`, description: "Identité de l’entreprise à vérifier : importée depuis l’URL d’une alerte transférée.", isDemo: false }, title: sanitizeExternalText(input.subject), description: sanitizeExternalText(input.body.slice(0, 20000)), source: "EMAIL_ALERT", sourceUrl: url, rawPayload: { identityUnverified: true } }];
  });
}
