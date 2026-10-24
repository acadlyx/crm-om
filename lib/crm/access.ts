import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requireWorkspaceAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false as const, status: 401, message: "Please sign in again." };
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, tenantId: true },
  });

  if (!user || (user.role !== "TENANT_ADMIN" && user.role !== "STAFF" && !(user.role === "PLATFORM_ADMIN" && user.tenantId)) || !user.tenantId) {
    return {
      ok: false as const,
      status: 403,
      message: "A business workspace account is required to use CRM records.",
    };
  }

  return { ok: true as const, user, tenantId: user.tenantId };
}

export async function writeAuditEvent(input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: JSON.parse(JSON.stringify(input.metadata ?? {})),
    },
  });
}
