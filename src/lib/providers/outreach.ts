import type { AdaptiveOffer, DraftSettings, LeadContext } from "./types";
import { languageFor } from "../domain/rules";

/**
 * Cold outreach used to be a fixed template with one AI-written noun phrase dropped into it:
 * every prospect received the same four sentences. That is exactly what makes an email read as
 * machine-sent. The model now writes the whole message from verified research, inside guardrails,
 * while the greeting, signature and opt-out line stay deterministic so compliance never depends
 * on a probabilistic output.
 *
 * The hard constraints come first in the instruction and an example carries the register: a long
 * list of prohibitions at the end of a prompt gets diluted, a short model email does not.
 */

export const MAX_WORDS: Record<number, number> = { 0: 110, 1: 70, 2: 45 };

const ANGLE: Record<number, string> = {
  0: "This is a first contact. Open on their business, never on yours.",
  1: "This is the second message, three days later. Never say you are following up or checking in, and never summarise the first email: the reader may not have opened it. Take a new angle - what a small first step would concretely look like for a business like theirs.",
  2: "This is the last message, a week later. Say plainly that you stop there, leave the door open without pressure, give an easy way to come back later. No new argument, no urgency, no guilt.",
};

const EXAMPLE_FR = `Vous préparez et expédiez les commandes de vos clients e-commerce, avec un WMS relié à leur boutique.

Quand le volume monte, le suivi des anomalies finit souvent dans un tableur à côté. On peut le remplacer par un écran unique qui reprend les alertes du WMS et les met dans les mains de la personne qui les traite.

C'est le genre de petit outil interne qu'on livre en quelques jours, cadré sur un seul besoin. Ça vous parle, ou c'est déjà réglé chez vous ?`;

const EXAMPLE_EN = `You pick, pack and ship for ecommerce brands, with a WMS wired into their store.

When volume climbs, exception tracking usually ends up in a spreadsheet on the side. That can become one screen that pulls the WMS alerts and puts them in front of whoever handles them.

That is the kind of small internal tool we ship in days, scoped to one need. Does that land, or is it already solved on your side?`;

