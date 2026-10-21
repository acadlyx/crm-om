import "server-only";
import { db } from "@/lib/db";
import { buildSystemNotification } from "@/lib/branding/messages";

export type NewSystemNotification = {
  recipientUserId: string;
  title: string;
  body: string;
  href?: string;
  idempotencyKey?: string;
};

/** Persist a branded in-app notification; recipient-scoped idempotency prevents duplicate records. */
export async function createSystemNotification(input: NewSystemNotification) {
  if (input.idempotencyKey && (input.idempotencyKey.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey))) {
    throw new Error("Notification idempotency key is invalid.");
  }
  const branded = await buildSystemNotification({ title: input.title, body: input.body, href: input.href });
  const where = input.idempotencyKey
    ? { recipientUserId_idempotencyKey: { recipientUserId: input.recipientUserId, idempotencyKey: input.idempotencyKey } }
    : null;
  if (where) {
    const existing = await db.systemNotification.findUnique({ where });
    if (existing) return existing;
  }
  try {
    return await db.systemNotification.create({
      data: {
        recipientUserId: input.recipientUserId,
        title: branded.title,
        body: branded.body,
        href: branded.href,
        sourceLabel: branded.sourceLabel,
        supportEmail: branded.supportEmail,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    });
  } catch (error) {
    const uniqueConflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (uniqueConflict && where) {
      const existing = await db.systemNotification.findUnique({ where });
      if (existing) return existing;
    }
    throw error;
  }
}
