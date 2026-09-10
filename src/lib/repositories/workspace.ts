import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { budgetSnapshot } from "@/lib/providers/budget";
import type { WorkspaceSnapshot, BreakdownRow } from "@/lib/contracts";

const rate = (numerator: number, denominator: number) => denominator ? Math.round(numerator / denominator * 1000) / 10 : 0;
const sentStatuses = new Set(["SENT", "DELIVERED", "SIMULATED", "BOUNCED", "COMPLAINED"]);
export async function getWorkspace(user: { name: string; email: string }): Promise<WorkspaceSnapshot> {
  const [leads, companies, opportunities, campaigns, messages, reviews, deals, offers, activities, suppressions, sources, settings, budgets] = await Promise.all([
    db.lead.findMany({ orderBy: { createdAt: "desc" }, include: { company: true, contact: true, opportunity: true, recommendedOffer: true, offers: { orderBy: { createdAt: "desc" } }, messages: { orderBy: { createdAt: "asc" } }, conversation: true, deal: true } }),
    db.company.findMany({ orderBy: { createdAt: "desc" }, include: { contacts: true, leads: true } }),
    db.opportunity.findMany({ orderBy: { createdAt: "desc" }, include: { company: true } }),
    db.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { sequences: { orderBy: { stepNumber: "asc" } }, _count: { select: { leads: true, messages: true } } } }),
    db.message.findMany({ orderBy: { createdAt: "desc" }, include: { lead: { include: { company: true, contact: true } } } }),
    db.reviewItem.findMany({ orderBy: { createdAt: "desc" }, include: { lead: { include: { company: true, contact: true, messages: { orderBy: { createdAt: "asc" } } } }, message: true } }),
    db.pipelineDeal.findMany({ orderBy: { updatedAt: "desc" }, include: { lead: { include: { company: true, contact: true, recommendedOffer: true } } } }),
    db.offerTemplate.findMany({ orderBy: { minPrice: "asc" } }),
    db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 250 }), db.suppression.findMany({ orderBy: { createdAt: "desc" } }),
    db.sourceConfig.findMany({ orderBy: { name: "asc" } }), getSettings(), budgetSnapshot(),
  ]);
  const outbound = messages.filter(message => message.direction === "OUTBOUND" && sentStatuses.has(message.status));
  const inbound = messages.filter(message => message.direction === "INBOUND");
  const repliedLeadIds = new Set(inbound.map(message => message.leadId));
  const contactedLeadIds = new Set(outbound.map(message => message.leadId));
  const positiveLeadIds = new Set(inbound.filter(message => ["POSITIVE", "MEETING_REQUEST"].includes(message.aiClassification || "")).map(message => message.leadId));
  const meetingDeals = deals.filter(deal => ["MEETING", "PROPOSAL", "WON"].includes(deal.stage));
  const wonDeals = deals.filter(deal => deal.stage === "WON");
  const openDeals = deals.filter(deal => !["WON", "LOST"].includes(deal.stage));
  const revenue = wonDeals.reduce((sum, deal) => sum + deal.estimatedValue, 0);
  const qualified = leads.filter(lead => lead.totalScore >= 75).length;
  const realSent = outbound.filter(message => !message.dryRun);
  const delivered = realSent.filter(message => message.deliveredAt || message.status === "DELIVERED").length;
  const today = new Date().toISOString().slice(0, 10);
  const metrics = {
    discoveredToday: leads.filter(lead => lead.createdAt.toISOString().startsWith(today)).length,
    leads: leads.length, qualified, qualifiedRate: rate(qualified, leads.length), emailsSent: outbound.length, delivered,
    deliveryRate: rate(delivered, realSent.length), replies: repliedLeadIds.size, responseRate: rate([...repliedLeadIds].filter(id => contactedLeadIds.has(id)).length, contactedLeadIds.size),
    positiveReplies: positiveLeadIds.size, positiveResponseRate: rate(positiveLeadIds.size, repliedLeadIds.size), meetings: meetingDeals.length,
    offers: leads.reduce((sum, lead) => sum + lead.offers.length, 0), wins: wonDeals.length, revenue,
    estimatedPipeline: openDeals.reduce((sum, deal) => sum + deal.estimatedValue, 0), weightedPipeline: openDeals.reduce((sum, deal) => sum + deal.estimatedValue * deal.probability / 100, 0),
    revenuePerLead: leads.length ? revenue / leads.length : 0, revenuePerEmail: outbound.length ? revenue / outbound.length : 0,
    leadToReply: rate(repliedLeadIds.size, leads.length), replyToMeeting: rate(meetingDeals.length, repliedLeadIds.size), meetingToWin: rate(wonDeals.length, meetingDeals.length), conversionRate: rate(wonDeals.length, leads.length),
  };
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10);
    return { date, leads: leads.filter(lead => lead.createdAt.toISOString().startsWith(date)).length,
      sent: outbound.filter(message => message.sentAt?.toISOString().startsWith(date)).length,
      replies: inbound.filter(message => message.receivedAt?.toISOString().startsWith(date)).length };
  });
  function breakdown(dimension: "source" | "country" | "campaign" | "offer" | "industry"): BreakdownRow[] {
    const groups = new Map<string, BreakdownRow>();
    for (const lead of leads) {
      const name = dimension === "source" ? lead.source : dimension === "country" ? lead.company.country : dimension === "industry" ? lead.company.industry : dimension === "offer" ? lead.recommendedOffer?.name || "Unassigned" : campaigns.find(campaign => campaign.id === lead.campaignId)?.name || "Unassigned";
      const row = groups.get(name) || { name, leads: 0, sent: 0, replies: 0, wins: 0, revenue: 0 };
      row.leads++; row.sent += outbound.filter(message => message.leadId === lead.id).length;
      if (repliedLeadIds.has(lead.id)) row.replies++;
      if (lead.deal?.stage === "WON") { row.wins++; row.revenue += lead.deal.estimatedValue; }
      groups.set(name, row);
    }
    return [...groups.values()].sort((a, b) => b.leads - a.leads);
  }
  return JSON.parse(JSON.stringify({ leads, companies, opportunities, campaigns, messages, reviews, deals, offers, activities, suppressions, sources, settings, budgets,
    providers: { openai: Boolean(process.env.OPENAI_API_KEY), resend: Boolean(process.env.RESEND_API_KEY), tavily: Boolean(process.env.TAVILY_API_KEY), hunter: Boolean(process.env.HUNTER_API_KEY), inngest: Boolean(process.env.INNGEST_EVENT_KEY), webhook: Boolean(process.env.RESEND_WEBHOOK_SECRET) },
    metrics, trend, breakdowns: { source: breakdown("source"), country: breakdown("country"), campaign: breakdown("campaign"), offer: breakdown("offer"), industry: breakdown("industry") }, user,
  })) as WorkspaceSnapshot;
}
