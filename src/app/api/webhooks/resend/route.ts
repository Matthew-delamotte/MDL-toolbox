import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { handleResendEvent, resendEventSchema } from '@/lib/services/webhooks';
import { audit, errorText, json } from '@/lib/services/shared';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request:Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({error:'Le secret de signature des webhooks n’est pas configuré.'},{status:503});
  if (Number(request.headers.get('content-length') ?? 0)>1000000) return NextResponse.json({error:'Webhook trop volumineux.'},{status:413});
  const raw = await request.text();
  if (Buffer.byteLength(raw)>1000000) return NextResponse.json({error:'Webhook trop volumineux.'},{status:413});
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return NextResponse.json({error:'En-têtes de signature manquants.'},{status:401});
  let parsed:unknown;
  try { parsed = new Webhook(secret).verify(raw,{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':signature}); }
  catch { return NextResponse.json({error:'Signature de webhook invalide.'},{status:401}); }
  const event = resendEventSchema.safeParse(parsed);
  if (!event.success) return NextResponse.json({error:'Contenu de webhook invalide.'},{status:400});
  const claim = await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const found = await tx.webhookEvent.findUnique({where:{id}});
    if (found?.status === 'PROCESSED') return 'duplicate';
    if (found?.status === 'PROCESSING' && found.createdAt.getTime()>Date.now()-300000) return 'busy';
    await tx.webhookEvent.upsert({where:{id},create:{id,type:event.data.type,payload:json(event.data),status:'PROCESSING'},update:{status:'PROCESSING'}});
    return 'claimed';
  });
  if (claim === 'duplicate') return NextResponse.json({ok:true,duplicate:true});
  if (claim === 'busy') return NextResponse.json({error:'Webhook en cours de traitement ; réessayez plus tard.'},{status:503});
  try {
    await handleResendEvent(event.data);
    await db.webhookEvent.update({where:{id},data:{status:'PROCESSED',processedAt:new Date()}});
    return NextResponse.json({ok:true});
  } catch(error) {
    await db.webhookEvent.update({where:{id},data:{status:'FAILED'}});
    await audit('WEBHOOK_FAILED',errorText(error),undefined,{eventId:id,type:event.data.type},'ERROR');
    return NextResponse.json({error:'Le traitement du webhook a échoué ; une nouvelle tentative du fournisseur est sans risque.'},{status:503});
  }
}
