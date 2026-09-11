import { z } from "zod";
import { REPLY_CATEGORIES, type AdaptiveOffer, type OfferTemplateInput } from "../providers/types";
export const researchFactSchema = z.object({ field: z.string().min(1), value: z.string(), status: z.enum(["verified", "inferred", "unknown"]), sourceUrl: z.string().nullable() });
export const researchSchema = z.object({ facts: z.array(researchFactSchema) });
export const scoreSchema = z.object({ fitScore: z.number().min(0).max(30), valueScore: z.number().min(0).max(25), deliverabilityScore: z.number().min(0).max(20), clientQualityScore: z.number().min(0).max(15), recurringPotentialScore: z.number().min(0).max(10), totalScore: z.number().min(0).max(100), confidence: z.number().min(0).max(1), detectedProblems: z.array(z.string()), reasoning: z.string().min(1) });
export const offerSchema = z.object({ offerTemplateId: z.string(), title: z.string().min(1), problem: z.string().min(1), proposedSolution: z.string().min(1), deliverables: z.array(z.string().min(1)).min(1).max(8), estimatedPriceMin: z.number().positive(), estimatedPriceMax: z.number().positive(), estimatedDuration: z.string().min(1), rationale: z.string().min(1) });
export const draftSchema = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(6000), language: z.enum(["en", "fr"]) });
export const outreachSchema = z.object({ subject: z.string().min(3).max(90), paragraphs: z.array(z.string().min(15).max(500)).min(1).max(4) });
export const classificationSchema = z.object({ category: z.enum(REPLY_CATEGORIES), confidence: z.number().min(0).max(1), language: z.enum(["en", "fr"]), reasoning: z.string(), returnDate: z.string().nullable(), requiresHuman: z.boolean() });
export function validateOffer(value: unknown, templates: OfferTemplateInput[]): AdaptiveOffer {
  const offer = offerSchema.parse(value);
  const template = templates.find(t => t.id === offer.offerTemplateId && t.enabled);
  if (!template) throw new Error("Offer must belong to an enabled MDL offer family");
  if (offer.estimatedPriceMax < offer.estimatedPriceMin || offer.estimatedPriceMin < template.minPrice || offer.estimatedPriceMax > template.maxPrice) throw new Error("Offer estimate must stay within its family price range");
  return offer;
}
