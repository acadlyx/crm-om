import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildSystemEmail, type SystemMessage } from "@/lib/branding/messages";

const recipientSchema = z.union([
  z.string().trim().email().max(320),
  z.array(z.string().trim().email().max(320)).min(1).max(50),
]);

export class EmailProviderNotConfiguredError extends Error {
  constructor() {
    super("Resend delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
    this.name = "EmailProviderNotConfiguredError";
  }
}
export class EmailDeliveryError extends Error {
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "EmailDeliveryError";
    this.statusCode = statusCode;
  }
}
function safeDisplayName(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").replaceAll("\\", "\\\\").replaceAll('"', '\\"').trim().slice(0, 120) || "Notifications";
}

/** Sends through Resend and renders the current database branding at send time. */
export async function sendSystemEmail(
  to: string | string[],
  message: SystemMessage,
  options: { idempotencyKey?: string } = {},
) {
  const recipients = recipientSchema.safeParse(to);
  if (!recipients.success) throw new EmailDeliveryError("One or more recipient addresses are invalid.");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !fromAddress) throw new EmailProviderNotConfiguredError();
  const validFrom = z.string().email().max(320).safeParse(fromAddress);
  if (!validFrom.success) throw new EmailDeliveryError("RESEND_FROM_EMAIL must be a single valid email address.");
  if (!message.subject.trim() || message.subject.length > 240 || /[\r\n]/.test(message.subject)) {
    throw new EmailDeliveryError("Email subject must be 1–240 characters and cannot contain newlines.");
  }
  if (options.idempotencyKey && (options.idempotencyKey.length > 256 || /[\r\n]/.test(options.idempotencyKey))) {
    throw new EmailDeliveryError("Email idempotency key is invalid.");
  }

  const rendered = await buildSystemEmail(message);
  const senderName = safeDisplayName(rendered.branding.productName);
  const recipientList = Array.isArray(recipients.data) ? recipients.data : [recipients.data];
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": options.idempotencyKey || randomUUID(),
      },
      body: JSON.stringify({
        from: '"' + senderName + '" <' + validFrom.data + ">",
        to: recipientList,
        subject: message.subject.trim(),
        html: rendered.html,
        text: rendered.text,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw new EmailDeliveryError("Email provider could not be reached; acceptance was not confirmed.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new EmailDeliveryError("Email provider rejected the message (HTTP " + response.status + ").", response.status);
  if (!payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string" || !payload.id) {
    throw new EmailDeliveryError("Email provider response did not include a message identifier.", response.status);
  }
  return { provider: "resend" as const, providerMessageId: payload.id, status: "accepted" as const };
}