export function outreachInstruction(language: "fr" | "en", step: number): string {
  const target = language === "fr" ? "French" : "English";
  const words = MAX_WORDS[Math.min(step, 2)];
  const shape = step === 0 ? "exactly three paragraphs" : step === 1 ? "two paragraphs" : "one paragraph";
  const lines = [
    `Write one cold email in ${target} and in that language only. ${ANGLE[Math.min(step, 2)]}`,
    "",
    "HARD LIMITS - a draft that breaks one of these is a failure:",
    `- ${words} words maximum for the whole message. Greeting and signature are added separately and do not count.`,
    `- ${shape}, two sentences each at most.`,
    "- No price, no figure in euros or dollars, no delivery date, no guarantee, no commitment on scope.",
    "- No invented client, reference, statistic or result. Nothing about the prospect that the supplied research does not support.",
    "- No exclamation mark, no emoji, no bullet list, no link, no postscript.",
    "",
    "Register: a professional writing to a peer he respects, in spoken French, not a consulting deck and not a sales sequence. Short verbs, direct sentences. Say \"on\" where a consultant would say \"je pourrais envisager de\". Quote the prospect's own words for their business instead of paraphrasing them into jargon, correcting an obvious typo when you do.",
    "Banned wording: \"ce type de\", \"cela suggere\", \"cette integration suggere\", \"je pourrais imaginer\", \"permettrait de\", \"dans le cadre de\", \"en s'appuyant sur\", \"au sein de\", \"problematique\", \"accompagner\", \"j'espere que ce message vous trouve\", \"je me permets\", \"n'hesitez pas\", \"leader\", \"cle en main\", \"solution innovante\", \"synergie\", \"I hope this email finds you well\", \"leverage\", \"best-in-class\".",
    "No flattery about their company or their sector. No listing of features. \"vous\" must outweigh \"je\". Name the company at most twice.",
    "",
    `Example of the target length and register, on a different company - never reuse its content:\n${language === "fr" ? EXAMPLE_FR : EXAMPLE_EN}`,
    "",
    "subject: two to five words, plain and low-key, like an internal note from a colleague. Lowercase first letter unless it is a proper noun. No pitch, no urgency, no question mark, no reader first name, no sender company name.",
  ];
  if (step === 0) {
    lines.push(
      "",
      "Paragraph 1: one concrete, specific thing about THEIR business, from the supplied research or description - the actual activity, a tool they use, something their own site states.",
      "Paragraph 2: the operational consequence that usually follows, as a hypothesis about them and never as an observed fact, then in plain words what you would build for it, drawn from the supplied offer.",
      "Paragraph 3: one short clause on what MDL Advisory does - small internal tools and automations scoped to one need, delivered in days - so the reader sees this idea is one example among others, with no catalogue. Then one single question that can be answered in one line and leaves an easy way out. Never ask for a call or a meeting slot.",
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

/**
 * Consultant tics and sales filler. Listing them in the prompt is not enough - the model keeps a
 * few - so the written copy is read back and the offending phrases are quoted to it for one
 * rewrite. These are style, not safety: they never justify discarding a message on their own.
 */
const TICS: RegExp[] = [
  /\bce (type|genre) d[e'’]/i,
  /\bcela sugg[eè]re\b|\bsugg[eè]re une?\b/i,
  /\bje pourrais imaginer\b|\bon envisagerait\b/i,
  /\bpermettrait de\b|\bpermettant de\b/i,
  /\bdans le cadre de\b|\ben s['’]appuyant sur\b|\bau sein de\b/i,
  /\bprobl[eé]matique\b|\baccompagner\b|\bnotre expertise\b/i,
  /\bn['’]h[eé]sitez pas\b|\bje me permets\b|\bj['’]esp[eè]re que ce message\b/i,
  /\bcl[eé] en main\b|\bsolution innovante\b|\bsynergie\b|\bleader\b|\bincontournable\b/i,
  /\bi hope this email finds you well\b|\bleverage\b|\bbest-in-class\b|\breach out\b/i,
];

export function styleIssues(text: string): string[] {
  return TICS.map(pattern => text.match(pattern)?.[0]).filter((match): match is string => Boolean(match));
}

/** The single revision note handed back to the model, or null when the draft is already fine. */
export function revisionNote(paragraphs: string[], step: number): string | null {
  const text = paragraphs.join(" ");
  const limit = MAX_WORDS[Math.min(step, 2)];
  const words = wordCount(text);
  const tics = styleIssues(text);
  const notes: string[] = [];
  if (words > limit * 1.25) notes.push(`It runs to ${words} words, over the ${limit}-word limit. Cut the padding: drop every sentence that only restates another, keep the concrete observation and the closing question.`);
  if (tics.length) notes.push(`It uses wording that is banned because it reads as consulting boilerplate: ${tics.map(t => `"${t}"`).join(", ")}. Say the same thing the way someone would say it out loud.`);
  if (!notes.length) return null;
  return `Your previous draft must be rewritten. ${notes.join(" ")} Keep everything else: same observation, same idea, same language.`;
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
 * reads like one, so it stays as specific as the stored data allows and promises nothing.
 */
export function fallbackOutreach(context: LeadContext, offer: AdaptiveOffer, settings: DraftSettings, step: number): { subject: string; body: string; language: "fr" | "en" } {
  const language = languageFor(context.company.country, context.contact?.language);
  const fr = language === "fr";
  const company = context.company.name.replace(/\s*\[Demo\]/, "");
  const activity = (context.company.description || "").split(/[.\n]/)[0].trim().slice(0, 120);
  const idea = tidyOutreach(offer.proposedSolution).replace(/[.?]+$/, "");
  let paragraphs: string[];
  if (step >= 2) {
    paragraphs = [fr
      ? `Je n'insiste pas davantage. Si le sujet redevient d'actualité chez ${company}, vous pouvez répondre à ce message, même dans plusieurs mois.`
      : `I will leave it here. If this becomes relevant at ${company} again, you can reply to this message, even months from now.`];
  } else if (step === 1) {
    paragraphs = [
      fr
        ? "Un exemple concret de ce que cela donne : on part d'un seul processus, on le cartographie avec la personne qui le fait tous les jours, puis on livre l'outil ou l'automatisation qui l'absorbe."
        : "A concrete example of what this looks like: we start from one process, map it with the person who runs it daily, then deliver the tool or automation that absorbs it.",
      fr ? "Quel processus vous coûte le plus de temps en ce moment ?" : "Which process costs your team the most time right now?",
    ];
  } else {
    paragraphs = [
      fr
        ? `${activity ? `${activity}. ` : ""}C'est le type d'activité où le suivi finit souvent par vivre dans des tableurs et des ressaisies.`
        : `${activity ? `${activity}. ` : ""}That is the kind of business where tracking usually ends up living in spreadsheets and duplicate data entry.`,
      fr ? `Si c'est le cas chez vous, une piste serait : ${idea}.` : `If that is the case for you, one direction would be: ${idea}.`,
      fr
        ? "Nous construisons de petits outils internes et des automatisations cadrés sur un besoin précis. Quel processus vous prend le plus de temps aujourd'hui ?"
        : "We build small internal tools and automations scoped to one precise need. Which process takes the most time for your team today?",
    ];
  }
  const subject = step >= 2
    ? (fr ? "dernier message" : "last note")
    : step === 1
      ? (fr ? "votre suivi opérationnel" : "your operations tracking")
      : (fr ? "votre organisation opérationnelle" : "your operations setup");
  return { subject: subject.slice(0, 180), body: assembleOutreach(context, settings, language, paragraphs), language };
}
