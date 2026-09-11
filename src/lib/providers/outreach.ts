import type { AdaptiveOffer, DraftSettings, LeadContext } from "./types";
import { languageFor } from "../domain/rules";

/**
 * Cold outreach used to be a fixed template with one AI-written noun phrase dropped into it:
 * every prospect received the same four sentences. That is exactly what makes an email read as
 * machine-sent. The model now writes the whole message from verified research, inside guardrails,
 * while the greeting, signature and opt-out line stay deterministic so compliance never depends
 * on a probabilistic output.
 */

const ANGLE: Record<number, string> = {
  0: "First contact. Open on their business, not on yours.",
  1: "Second message, three days later. Do NOT say you are following up or checking in. Take a different angle from a first email the reader may not have read: describe concretely what a small first step would look like for a business like theirs. The message must stand on its own.",
  2: "Final message, one week later. Short and honest: say plainly that you stop there, leave the door open without pressure, give them an easy way to come back later. No new argument, no urgency, no guilt.",
};

export function outreachInstruction(language: "fr" | "en", step: number): string {
  const target = language === "fr" ? "French" : "English";
  const lines = [
    `This email is addressed to the prospect: write the subject and every paragraph in ${target} and in that language only.`,
    "Write as Matthew, an independent consultant writing to a peer he respects, not a vendor running a campaign. The reader gets several automated emails a week and recognises them instantly. This one must not read like one.",
    ANGLE[Math.min(step, 2)],
    "subject: two to five words, plain and low-key, like an internal note from a colleague. No sales pitch, no urgency, no question mark, no exclamation, no emoji, no reader first name, no sender company name.",
    `paragraphs: ${step === 0 ? "exactly three paragraphs" : step === 1 ? "two paragraphs" : "one or two paragraphs"}, two or three sentences each, ${step === 0 ? "130" : "80"} words maximum in total. Short sentences, everyday professional language.`,
  ];
  if (step === 0) {
    lines.push(
      "Paragraph 1: one concrete, specific thing about THEIR business, taken from the supplied research or company description - the actual activity, a tool they use, something their own site states. Never open with who you are, never with a politeness formula, never with the equivalent of \"I came across your website\".",
      "Paragraph 2: the operational consequence that usually follows, phrased as a hypothesis about them, never as an observed fact. Then, concretely and in plain words, what you would build for that, drawn from the supplied offer solution and deliverables.",
      "Paragraph 3: one sentence on what MDL Advisory does - small internal tools and automations, scoped to one precise need, delivered in days. Then one single low-friction ask that can be answered in one line and leaves an easy way out: offering to send a short outline, or asking which process currently costs them the most time. Never ask for a call or a 30-minute slot.",
    );
  } else {
    lines.push("Stay concrete and specific to this company. Never summarise your previous email.");
  }
  lines.push(
    "Forbidden without exception: any price, any figure in euros or dollars, any delivery date, any guarantee, any commitment on scope, any invented client, reference, statistic or result.",
    "Forbidden wording: \"j'espere que ce message vous trouve\", \"je me permets\", \"n'hesitez pas\", \"leader\", \"cle en main\", \"solution innovante\", \"synergie\", \"revolutionnaire\", \"incontournable\", \"I hope this email finds you well\", \"leverage\", \"best-in-class\", \"cutting-edge\", \"game-changer\". No exclamation mark, no emoji, no bullet list, no link, no postscript.",
    "Address their world more than yours: \"vous\" must outweigh \"je\". Name the company at most twice. Claim nothing about the prospect that the supplied research does not support.",
  );
  return lines.join("\n");
}

/** Hard violations: content that must never reach a prospect, whatever the rest of the message is worth. */
export function outreachIssues(text: string): string[] {
  const issues: string[] = [];
  if (/\d[\d\s.,]*\s*(€|\$|eur\b|euros?\b|usd\b|k€)/i.test(text) || /[€$]\s*\d/.test(text)) issues.push("montant chiffré");
  if (/\bgarant(i|ie|ies|is|it|issons)\b|\bguarantee/i.test(text)) issues.push("garantie");
  if (/https?:\/\/|\bwww\./i.test(text)) issues.push("lien");
  if (/\b(sous|d['’]ici|within)\s+\d+\s*(jours?|semaines?|days?|weeks?)\b/i.test(text)) issues.push("délai chiffré");
  if (text.trim().split(/\s+/).length > 200) issues.push("trop long");
  return issues;
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
