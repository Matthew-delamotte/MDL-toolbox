import { Resend } from "resend";
import { isReservedEmail, normalizeEmail } from "../domain/rules";
import type { EmailProvider, EmailSendInput, EmailSendResult } from "./types";
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly dryRun = true) {}
  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const to = normalizeEmail(input.to);
    if (this.dryRun) return { id: `dry-run:${input.id}`, dryRun: true };
    if (!process.env.RESEND_API_KEY) throw new Error("L’envoi réel nécessite la clé RESEND_API_KEY");
    if (isReservedEmail(to)) throw new Error("Une adresse de démonstration ne peut pas recevoir d’email réel");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from: input.from, to: [to], replyTo: input.replyTo, subject: input.subject, text: input.body }, { idempotencyKey: `mdl-message/${input.id}` });
    if (error || !data) throw new Error(`Resend send failed: ${error?.message || "empty response"}`);
    return { id: data.id, dryRun: false };
  }
}
export function createEmailProvider(dryRun = true): EmailProvider { return new ResendEmailProvider(dryRun); }
