import type { Company, Contact, Lead, Opportunity, GeneratedOffer, OfferTemplate, Campaign, Sequence, Message, Conversation, ReviewItem, PipelineDeal, ActivityLog, Suppression, SourceConfig } from "@prisma/client";

export type Serialized<T> = T extends Date ? string : T extends (infer U)[] ? Serialized<U>[] : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export interface Settings {
  dryRun: boolean;
  autopilotEnabled: boolean;
  minLeadScore: number;
  dailyEmailCap: number;
  dailyNewContactCap: number;
  autoReplyConfidence: number;
  companyName: string;
  senderName: string;
  signature: string;
  calendarUrl: string;
  fromEmail: string;
  replyTo: string;
  aiModel: string;
}
export type LeadView = Serialized<Lead & { company: Company; contact: Contact | null; opportunity: Opportunity | null; recommendedOffer: OfferTemplate | null; offers: GeneratedOffer[]; messages: Message[]; conversation: Conversation | null; deal: PipelineDeal | null }>;
export type CompanyView = Serialized<Company & { contacts: Contact[]; leads: Lead[] }>;
export type MessageView = Serialized<Message & { lead: Lead & { company: Company; contact: Contact | null } }>;
export type ReviewView = Serialized<ReviewItem & { lead: (Lead & { company: Company; contact: Contact | null; messages: Message[] }) | null; message: Message | null }>;
export type DealView = Serialized<PipelineDeal & { lead: Lead & { company: Company; contact: Contact | null; recommendedOffer: OfferTemplate | null } }>;
export interface Metrics {
  discoveredToday: number; leads: number; qualified: number; qualifiedRate: number;
  emailsSent: number; delivered: number; deliveryRate: number; replies: number; responseRate: number;
  positiveReplies: number; positiveResponseRate: number; meetings: number; offers: number; wins: number;
  revenue: number; estimatedPipeline: number; weightedPipeline: number; revenuePerLead: number;
  revenuePerEmail: number; leadToReply: number; replyToMeeting: number; meetingToWin: number; conversionRate: number;
}
export interface BreakdownRow { name: string; leads: number; sent: number; replies: number; wins: number; revenue: number }
export interface WorkspaceSnapshot {
  leads: LeadView[];
  companies: CompanyView[];
  opportunities: Serialized<Opportunity & { company: Company | null }>[];
  campaigns: Serialized<Campaign & { sequences: Sequence[]; _count: { leads: number; messages: number } }>[];
  messages: MessageView[];
  reviews: ReviewView[];
  deals: DealView[];
  offers: Serialized<OfferTemplate>[];
  activities: Serialized<ActivityLog>[];
  suppressions: Serialized<Suppression>[];
  sources: Serialized<SourceConfig>[];
  settings: Settings;
  providers: { openai: boolean; resend: boolean; tavily: boolean; hunter: boolean; inngest: boolean; webhook: boolean };
  budgets: { key: string; label: string; window: "day" | "month"; plan: string; used: number; limit: number; remaining: number; period: string }[];
  metrics: Metrics;
  trend: { date: string; leads: number; sent: number; replies: number }[];
  breakdowns: Record<"source" | "country" | "campaign" | "offer" | "industry", BreakdownRow[]>;
  user: { name: string; email: string };
}

// POST /api/actions contract. Every successful mutation returns {ok:true,result}.
export type WorkspaceAction =
  | { action: "discover"; query: string; campaignId?: string }
  | { action: "process-lead"; leadId: string; campaignId?: string }
  | { action: "generate-outreach"; leadId: string; campaignId?: string }
  | { action: "send-message"; messageId: string }
  | { action: "simulate-reply"; leadId: string; body: string; subject?: string }
  | { action: "compose-reply"; leadId: string; body: string }
  | { action: "followups" }
  | { action: "import-csv"; csv: string }
  | { action: "review"; id: string; decision: "approve" | "reject" | "handoff" | "blacklist" | "edit"; body?: string }
  | { action: "blacklist"; leadId: string; reason?: string }
  | { action: "create-campaign"; name: string; target: string; country: string; dailyLimit: number; minLeadScore: number; autopilotEnabled: boolean; employeesMin: number; employeesMax: number }
  | { action: "update-campaign"; id: string; status?: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED"; autopilotEnabled?: boolean; dailyLimit?: number; name?: string; target?: string; country?: string; minLeadScore?: number; employeesMin?: number; employeesMax?: number }
  | { action: "move-deal"; id: string; stage: string; estimatedValue?: number; nextAction?: string }
  | { action: "save-settings"; settings: Partial<Omit<Settings, "dryRun">> }
  | { action: "update-message"; id: string; subject: string; body: string }
  | { action: "update-source"; id: string; enabled: boolean };
