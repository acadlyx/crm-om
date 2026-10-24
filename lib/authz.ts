import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type AppRole = "PLATFORM_ADMIN" | "TENANT_ADMIN" | "STAFF";

export function canManagePlatformBranding(role: string | null | undefined): boolean {
  return role === "PLATFORM_ADMIN";
}
export function canManageTenantSettings(role: string | null | undefined, tenantId: string | null | undefined): boolean {
  return (role === "TENANT_ADMIN" || role === "PLATFORM_ADMIN") && typeof tenantId === "string" && tenantId.length > 0;
}
export function tenantScopeForSession(role: string | null | undefined, sessionTenantId: string | null | undefined, requestedTenantId?: string | null): string | null {
  if ((role !== "TENANT_ADMIN" && role !== "PLATFORM_ADMIN") || !sessionTenantId) return null;
  if (requestedTenantId && requestedTenantId !== sessionTenantId) return null;
  return sessionTenantId;
}

export async function requirePlatformAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, user: null };
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) return { ok: false as const, status: 401, user: null };
  if (!canManagePlatformBranding(user.role)) return { ok: false as const, status: 403, user: null };
  return { ok: true as const, user };
}

export async function requireTenantUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, user: null };
  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user || !canManageTenantSettings(user.role, user.tenantId)) return { ok: false as const, status: 403, user: null };
  return { ok: true as const, user };
}
