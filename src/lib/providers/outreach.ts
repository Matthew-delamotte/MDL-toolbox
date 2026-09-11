import type { AdaptiveOffer, DraftSettings, LeadContext } from "./types";
import { languageFor, normalizedCountry, UNKNOWN } from "../domain/rules";

/**
 * Cold outreach used to be a fixed template with one AI-written noun phrase dropped into it:
 * every prospect received the same four sentences. The model now writes the whole message from
 * verified research, inside guardrails, while the greeting, signature and opt-out line stay
 * deterministic so compliance never depends on a probabilistic output.
 *
 * Three things decide whether it reads as human, and each is enforced in code rather than merely
 * asked for in the prompt, because a model drops them first:
 *  - Matthew writes in his own name. "notre equipe" and "nous concevons" turn him into an agency
 *    and give the send away; "nous pouvons en discuter" means him and the reader, and is fine.
 *    What the email offers is a bespoke tool shaped around how the reader's team actually works.
 *  - The email must not diagnose. Asserting a problem nobody described reads as a template that
 *    guessed. The second paragraph asks how they actually work today, and must end in a question.
 *  - Length and consulting register: both are checked and sent back for one rewrite.
 */

export const MAX_WORDS: Record<number, number> = { 0: 110, 1: 70, 2: 45 };

/**
 * The closing carries the commercial promise, so its substance is fixed: one concrete intervention
 * drawn from the offer chosen for this lead, and a proposed exchange to pin down what they really
 * need. Its wording must not be fixed, or every prospect reads the same last sentence. The angle is
 * picked from the company domain: stable when a draft is regenerated, different between companies.
 */
const CLOSING_ANGLES = [
  "Close by naming the intervention plainly, then proposing an exchange to pin down what they actually need.",
  "Close by offering to look at it together: a conversation to identify where the friction really sits, and to build from there.",
  "Close on a conditional: if the friction sits where your question points, this is the shape of what you would build; otherwise propose an exchange to find the right target.",
  "Close by putting two paths side by side - the intervention you have in mind, or something defined together - and proposing an exchange to settle which one fits.",
  "Close by proposing an exchange to identify their real friction points, and saying you would then build what fits their own way of working.",
];

function pick<T>(list: T[], seed: string): T {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 100000;
  return list[hash % list.length];
}

export function closingAngle(seed: string): string {
  return pick(CLOSING_ANGLES, seed);
}

/**
 * Matthew adds a courtesy line above his signature on every message he sends by hand. It is a
 * French business convention, it costs nothing, and leaving it to the model means it appears
 * sometimes, misspelled, and eats into the word budget. Varied by company so it is not a tell.
 */
const SIGN_OFF_FR = [
  "Au plaisir d'échanger avec vous.",
  "Dans l'attente de votre retour.",
  "Au plaisir de vous lire.",
  "Au plaisir d'en discuter avec vous.",
];

const SIGN_OFF_EN = [
  "Looking forward to hearing from you.",
  "I look forward to your reply.",
  "Happy to talk it through whenever suits you.",
  "Looking forward to your thoughts.",
];

export function signOff(language: "fr" | "en", seed: string): string {
  return pick(language === "fr" ? SIGN_OFF_FR : SIGN_OFF_EN, seed);
}

const ANGLE: Record<number, string> = {
  0: "This is a first contact. Open on their business, never on yours.",
  1: "This is the second message, three days later. Never say you are following up or checking in, and never summarise the first email: the reader may not have opened it. Ask about a different, narrower part of how they work.",
  2: "This is the last message, a week later. Say plainly that you stop there, leave the door open without pressure, give an easy way to come back later. No new argument, no urgency, no guilt.",
};

const EXAMPLE_FR = `J'ai vu que vous préparez et expédiez les commandes de vos clients e-commerce, avec un WMS relié à leur boutique.

Comment suivez-vous les anomalies aujourd'hui : directement dans le WMS, ou dans un fichier à côté ?

Je conçois et développe des outils internes sur mesure, adaptés à la façon dont une équipe travaille. Sur un suivi comme celui-là, j'interviens en général sur quelques jours pour construire l'écran qui rassemble les alertes. Nous pouvons en échanger pour identifier vos vrais points de friction, et construire ce qui vous sert réellement.`;

