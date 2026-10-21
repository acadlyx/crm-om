import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "UNAUTHENTICATED", "Sign in to update notifications.");
  const { id } = await context.params;
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!validId) return jsonError(404, "NOT_FOUND", "Notification was not found.");
  await db.systemNotification.updateMany({
    where: { id, recipientUserId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  const notification = await db.systemNotification.findFirst({
    where: { id, recipientUserId: session.user.id },
    select: { id: true, readAt: true },
  });
  if (!notification) return jsonError(404, "NOT_FOUND", "Notification was not found.");
  return noStoreJson({ data: notification });
}
