import type { DraftSettings, LeadContext } from "./types";
import { languageFor } from "../domain/rules";

/**
 * Cold outreach used to be a fixed template with one AI-written noun phrase dropped into it:
 * every prospect received the same four sentences. The model now writes the whole message from
 * verified research, inside guardrails, while the greeting, signature and opt-out line stay
 * deterministic so compliance never depends on a probabilistic output.
 *
 * Three things decide whether it reads as human, and each is enforced in code rather than merely
 * asked for in the prompt, because a model drops them first:
 *  - Matthew works alone. "nous", "notre" and "on conçoit" turn him into an agency and give the
 *    send away. The one real advantage over an agency is that the reader talks to the person who
 *    builds the thing, so the email says that.
 *  - The email must not diagnose. Asserting a problem nobody described reads as a template that
 *    guessed. The second paragraph asks how they actually work today, and must end in a question.
 *  - Length and consulting register: both are checked and sent back for one rewrite.
 */

export const MAX_WORDS: Record<number, number> = { 0: 110, 1: 70, 2: 45 };

const ANGLE: Record<number, string> = {
  0: "This is a first contact. Open on their business, never on yours.",
  1: "This is the second message, three days later. Never say you are following up or checking in, and never summarise the first email: the reader may not have opened it. Ask about a different, narrower part of how they work.",
  2: "This is the last message, a week later. Say plainly that you stop there, leave the door open without pressure, give an easy way to come back later. No new argument, no urgency, no guilt.",
};

const EXAMPLE_FR = `Vous préparez et expédiez les commandes de vos clients e-commerce, avec un WMS relié à leur boutique.

Je me demandais comment vous suivez les anomalies aujourd'hui : directement dans le WMS, ou dans un fichier à côté ?

Je travaille seul : je conçois et je code moi-même de petits outils internes. Ça veut dire qu'on regarde votre façon de faire et que je construis ce qui manque, pas un produit standard. Si vous me dites comment ça se passe chez vous, je vous dirai franchement s'il y a quelque chose à en tirer.`;

const EXAMPLE_EN = `You pick, pack and ship for ecommerce brands, with a WMS wired into their store.

I was wondering how you track exceptions today: inside the WMS, or in a file on the side?

I work on my own: I design and build the tools myself. That means we look at how you actually work and I build what is missing, not a standard product. Tell me how it runs on your side and I will tell you straight whether there is anything worth building.`;

