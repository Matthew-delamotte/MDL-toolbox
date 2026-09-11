export type Language = "en" | "fr";
export interface ResearchFact { field: string; value: string; status: "verified" | "inferred" | "unknown"; sourceUrl: string | null }
export interface CompanyInput { name: string; domain: string; website: string; country?: string; industry?: string; employeeEstimate?: number | null; description?: string; technologies?: string[]; research?: unknown; isDemo?: boolean }
export interface ContactInput { fullName: string; firstName?: string; lastName?: string; jobTitle?: string; email: string | null; emailStatus: string; language?: string; source?: string; linkedinUrl?: string | null }
export interface RawOpportunity { externalId?: string; company: CompanyInput; contact?: ContactInput; title: string; description: string; source: string; sourceUrl: string; budgetMin?: number; budgetMax?: number; currency?: string; location?: string; rawPayload?: Record<string, unknown> }
export interface LeadContext { company: CompanyInput; contact?: ContactInput | null; opportunity?: {title: string; description: string; budgetMin?: number | null; budgetMax?: number | null} | null; research?: ResearchFact[]; detectedProblems?: string[]; totalScore?: number; campaignCountry?: string | null }
export interface ScoreResult { fitScore: number; valueScore: number; deliverabilityScore: number; clientQualityScore: number; recurringPotentialScore: number; totalScore: number; confidence: number; detectedProblems: string[]; reasoning: string }
export interface OfferTemplateInput { id: string; name: string; slug: string; description: string; minPrice: number; maxPrice: number; typicalDeliveryDays: string; enabled: boolean }
export interface AdaptiveOffer { offerTemplateId: string; title: string; problem: string; proposedSolution: string; deliverables: string[]; estimatedPriceMin: number; estimatedPriceMax: number; estimatedDuration: string; rationale: string }
export interface DraftSettings { senderName: string; companyName: string; signature: string; calendarUrl?: string }
export interface DraftResult { subject: string; body: string; language: Language; fallbackReason?: string; rejectedDraft?: string[] }
export const REPLY_CATEGORIES = ["POSITIVE", "QUESTION", "NOT_NOW", "NOT_INTERESTED", "REFERRAL", "MEETING_REQUEST", "NEGOTIATION", "UNSUBSCRIBE", "OUT_OF_OFFICE", "UNKNOWN"] as const;
export type ReplyCategory = typeof REPLY_CATEGORIES[number];
export interface ReplyClassification { category: ReplyCategory; confidence: number; language: Language; reasoning: string; returnDate: string | null; requiresHuman: boolean }
export interface AIService {
  readonly mode: "live" | "development";
  research(context: LeadContext): Promise<ResearchFact[]>;
  score(context: LeadContext): Promise<ScoreResult>;
  generateOffer(context: LeadContext, templates: OfferTemplateInput[]): Promise<AdaptiveOffer>;
  draftOutreach(context: LeadContext, offer: AdaptiveOffer, settings: DraftSettings, step?: number): Promise<DraftResult>;
  classifyReply(body: string): Promise<ReplyClassification>;
  draftReply(context: LeadContext, incoming: string, classification: ReplyClassification, settings: DraftSettings): Promise<DraftResult>;
}
export interface LeadSourceAdapter { discover(query: string, exclude?: string[]): Promise<RawOpportunity[]> }
export interface EmailSendInput { id: string; to: string; from: string; replyTo?: string; subject: string; body: string }
export interface EmailSendResult { id: string; dryRun: boolean }
export interface EmailProvider { send(input: EmailSendInput): Promise<EmailSendResult> }