const EXAMPLE_EN = `I saw that you pick, pack and ship for ecommerce brands, with a WMS wired into their store.

How do you track exceptions today: inside the WMS, or in a file on the side?

I design and build bespoke internal tools, shaped around the way a team works. On tracking like that I usually work over a few days to build the screen that gathers the alerts. We can talk it through to pin down where the friction really sits, and build what actually helps you.`;

export function outreachInstruction(language: "fr" | "en", step: number, seed = ""): string {
  const target = language === "fr" ? "French" : "English";
  const words = MAX_WORDS[Math.min(step, 2)];
  const shape = step === 0 ? "exactly three paragraphs" : step === 1 ? "two paragraphs" : "one paragraph";
  const lines = [
    `Write one cold email in ${target} and in that language only. ${ANGLE[Math.min(step, 2)]}`,
    "",
    "WHO IS WRITING - this is the whole positioning, get it wrong and the email is worthless:",
    "Matthew writes in the first person singular about what he does: \"je conçois\", \"je développe\". Never write \"notre\", \"nos\", \"notre equipe\", \"chez MDL Advisory on\", or a corporate present tense like \"nous concevons\" or \"on réalise\": there is no team behind him and it reads as an agency mailshot. \"nous\" and \"on\" are allowed only when they mean Matthew and the reader together - \"nous pouvons en discuter\", \"on regarde ensemble\".",
    "What he offers, said once and plainly: he designs and builds bespoke internal tools, genuinely shaped around the way the reader's team works, and he would define what to build with them. Never say that he works alone, that he is independent, a freelance, a one-man operation, or any variation on being by himself: that is not the argument and it is not to be mentioned.",
    "Tone: professional and measured. Warm but never chummy. This is a message between professionals who have not met, not a text to a friend.",
    "",
    "DO NOT DIAGNOSE. You do not know their problems and pretending to is what gives an automated email away. Never assert that something is hard, slow, costly or complicated for them. Never write a sentence of the form \"quand le volume augmente, X devient compliqué\". Ask instead: one real, narrow, curious question about how they handle a specific thing today, the kind a colleague would ask.",
    "",
    "HARD LIMITS - a draft that breaks one of these is a failure:",
    `- ${words} words maximum for the whole message. Greeting and signature are added separately and do not count.`,
    `- ${shape}, two sentences each at most.`,
    "- No price, no figure in euros or dollars, no delivery date, no guarantee, no commitment on scope.",
    "- No invented client, reference, statistic or result. Nothing about the prospect that the supplied research does not support.",
    "- No exclamation mark, no emoji, no bullet list, no link, no postscript.",
    "",
    "Register: a person writing to another person, in spoken language, not a consulting deck and not a sales sequence. Short verbs, direct sentences. Quote the prospect's own words for their business instead of paraphrasing them into jargon, correcting an obvious typo when you do.",
    "Banned wording: \"ce type de\", \"cela suggere\", \"je pourrais imaginer\", \"permettrait de\", \"dans le cadre de\", \"en s'appuyant sur\", \"au sein de\", \"problematique\", \"accompagner\", \"notre expertise\", \"n'hesitez pas\", \"je me permets\", \"j'espere que ce message vous trouve\", \"cle en main\", \"solution innovante\", \"synergie\", \"leader\", \"I hope this email finds you well\", \"leverage\", \"best-in-class\", \"reach out\".",
    "No flattery about their company or their sector. No listing of features or services. \"vous\" must outweigh \"je\". Name the company at most twice.",
    "",
    `Example of the target voice, length and shape, on a different company - never reuse its content:\n${language === "fr" ? EXAMPLE_FR : EXAMPLE_EN}`,
    "",
    "subject: two to five words, plain and low-key, like an internal note from a colleague. Lowercase first letter unless it is a proper noun. No pitch, no urgency, no question mark, no reader first name, no sender company name.",
  ];
  if (step === 0) {
    lines.push(
      "",
      "Paragraph 1: show that you actually looked at them and understood what they do. Name one concrete, specific thing about THEIR business from the supplied research - the real activity, a tool they use, something their own site states - and frame it as an observation you made: \"J'ai vu que vous...\", \"Si je comprends bien, vous...\", \"Vous ..., d'apres votre site\". Vary the opening between drafts, never reuse the same formula every time. No judgement attached, no compliment.",
      "Paragraph 2: the question. Ask how they handle one precise thing today, offering two plausible ways they might be doing it so the reader can answer in three words. It MUST end with a question mark. No claim about their situation, no proposed solution here.",
      "Paragraph 3: one sentence on what you do - you design and build bespoke internal tools, shaped around the way their team works, not a standard product.",
      "Then a mandatory closing line. Its substance is fixed: name in plain words the specific intervention that the supplied offer points to, and propose an exchange to identify what they actually need, so that what gets built fits their way of working rather than a standard product. You may say the work runs over a few days, never a number of days, and never a price. Never use a product or offer name: describe what the intervention does. An email that ends on what you do, with nothing to answer, is a failed draft. Propose the conversation and let them set the terms: never ask for a fixed slot, a thirty-minute call or a diary link.",
      "Do not write a parting courtesy formula such as \"Au plaisir d'échanger avec vous\" or \"Cordialement\", do not sign your name, and do not offer them a way to decline: those three are added after you. The sentence that invites a reply is still yours to write and it is mandatory - it is the last thing the reader reads before your signature.",
      `Wording of that closing line: ${closingAngle(seed)} Write it in your own words - do not reuse the example's phrasing.`,
      "Each paragraph must be a complete thought that ends on a full stop or a question mark. Never break a sentence across two paragraphs.",
    );
  }
  return lines.join("\n");
}

