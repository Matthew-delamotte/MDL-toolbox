import type { AdaptiveOffer, DraftSettings, LeadContext } from "./types";
import { languageFor } from "../domain/rules";

/**
 * Cold outreach used to be a fixed template with one AI-written noun phrase dropped into it:
 * every prospect received the same four sentences. The model now writes the whole message from
 * verified research, inside guardrails, while the greeting, signature and opt-out line stay
 * deterministic so compliance never depends on a probabilistic output.
 *
 * Three things decide whether it reads as human, and each is enforced in code rather than merely
 * asked for in the prompt, because a model drops them first:
 *  - Matthew writes in his own name. "nous", "notre" and "on conçoit" turn him into an agency and
 *    give the send away. What the email offers is a bespoke tool shaped around how the reader's
 *    team actually works, never a count of how many people he is.
 *  - The email must not diagnose. Asserting a problem nobody described reads as a template that
 *    guessed. The second paragraph asks how they actually work today, and must end in a question.
 *  - Length and consulting register: both are checked and sent back for one rewrite.
 */

export const MAX_WORDS: Record<number, number> = { 0: 110, 1: 70, 2: 45 };

/**
 * The closing carries the commercial promise, so its substance is fixed: one concrete intervention
 * drawn from the offer chosen for this lead, plus an open door for a scope built around something
 * else. Its wording must not be, or every prospect reads the same last sentence. The angle is
 * picked from the company domain: stable when a draft is regenerated, different between companies.
 */
const CLOSING_ANGLES = [
  "Close by naming the intervention plainly and asking whether that is the right target, or whether their need sits somewhere else entirely.",
  "Close by offering to outline what such an intervention would cover for them, and saying you can shape it differently if their situation calls for it.",
  "Close on a conditional: if the friction sits where your question points, this is the shape of what you would build; if it sits elsewhere, you would build around that instead.",
  "Close by putting two paths side by side - the intervention you have in mind, or a scope defined with them around their own way of working - and asking which of the two is closer to their situation.",
  "Close by inviting them to describe where the friction actually is, and saying what you would do about it once you know.",
];

export function closingAngle(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 100000;
  return CLOSING_ANGLES[hash % CLOSING_ANGLES.length];
}

const ANGLE: Record<number, string> = {
  0: "This is a first contact. Open on their business, never on yours.",
  1: "This is the second message, three days later. Never say you are following up or checking in, and never summarise the first email: the reader may not have opened it. Ask about a different, narrower part of how they work.",
  2: "This is the last message, a week later. Say plainly that you stop there, leave the door open without pressure, give an easy way to come back later. No new argument, no urgency, no guilt.",
};

const EXAMPLE_FR = `J'ai vu que vous préparez et expédiez les commandes de vos clients e-commerce, avec un WMS relié à leur boutique.

Comment suivez-vous les anomalies aujourd'hui : directement dans le WMS, ou dans un fichier à côté ?

Je conçois et développe des outils internes sur mesure, adaptés à la façon dont une équipe travaille. Sur un suivi comme celui-là, j'interviens en général sur quelques jours pour construire l'écran qui rassemble les alertes — mais si la friction est ailleurs, on part sur ce qui vous sert vraiment.`;

const EXAMPLE_EN = `I saw that you pick, pack and ship for ecommerce brands, with a WMS wired into their store.

How do you track exceptions today: inside the WMS, or in a file on the side?

I design and build bespoke internal tools, shaped around the way a team works. On tracking like that I usually work over a few days to build the screen that gathers the alerts - but if the friction sits elsewhere, we scope around what actually helps you.`;

