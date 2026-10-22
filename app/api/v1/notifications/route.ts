import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "UNAUTHENTICATED", "Sign in to view notifications.");
  const params = new URL(request.url).searchParams;
  const parsedLimit = Number(params.get("limit") || 25);
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, Math.trunc(parsedLimit))) : 25;
  const [items, unreadCount] = await Promise.all([
    db.systemNotification.findMany({
      where: { recipientUserId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, body: true, href: true, sourceLabel: true, createdAt: true, readAt: true },
    }),
    db.systemNotification.count({ where: { recipientUserId: session.user.id, readAt: null } }),
  ]);
  return noStoreJson({ data: items, unreadCount });
}