/** Hard violations: content that must never reach a prospect, whatever the rest of the message is worth. */
export function outreachIssues(text: string): string[] {
  const issues: string[] = [];
  if (/\d[\d\s.,]*\s*(€|\$|eur\b|euros?\b|usd\b|k€)/i.test(text) || /[€$]\s*\d/.test(text)) issues.push("montant chiffré");
  if (/\bgarant(i|ie|ies|is|it|issons)\b|\bguarantee/i.test(text)) issues.push("garantie");
  if (/https?:\/\/|\bwww\./i.test(text)) issues.push("lien");
  if (/\b(sous|d['’]ici|within)\s+\d+\s*(jours?|semaines?|days?|weeks?)\b/i.test(text)) issues.push("délai chiffré");
  if (wordCount(text) > 260) issues.push("trop long");
  return issues;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Matthew works alone: anything that speaks for a company turns the email into an agency mailshot. */
/**
 * "Nous pouvons en discuter" means Matthew and the reader; "nous concevons des outils" means a
 * company that does not exist. Only the second turns the email into an agency mailshot, so the
 * ban is on the corporate present tense and on the possessives, not on the pronoun itself.
 */
const TEAM_VOICE: RegExp[] = [
  /\bnotre\b|\bnos\b/i,
  /\bnous (con[çc]evons|construisons|d[ée]veloppons|r[ée]alisons|proposons|livrons|aidons|accompagnons|offrons|cr[ée]ons|intervenons)\b/i,
  /\bon (con[çc]oit|produit|r[ée]alise|cr[ée]e|livre|construit|d[ée]veloppe|fait|travaille|aide|propose)\b/i,
  /\bchez MDL Advisory,? on\b/i,
  /\bour team\b|\bwe (build|design|deliver|help|offer)\b/i,
];

/** Claiming to know their difficulties is what makes a cold email read as a guess dressed as insight. */
const DIAGNOSIS: RegExp[] = [
  /\bquand le volume (augmente|monte|cro[îi]t)\b/i,
  /\bdevient (vite )?(complexe|difficile|compliqu[ée]|lourd)\b/i,
  /\b(vous )?(perdez|passez) du temps\b/i,
  /\b(cela|ça|ce qui) (complique|alourdit|ralentit)\b/i,
  /\bn['’]est pas simple\b|\bpas [ée]vident\b/i,
  /\bfinit (souvent )?par (vivre|se retrouver|atterrir)\b/i,
];

/** Too familiar for a first message between professionals who have not met. */
const CASUAL: RegExp[] = [
  /\bun truc\b|\bdes trucs\b|\ble truc\b/i,
  /\bun mot suffi|\bun petit mot\b|\bdeux lignes suffisent\b/i,
  /\bcarr[ée]ment\b|\bhyper\b|\bsuper\b|\bsympa\b|\bg[ée]nial\b|\bchouette\b/i,
  /\bdu coup\b|\ben gros\b|\bpas mal de\b|\bfaire un tour\b/i,
];

/** Working alone is not the argument and Matthew does not want it mentioned. */
const SOLO_CLAIM: RegExp[] = [
  /\bje travaille seul\b|\bje suis seul\b|\btout seul\b|\ben solo\b/i,
  /\bje suis ind[ée]pendant\b|\bfreelance\b|\bconsultant ind[ée]pendant\b/i,
  /\bi work (on my own|alone)\b|\bone-man\b|\bsolo\b/i,
];

const TICS: RegExp[] = [
  /\bce (type|genre) d[e'’]/i,
  /\bcela sugg[eè]re\b/i,
  /\bje pourrais imaginer\b|\bon envisagerait\b/i,
  /\bpermettrait de\b|\bpermettant de\b/i,
  /\bdans le cadre de\b|\ben s['’]appuyant sur\b|\bau sein de\b/i,
  /\bprobl[eé]matique\b|\baccompagner\b|\bnotre expertise\b/i,
  /\bn['’]h[eé]sitez pas\b|\bje me permets\b|\bj['’]esp[eè]re que ce message\b/i,
  /\bcl[eé] en main\b|\bsolution innovante\b|\bsynergie\b|\bleader\b|\bincontournable\b/i,
  /\bi hope this email finds you well\b|\bleverage\b|\bbest-in-class\b|\breach out\b/i,
];

const match = (patterns: RegExp[], text: string) =>
  patterns.map(pattern => text.match(pattern)?.[0]).filter((hit): hit is string => Boolean(hit));

export function styleIssues(text: string): string[] { return match(TICS, text); }
export function teamVoiceIssues(text: string): string[] { return match(TEAM_VOICE, text); }
export function diagnosisIssues(text: string): string[] { return match(DIAGNOSIS, text); }
export function casualIssues(text: string): string[] { return match(CASUAL, text); }
export function soloClaims(text: string): string[] { return match(SOLO_CLAIM, text); }

/**
 * An email that ends on what the sender does, with no invitation, gets no reply. The model drops
 * the closing line first when it is squeezing itself under the word limit.
 */
const REPLY_CUE = /\?|\bsi (vous|la friction|le besoin|votre besoin|c['’]est|[çc]a se joue|ce n['’]est)\b|\b(dites-moi|dites moi|r[ée]pondez|en (discuter|parler|[ée]changer)|on en parle|on part sur|on regarde|regarder ensemble|voir ensemble|je peux|j['’]interviens|je construis|je vous dirai|tell me|let me know|talk it through|i can|we scope|reply)\b/i;

export function missingClosingAsk(paragraphs: string[]): boolean {
  const last = paragraphs[paragraphs.length - 1] || "";
  return !REPLY_CUE.test(last);
}

/** The single revision note handed back to the model, or null when the draft is already fine. */
export function revisionNote(rawParagraphs: string[], step: number): string | null {
  const paragraphs = mergeSplitSentences(rawParagraphs);
  const text = paragraphs.join(" ");
  const limit = MAX_WORDS[Math.min(step, 2)];
  const words = wordCount(text);
  const notes: string[] = [];
  const team = teamVoiceIssues(text);
  if (team.length) notes.push(`It speaks for a company: ${team.map(t => `"${t}"`).join(", ")}. Matthew writes in his own name. Rewrite in the first person singular, and keep "on" only where it means Matthew and the reader together.`);
  const solo = soloClaims(text);
  if (solo.length) notes.push(`It says that Matthew works by himself: ${solo.map(t => `"${t}"`).join(", ")}. Remove it. Say what he builds - bespoke internal tools shaped around how their team works - not how many people he is.`);
  const casual = casualIssues(text);
  if (casual.length) notes.push(`It is too familiar for a first message between professionals who have not met: ${casual.map(t => `"${t}"`).join(", ")}. Keep it measured.`);
  const diagnosis = diagnosisIssues(text);
  if (diagnosis.length) notes.push(`It claims to know their difficulties: ${diagnosis.map(t => `"${t}"`).join(", ")}. You do not know that. Replace the claim with a question about how they actually handle it today.`);
  if (step === 0 && !paragraphs.slice(0, -1).some(paragraph => paragraph.includes("?"))) notes.push("It never asks them anything before the closing line. The second paragraph must be a real question about how they work today, ending in a question mark.");
  if (step === 0 && paragraphs.length > 3) notes.push(`It runs to ${paragraphs.length} paragraphs instead of three: one observation, one question, one on what you build and the closing. Merge or cut, do not add a fourth.`);
  if (missingClosingAsk(paragraphs)) notes.push("It ends on what you do, with nothing for the reader to answer. The last sentence must invite a reply in a warm, ordinary way - tell them that a line describing how they work today is enough, and that you will say straight whether there is anything worth building.");
  const tics = styleIssues(text);
  if (tics.length) notes.push(`It uses wording that is banned because it reads as consulting boilerplate: ${tics.map(t => `"${t}"`).join(", ")}. Say the same thing the way someone would say it out loud.`);
  if (words > limit * 1.25) notes.push(`It runs to ${words} words, over the ${limit}-word limit. Cut the padding: drop every sentence that only restates another.`);
  if (!notes.length) return null;
  return `Your previous draft must be rewritten. ${notes.join(" ")} Keep everything else: same observation, same question, same language.`;
}

/** How far a draft is from the target, so a rewrite is only kept when it actually moves closer. */
export function draftFaults(rawParagraphs: string[], step: number): number {
  const paragraphs = mergeSplitSentences(rawParagraphs);
  const text = paragraphs.join(" ");
  const missingQuestion = step === 0 && !paragraphs.slice(0, -1).some(paragraph => paragraph.includes("?")) ? 1 : 0;
  const extraParagraphs = step === 0 ? Math.max(0, paragraphs.length - 3) : 0;
  return teamVoiceIssues(text).length * 2 + diagnosisIssues(text).length * 2 + soloClaims(text).length * 2
    + styleIssues(text).length + casualIssues(text).length + missingQuestion * 2
    + (missingClosingAsk(paragraphs) ? 2 : 0) + extraParagraphs;
}

/**
 * Faults worth discarding a personalised draft over. A residual consulting tic is tolerable; an
 * email that speaks for a company, diagnoses a problem, asks nothing or rambles past the limit is
 * the exact thing Matthew objected to, and the plain template beats it.
 */
export function isUnsendable(rawParagraphs: string[], step: number): boolean {
  const paragraphs = mergeSplitSentences(rawParagraphs);
  const text = paragraphs.join(" ");
  if (teamVoiceIssues(text).length || soloClaims(text).length || diagnosisIssues(text).length) return true;
  if (missingClosingAsk(paragraphs)) return true;
  if (step === 0 && !paragraphs.slice(0, -1).some(paragraph => paragraph.includes("?"))) return true;
  if (step === 0 && paragraphs.length > 3) return true;
  return wordCount(text) > MAX_WORDS[Math.min(step, 2)] * 1.4;
}

/** Cosmetic tics a model slips in: strip them rather than discard an otherwise good message. */
export function tidyOutreach(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/!+/g, ".")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,])/g, "$1")
    .trim();
}

/**
 * A French business on a .com domain has no country the research could establish, and the contact
 * record then keeps its "en" default: a prospect found by the France campaign was written to in
 * English. The campaign country decides when the company's own is unknown. It is a presentation
 * choice, not a claim: the company country stays unknown, so targeting still demands a human.
 */
export function outreachLanguage(context: LeadContext): "fr" | "en" {
  const known = normalizedCountry(context.company.country) ? context.company.country : context.campaignCountry;
  return languageFor(known ?? undefined, context.contact?.language);
}

export function greeting(context: LeadContext, language: "fr" | "en"): string {
  const first = context.contact?.firstName?.trim() || context.contact?.fullName?.trim().split(" ")[0] || "";
  const hello = language === "fr" ? "Bonjour" : "Hi";
  return first ? `${hello} ${first},` : `${hello},`;
}

/**
 * B2B prospecting in France needs no prior consent, but the recipient must be able to object
 * simply in every message. Sat under the signature as a fixed block it read as a mailing footer,
 * which is exactly what it announced. It is now the last sentence of the message itself, varied
 * per company, so it does the same job in the voice of the person writing.
 */
const OPT_OUT_FR = [
  "Si ce n'est pas d'actualité chez vous, dites-le moi et j'en resterai là.",
  "Si le sujet n'est pas le vôtre, dites-le moi, je n'insisterai pas.",
  "Si vous préférez que je ne revienne pas vers vous, dites-le moi simplement.",
  "Et si ce n'est pas le moment, dites-le moi : je m'arrête là.",
];

const OPT_OUT_EN = [
  "If this is not on your plate right now, tell me and I will leave it there.",
  "If it is not your subject, say so and I will not follow up.",
  "If you would rather I did not come back to you, just tell me.",
  "And if the timing is wrong, tell me and I will stop there.",
];

export function optOut(language: "fr" | "en", seed = ""): string {
  return pick(language === "fr" ? OPT_OUT_FR : OPT_OUT_EN, seed);
}

/** True when the message already gives the reader a way out, in any of its wordings. */
export function hasOptOut(text: string, language: "fr" | "en"): boolean {
  const list = language === "fr" ? OPT_OUT_FR : OPT_OUT_EN;
  return list.some(line => text.includes(line)) || /ne vous recontacterai plus|won't contact you again/i.test(text);
}

export function signatureFor(settings: DraftSettings): string {
  return settings.signature?.trim() || `${settings.senderName}\n${settings.companyName}`;
}

/**
 * The model sometimes returns a paragraph break in the middle of a sentence, which arrives in the
 * inbox as a broken line. A paragraph that does not close on terminal punctuation belongs with the
 * next one, so they are rejoined rather than sent apart.
 */
export function mergeSplitSentences(paragraphs: string[]): string[] {
  const merged: string[] = [];
  for (const raw of paragraphs.map(tidyOutreach).filter(Boolean)) {
    const previous = merged[merged.length - 1];
    if (previous && !/[.?!:»)]$/.test(previous)) merged[merged.length - 1] = `${previous} ${raw}`;
    else merged.push(raw);
  }
  return merged;
}

export function assembleOutreach(context: LeadContext, settings: DraftSettings, language: "fr" | "en", paragraphs: string[]): string {
  const seed = context.company.domain || context.company.name || "";
  const merged = mergeSplitSentences(paragraphs);
  // The way out belongs to the last sentence of the message, not to a footer under the signature.
  const last = merged.length - 1;
  if (last >= 0 && !hasOptOut(merged[last], language)) merged[last] = `${merged[last]} ${optOut(language, seed)}`;
  return `${greeting(context, language)}\n\n${merged.join("\n\n")}\n\n${signOff(language, seed)}\n${signatureFor(settings)}`;
}

/**
 * Used when the model is unavailable or wrote something disqualifying. It is a template and it
 * reads like one, so it stays as specific as the stored data allows, asks rather than asserts,
 * and promises nothing.
 */
/** Cutting on a character count leaves a word sliced in half in the middle of an email. */
function clip(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ");
}

/** The first sentence only: a scraped description or an internal offer write-up runs on for lines. */
function firstSentence(text: string, maxWords: number): string {
  const sentence = (text || "").split(/(?<=[.?!])\s|\n/)[0] || "";
  // Trimming before the clip leaves the comma that the clip itself exposes: trim after.
  return clip(tidyOutreach(sentence), maxWords).replace(/[.?!:,;\s]+$/, "");
}

export function fallbackOutreach(context: LeadContext, offer: AdaptiveOffer, settings: DraftSettings, step: number): { subject: string; body: string; language: "fr" | "en" } {
  const language = outreachLanguage(context);
  const fr = language === "fr";
  const company = context.company.name.replace(/\s*\[Demo\]/, "");
  // A scraped description is often unpunctuated prose. Clipping it yields a sentence that stops on
  // a dangling preposition, which reads worse than saying nothing: take it whole or not at all.
  const sentence = firstSentence(context.company.description || "", 200);
  const length = sentence ? sentence.split(/\s+/).filter(Boolean).length : 0;
  const activity = length >= 5 && length <= 22 && !/[:;,]$/.test(sentence) ? sentence : "";
  // Repeating the site's own strapline is flat. The research holds the concrete detail - a tool
  // they run, a fact about the business - and that is what shows someone actually looked.
  const facts = (context.research || []).filter(f => f.status !== "unknown" && f.value && f.value !== UNKNOWN);
  const tool = facts.find(f => /^technolog|^crm$|^ecommerce$|^automation$/i.test(f.field));
  const business = facts.find(f => /^business$/i.test(f.field));
  const toolName = tool ? firstSentence(tool.value.split(",")[0], 6) : "";
  const businessLine = business ? firstSentence(business.value, 20) : "";
  // The offer is an internal document, always written in French. Splicing it verbatim into an
  // English message produced a half-French email; the model can translate it, the template cannot.
  const intervention = fr ? firstSentence(offer.proposedSolution || "", 16) : "";
  const scope = intervention ? `${intervention.charAt(0).toLowerCase()}${intervention.slice(1)}` : "";
  let paragraphs: string[];
  if (step >= 2) {
    paragraphs = [fr
      ? `Je n'insiste pas davantage. Si le sujet redevient d'actualité chez ${company}, vous pouvez répondre à ce message, même dans plusieurs mois.`
      : `I will leave it here. If this becomes relevant at ${company} again, you can reply to this message, even months from now.`];
  } else if (step === 1) {
    paragraphs = [
      fr
        ? "Une question plus précise : le suivi de votre activité tient dans vos outils métier, ou il y a un fichier à côté que quelqu'un met à jour à la main ?"
        : "A narrower question: does tracking live inside your business tools, or is there a file on the side that someone updates by hand?",
      fr
        ? "Si vous avez des points de friction de ce côté-là, je peux construire avec vous l'outil qui les règle."
        : "If you have friction points on that side, I can build the tool that removes them with you.",
    ];
  } else {
    // "de Endurancelogistique" reads as a machine; French elides before a vowel.
    const of = /^[aeiouyàâäéèêëîïôöùûü]/i.test(company) ? `d'${company}` : `de ${company}`;
    const sector = (context.company.industry || "").trim();
    const lower = (value: string) => `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
    let opening: string;
    if (toolName) opening = fr ? `J'ai vu que vous travaillez avec ${toolName}.` : `I saw that you work with ${toolName}.`;
    else if (businessLine) opening = fr ? `J'ai vu que ${lower(businessLine)}.` : `I saw that ${lower(businessLine)}.`;
    else if (activity) opening = fr ? `J'ai vu ce que fait ${company} : ${lower(activity)}.` : `I had a look at what ${company} does: ${lower(activity)}.`;
    else opening = fr
      ? `J'ai regardé l'activité ${of}${sector && sector !== UNKNOWN ? `, ${lower(sector)}` : ""}.`
      : `I had a look at what ${company} does${sector && sector !== UNKNOWN ? `, in ${lower(sector)}` : ""}.`;
    paragraphs = [
      opening,
      fr
        ? "Comment suivez-vous cette activité aujourd'hui : dans vos outils métier, ou dans un fichier tenu à la main à côté ?"
        : "How do you track that today: inside your business tools, or in a file someone maintains on the side?",
      fr
        ? `Je conçois et développe des outils internes sur mesure, adaptés à la façon dont une équipe travaille.${scope ? ` Sur ce genre de sujet, j'interviens sur quelques jours : ${scope}.` : ""} Nous pouvons en échanger pour identifier vos vrais points de friction, et construire ce qui vous sert réellement.`
        : `I design and build bespoke internal tools, shaped around the way a team works.${scope ? ` On subjects like this I work over a few days: ${scope}.` : ""} We can talk it through to pin down where the friction really sits, and build what actually helps you.`,
    ];
  }
  const subject = step >= 2
    ? (fr ? "dernier message" : "last note")
    : step === 1
      ? (fr ? "une question rapide" : "one quick question")
      : (fr ? "votre suivi au quotidien" : "how you track things");
  return { subject: subject.slice(0, 180), body: assembleOutreach(context, settings, language, paragraphs), language };
}
