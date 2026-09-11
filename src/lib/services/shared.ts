import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { LeadContext, ResearchFact } from '@/lib/providers/types';

export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function audit(action: string, message: string, entityId?: string, metadata: unknown = {}, level = 'INFO') {
  return db.activityLog.create({data: {action, message, entityId, entityType: entityId ? 'Lead' : 'System', metadata: json(metadata), level}});
}
export async function contextFor(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({where:{id:leadId}, include:{company:true, contact:true, opportunity:true, campaign:true}});
  const context: LeadContext = {company:lead.company, contact:lead.contact, opportunity:lead.opportunity, research:Array.isArray(lead.company.research) ? lead.company.research as unknown as ResearchFact[] : [], detectedProblems:lead.detectedProblems, totalScore:lead.totalScore, campaignCountry:lead.campaign?.country ?? null};
  return {lead, context};
}
export async function review(input: {leadId: string; messageId?: string; type: string; title: string; description: string; proposedAction?: string}) {
  const existing = await db.reviewItem.findFirst({where:{leadId:input.leadId, messageId:input.messageId ?? null, type:input.type, status:'PENDING'}});
  return existing ?? db.reviewItem.create({data:{...input, proposedAction:input.proposedAction ?? 'Approuver, modifier, refuser ou reprendre en main.'}});
}
export async function pipeline(leadId:string, stage:string, nextAction:string, estimatedValue?:number) {
  const probability = ({DISCOVERED:10,QUALIFIED:20,CONTACTED:25,REPLIED:35,INTERESTED:50,MEETING:65,PROPOSAL:75,WON:100,LOST:0} as Record<string,number>)[stage] ?? 10;
  return db.pipelineDeal.upsert({where:{leadId},create:{leadId,stage,nextAction,probability,estimatedValue:estimatedValue ?? 0},update:{stage,nextAction,probability,...(estimatedValue === undefined ? {} : {estimatedValue})}});
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
