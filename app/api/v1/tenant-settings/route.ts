import { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireTenantUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { tenantSettingsSchema } from "@/lib/security/branding-validation";
import { isSameOriginRequest, jsonError, noStoreJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireTenantUser();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Tenant administrator access is required.");
  const requestedTenant = new URL(request.url).searchParams.get("tenantId");
  if (requestedTenant && requestedTenant !== access.user.tenantId) return jsonError(403, "TENANT_SCOPE_VIOLATION", "You cannot access another tenant's business settings.");
  const settings = await db.businessSettings.findUnique({ where: { tenantId: access.user.tenantId! } });
  return noStoreJson({ data: settings });
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginRequest(request)) return jsonError(403, "INVALID_ORIGIN", "Cross-origin changes are not allowed.");
  const access = await requireTenantUser();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Tenant administrator access is required.");
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "INVALID_JSON", "Request body must be valid JSON."); }
  const parsed = tenantSettingsSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "VALIDATION_ERROR", "Check the business settings and try again.");

  try {
    const data = await db.$transaction(async (tx) => {
      const { invoiceIdentity, preferences, ...fields } = parsed.data;
      const row = await tx.businessSettings.upsert({
        where: { tenantId: access.user.tenantId! },
        create: {
          ...fields,
          tenantId: access.user.tenantId!,
          invoiceIdentity: invoiceIdentity as Prisma.InputJsonValue,
          preferences: preferences as Prisma.InputJsonValue,
        },
        update: {
          ...fields,
          invoiceIdentity: invoiceIdentity as Prisma.InputJsonValue,
          preferences: preferences as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: "tenant.business-settings.updated",
          entityType: "BusinessSettings",
          entityId: row.id,
          metadata: { tenantId: access.user.tenantId },
        },
      });
      return row;
    });
    return noStoreJson({ data });
  } catch (error) {
    console.error("Tenant business settings update failed.", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "TENANT_SETTINGS_UPDATE_FAILED", "Business settings could not be saved.");
  }
}