export function outreachInstruction(language: "fr" | "en", step: number, seed = ""): string {
  const target = language === "fr" ? "French" : "English";
  const words = MAX_WORDS[Math.min(step, 2)];
  const shape = step === 0 ? "exactly three paragraphs" : step === 1 ? "two paragraphs" : "one paragraph";
  const lines = [
    `Write one cold email in ${target} and in that language only. ${ANGLE[Math.min(step, 2)]}`,
    "",
    "WHO IS WRITING - this is the whole positioning, get it wrong and the email is worthless:",
    "Matthew writes in the first person singular. Never write \"nous\", \"notre\", \"nos\", \"notre equipe\", \"chez MDL Advisory on\", or any \"on\" that means the company. Write \"je\". The only \"on\" allowed is the one that means Matthew and the reader together, as in \"on en parle\" or \"on regarde ensemble\".",
    "What he offers, said once and plainly: he designs and builds bespoke internal tools, genuinely shaped around the way the reader's team works, and he can build it with them. Never say that he works alone, that he is independent, a freelance, a one-man operation, or any variation on being by himself: that is not the argument and it is not to be mentioned.",
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
      "Then a mandatory closing line. Its substance is fixed: name in plain words the specific intervention that the supplied offer points to, and in the same breath leave the door open to a scope built around something else if their need sits elsewhere. You may say the work runs over a few days, never a number of days, and never a price. Never use a product or offer name: describe what the intervention does. An email that ends on what you do, with nothing to answer, is a failed draft. Never ask for a call or a meeting slot.",
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
const REPLY_CUE = /\?|\bsi (vous|la friction|le besoin|votre besoin|c['’]est|[çc]a se joue)\b|\b(dites-moi|dites moi|r[ée]pondez|on en parle|on part sur|on regarde|je peux|j['’]interviens|je construis|je vous dirai|tell me|let me know|i can|we scope|reply)\b/i;

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
  return teamVoiceIssues(text).length * 2 + diagnosisIssues(text).length * 2 + soloClaims(text).length * 2
    + styleIssues(text).length + casualIssues(text).length + missingQuestion * 2 + (missingClosingAsk(paragraphs) ? 2 : 0);
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
  const body = mergeSplitSentences(paragraphs).join("\n\n");
  return `${greeting(context, language)}\n\n${body}\n\n${signatureFor(settings)}\n\n${optOut(language)}`;
}

/**
 * Used when the model is unavailable or wrote something disqualifying. It is a template and it
 * reads like one, so it stays as specific as the stored data allows, asks rather than asserts,
 * and promises nothing.
 */
export function fallbackOutreach(context: LeadContext, offer: AdaptiveOffer, settings: DraftSettings, step: number): { subject: string; body: string; language: "fr" | "en" } {
  const language = languageFor(context.company.country, context.contact?.language);
  const fr = language === "fr";
  const company = context.company.name.replace(/\s*\[Demo\]/, "");
  const activity = (context.company.description || "").split(/[.\n]/)[0].trim().slice(0, 120);
  const intervention = tidyOutreach(offer.proposedSolution).replace(/[.?]+$/, "");
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
    paragraphs = [
      fr
        ? `J'ai vu ce que fait ${company}${activity ? ` : ${activity.charAt(0).toLowerCase()}${activity.slice(1)}` : ""}.`
        : `I had a look at what ${company} does${activity ? `: ${activity.charAt(0).toLowerCase()}${activity.slice(1)}` : ""}.`,
      fr
        ? "Comment suivez-vous cette activité aujourd'hui : dans vos outils métier, ou dans un fichier tenu à la main à côté ?"
        : "How do you track that today: inside your business tools, or in a file someone maintains on the side?",
      fr
        ? `Je conçois et développe des outils internes sur mesure, adaptés à la façon dont une équipe travaille.${scope ? ` Sur ce genre de sujet, j'interviens sur quelques jours : ${scope}.` : ""} Si votre besoin est ailleurs, on part plutôt sur ce qui vous sert vraiment.`
        : `I design and build bespoke internal tools, shaped around the way a team works.${scope ? ` On subjects like this I work over a few days: ${scope}.` : ""} If your need sits elsewhere, we scope around what actually helps you.`,
    ];
  }
  const subject = step >= 2
    ? (fr ? "dernier message" : "last note")
    : step === 1
      ? (fr ? "une question rapide" : "one quick question")
      : (fr ? "votre suivi au quotidien" : "how you track things");
  return { subject: subject.slice(0, 180), body: assembleOutreach(context, settings, language, paragraphs), language };
}
