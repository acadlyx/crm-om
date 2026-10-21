import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function requirePlatformAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, user: null };
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return { ok: false as const, status: 401, user: null };
  if (user.role !== "PLATFORM_ADMIN") return { ok: false as const, status: 403, user: null };
  return { ok: true as const, user };
}
export async function requireTenantUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, user: null };
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user || !user.tenantId) return { ok: false as const, status: 403, user: null };
  return { ok: true as const, user };
}
