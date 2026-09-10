import type { ReplyCategory, ReplyClassification } from "../providers/types";
import { detectRisks, foldAccents } from "./rules";

const MATCHERS: [ReplyCategory, RegExp, number][] = [
  ["UNSUBSCRIBE", /\b(unsubscribe|remove me|stop emailing|do not contact|don't contact|no more emails|désabonne\w*|desabonne\w*|retirez[- ]moi|supprimez[- ]moi|ne me contactez plus|ne m['’]écrivez plus)\b|^(?:no|non|stop)[.!\s]*$/i, 0.99],
  ["OUT_OF_OFFICE", /\b(out of (the )?office|automatic reply|auto[- ]reply|on (annual )?leave|on vacation|absent\w* du bureau|réponse automatique|en congé\w*|de retour le)\b/i, 0.97],
  ["NOT_INTERESTED", /\b(not interested|no thanks|no thank you|not relevant|pas intéress\w*|pas interesse\w*|non merci|pas pertinent|aucun intérêt)\b/i, 0.98],
  ["NEGOTIATION", /\b(discount|cheaper|negotia\w*|remise|réduction|négoci\w*|moins cher|lower (the |your )?price|baisser (le |votre )?prix|budget is only)\b/i, 0.96],
  ["MEETING_REQUEST", /\b(book (a |some )?(call|meeting|time)|schedule (a |some )?(call|meeting)|let['’]s (talk|meet|speak)|calendar|available for a call|rendez[- ]vous|créneau|creneau|prenons.*appel|discutons|planifier.*appel)\b/i, 0.96],
  ["REFERRAL", /\b(contact (my|our)|speak (to|with) (my|our)|reach out to|forwarded.*(colleague|team)|contactez (mon|ma|notre)|voir avec|transmis.*collègue)\b/i, 0.94],
  ["NOT_NOW", /\b(not now|later|next (month|quarter|year)|in a few months|bad timing|pas maintenant|plus tard|mois prochain|trimestre prochain|pas le moment)\b/i, 0.94],
  ["QUESTION", /\?|\b(how does|how much|can you explain|what is|comment|combien|pouvez[- ]vous expliquer)\b/i, 0.89],
  ["POSITIVE", /\b(interested|sounds good|send (me |us )?(more|an outline|the outline|details)|yes please|happy to|intéress\w*|interesse\w*|bonne idée|envoyez|avec plaisir|oui volontiers)\b/i, 0.94],
];
export function classifyReplyRules(body: string, now = new Date()): ReplyClassification {
  const visible = body.split(/\n(?:On .+wrote:|Le .+écrit\s?:|_{5,}|-{5,}Original Message)/i)[0].replace(/^>.*$/gm, "").trim();
  const language = /\b(bonjour|merci|vous|nous|votre|notre|intéress|envoyez|désabonn|congé|rendez|créneau|français|plus tard|non)\w*/i.test(visible) ? "fr" : "en";
  const signedShortOptOut = /^(?:no|non|stop)[.! \t]*(?:\r?\n|$)/i.test(visible);
  const match = signedShortOptOut
    ? MATCHERS[0]
    : MATCHERS.find(([, pattern]) => new RegExp(foldAccents(pattern.source), pattern.flags).test(foldAccents(visible)));
  const category = match?.[0] || "UNKNOWN";
  const dateMatch = visible.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const parsedDate = dateMatch ? new Date(`${dateMatch[1]}T09:00:00.000Z`) : null;
  const returnDate = category === "OUT_OF_OFFICE" && parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate > now ? parsedDate.toISOString() : null;
  return { category, confidence: match?.[2] || 0.3, language, reasoning: `Classification par règles locales : ${category.toLowerCase().replaceAll("_", " ")}.`, returnDate, requiresHuman: ["MEETING_REQUEST", "NEGOTIATION", "UNKNOWN", "REFERRAL"].includes(category) || detectRisks(visible).length > 0 };
}