export function outreachInstruction(language: "fr" | "en", step: number): string {
  const target = language === "fr" ? "French" : "English";
  const words = MAX_WORDS[Math.min(step, 2)];
  const shape = step === 0 ? "exactly three paragraphs" : step === 1 ? "two paragraphs" : "one paragraph";
  const lines = [
    `Write one cold email in ${target} and in that language only. ${ANGLE[Math.min(step, 2)]}`,
    "",
    "WHO IS WRITING - this is the whole positioning, get it wrong and the email is worthless:",
    "Matthew works alone. He is not an agency, not a team, not a studio. He talks to the client himself and he writes the code himself. Never write \"nous\", \"notre\", \"nos\", \"notre equipe\", \"chez MDL Advisory on\", or any \"on\" that means the company. Write \"je\". The only \"on\" allowed is the one that means Matthew and the reader together, as in \"on en parle\" or \"on regarde ensemble\".",
    "Working alone is the argument, not an excuse: the reader deals with one person, the conversation is direct, and what gets built is shaped around their way of working instead of a standard product. Say that plainly once, without boasting.",
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
      "Paragraph 1: one concrete, specific thing about THEIR business, from the supplied research or description - the actual activity, a tool they use, something their own site states. State it flatly, as something you read, with no judgement attached.",
      "Paragraph 2: the question. Ask how they handle one precise thing today, offering two plausible ways they might be doing it so the reader can answer in three words. It MUST end with a question mark. No claim about their situation, no proposed solution here.",
      "Paragraph 3: one sentence saying you work alone, design and build the tools yourself, and that what you build is shaped around how they work. Then a single closing line that makes replying easy and leaves an obvious way out. Never ask for a call or a meeting slot.",
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
const TEAM_VOICE: RegExp[] = [
  /\bnous\b|\bnotre\b|\bnos\b/i,
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

/** The single revision note handed back to the model, or null when the draft is already fine. */
export function revisionNote(paragraphs: string[], step: number): string | null {
  const text = paragraphs.join(" ");
  const limit = MAX_WORDS[Math.min(step, 2)];
  const words = wordCount(text);
  const notes: string[] = [];
  const team = teamVoiceIssues(text);
  if (team.length) notes.push(`It speaks for a company: ${team.map(t => `"${t}"`).join(", ")}. Matthew works alone. Rewrite in the first person singular, and keep "on" only where it means Matthew and the reader together.`);
  const diagnosis = diagnosisIssues(text);
  if (diagnosis.length) notes.push(`It claims to know their difficulties: ${diagnosis.map(t => `"${t}"`).join(", ")}. You do not know that. Replace the claim with a question about how they actually handle it today.`);
  if (step === 0 && !paragraphs.slice(0, -1).some(paragraph => paragraph.includes("?"))) notes.push("It never asks them anything before the closing line. The second paragraph must be a real question about how they work today, ending in a question mark.");
  const tics = styleIssues(text);
  if (tics.length) notes.push(`It uses wording that is banned because it reads as consulting boilerplate: ${tics.map(t => `"${t}"`).join(", ")}. Say the same thing the way someone would say it out loud.`);
  if (words > limit * 1.25) notes.push(`It runs to ${words} words, over the ${limit}-word limit. Cut the padding: drop every sentence that only restates another.`);
  if (!notes.length) return null;
  return `Your previous draft must be rewritten. ${notes.join(" ")} Keep everything else: same observation, same question, same language.`;
}

/** How far a draft is from the target, so a rewrite is only kept when it actually moves closer. */
export function draftFaults(paragraphs: string[], step: number): number {
  const text = paragraphs.join(" ");
  const missingQuestion = step === 0 && !paragraphs.slice(0, -1).some(paragraph => paragraph.includes("?")) ? 1 : 0;
  return teamVoiceIssues(text).length * 2 + diagnosisIssues(text).length * 2 + styleIssues(text).length + missingQuestion * 2;
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

export function greeting(context: LeadContext, language: "fr" | "en"): string {
  const first = context.contact?.firstName?.trim() || context.contact?.fullName?.trim().split(" ")[0] || "";
  const hello = language === "fr" ? "Bonjour" : "Hi";
  return first ? `${hello} ${first},` : `${hello},`;
}

export function optOut(language: "fr" | "en"): string {
  return language === "fr"
    ? "Pas pertinent ? Répondez simplement « non » et je ne vous recontacterai plus."
    : "Not relevant? Just reply 'no' and I won't contact you again.";
}

export function signatureFor(settings: DraftSettings): string {
  return settings.signature?.trim() || `${settings.senderName}\n${settings.companyName}`;
}

export function assembleOutreach(context: LeadContext, settings: DraftSettings, language: "fr" | "en", paragraphs: string[]): string {
  const body = paragraphs.map(tidyOutreach).filter(Boolean).join("\n\n");
  return `${greeting(context, language)}\n\n${body}\n\n${signatureFor(settings)}\n\n${optOut(language)}`;
}

/**
 * Used when the model is unavailable or wrote something disqualifying. It is a template and it
 * reads like one, so it stays as specific as the stored data allows, asks rather than asserts,
 * and promises nothing.
 */
export function fallbackOutreach(context: LeadContext, settings: DraftSettings, step: number): { subject: string; body: string; language: "fr" | "en" } {
  const language = languageFor(context.company.country, context.contact?.language);
  const fr = language === "fr";
  const company = context.company.name.replace(/\s*\[Demo\]/, "");
  const activity = (context.company.description || "").split(/[.\n]/)[0].trim().slice(0, 120);
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
        ? "Je pose la question parce que c'est souvent de là que part un outil utile. Répondez-moi en une ligne si vous voulez."
        : "I ask because that is usually where a useful tool starts. A one-line answer is plenty.",
    ];
  } else {
    const opening = activity || (fr ? `J'ai regardé ce que fait ${company}` : `I had a look at what ${company} does`);
    paragraphs = [
      `${opening}.`,
      fr
        ? "Comment suivez-vous tout ça aujourd'hui : dans vos outils métier, ou dans un fichier tenu à la main à côté ?"
        : "How do you keep track of all that today: inside your business tools, or in a file someone maintains on the side?",
      fr
        ? "Je travaille seul : je conçois et je code moi-même de petits outils internes, cadrés sur votre façon de faire plutôt que sur un produit standard. Dites-moi comment ça se passe chez vous et je vous dirai franchement s'il y a quelque chose à en tirer."
        : "I work on my own: I design and build small internal tools myself, shaped around how you work rather than around a standard product. Tell me how it runs on your side and I will tell you straight whether there is anything worth building.",
    ];
  }
  const subject = step >= 2
    ? (fr ? "dernier message" : "last note")
    : step === 1
      ? (fr ? "une question rapide" : "one quick question")
      : (fr ? "votre suivi au quotidien" : "how you track things");
  return { subject: subject.slice(0, 180), body: assembleOutreach(context, settings, language, paragraphs), language };
}
