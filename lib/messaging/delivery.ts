import "server-only";
import { sendSystemEmail, EmailProviderNotConfiguredError } from "@/lib/messaging/resend";
import { createSystemNotification } from "@/lib/notifications/service";

/**
 * One server-side entry point for a system event. The in-app record is durable even if the
 * optional email provider is unconfigured or rejects the send. Email "accepted" is not delivered.
 */
export async function deliverSystemMessage(input: {
  recipientUserId: string;
  title: string;
  body: string;
  href?: string;
  emailTo?: string;
  idempotencyKey?: string;
}) {
  const notification = await createSystemNotification({
    recipientUserId: input.recipientUserId,
    title: input.title,
    body: input.body,
    href: input.href,
    idempotencyKey: input.idempotencyKey,
  });
  if (!input.emailTo) return { notification, email: { status: "not_requested" as const } };

  try {
    const email = await sendSystemEmail(input.emailTo, {
      subject: input.title,
      title: input.title,
      bodyText: input.body,
      ...(input.href ? { actionLabel: "Open notification", actionUrl: input.href } : {}),
    }, {
      idempotencyKey: input.idempotencyKey
        ? "system-message:" + input.recipientUserId + ":" + input.idempotencyKey
        : undefined,
    });
    return {
      notification,
      email: { status: "accepted" as const, provider: email.provider, providerMessageId: email.providerMessageId },
    };
  } catch (error) {
    return {
      notification,
      email: {
        status: "failed" as const,
        errorCode: error instanceof EmailProviderNotConfiguredError ? "provider_not_configured" as const : "delivery_failed" as const,
      },
    };
  }
}
