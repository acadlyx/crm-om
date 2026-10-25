import { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireTenantUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { normalizeDocumentTemplates } from "@/lib/documents/templates";
import { isSameOriginRequest, jsonError, noStoreJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET() {
  const access = await requireTenantUser();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Tenant administrator access is required.");
  const settings = await db.businessSettings.findUnique({ where: { tenantId: access.user.tenantId! } });
  if (!settings) return jsonError(409, "BUSINESS_SETTINGS_REQUIRED", "Save your business identity before configuring document templates.");
  const preferences = asObject(settings.preferences);
  return noStoreJson({ data: { templates: normalizeDocumentTemplates(preferences.documentTemplates), logoUrl: settings.logoUrl } });
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginRequest(request)) return jsonError(403, "INVALID_ORIGIN", "Cross-origin changes are not allowed.");
  const access = await requireTenantUser();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Tenant administrator access is required.");

  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "INVALID_JSON", "Request body must be valid JSON."); }
  const input = asObject(body);
  if (!input.templates || typeof input.templates !== "object" || Array.isArray(input.templates)) {
    return jsonError(422, "VALIDATION_ERROR", "Provide a document template configuration for each document type.");
  }
  const templates = normalizeDocumentTemplates(input.templates);
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.businessSettings.findUnique({ where: { tenantId: access.user.tenantId! } });
      if (!existing) throw new Error("BUSINESS_SETTINGS_REQUIRED");
      const preferences = asObject(existing.preferences);
      const updated = await tx.businessSettings.update({
        where: { tenantId: access.user.tenantId! },
        data: { preferences: { ...preferences, documentTemplates: templates } as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: "tenant.document-templates.updated",
          entityType: "BusinessSettings",
          entityId: updated.id,
          metadata: { tenantId: access.user.tenantId, documentTypes: ["invoice", "customerReceipt", "supplierBill", "supplierPayment"] },
        },
      });
      return updated;
    });
    const preferences = asObject(result.preferences);
    return noStoreJson({ data: { templates: normalizeDocumentTemplates(preferences.documentTemplates), logoUrl: result.logoUrl } });
  } catch (error) {
    if (error instanceof Error && error.message === "BUSINESS_SETTINGS_REQUIRED") {
      return jsonError(409, "BUSINESS_SETTINGS_REQUIRED", "Save your business identity before configuring document templates.");
    }
    console.error("Document template settings update failed.", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "DOCUMENT_TEMPLATES_UPDATE_FAILED", "Document templates could not be saved.");
  }
}
