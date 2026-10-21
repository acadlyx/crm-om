import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireTenantUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { validateBrandingImage } from "@/lib/security/image-validation";
import { isSameOriginRequest, jsonError, noStoreJson } from "@/lib/security/http";
import { deletePublicAsset, isObjectStorageConfigured, uploadPublicAsset } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return jsonError(403, "INVALID_ORIGIN", "Cross-origin changes are not allowed.");
  const access = await requireTenantUser();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Tenant administrator access is required.");
  if (!isObjectStorageConfigured()) return jsonError(503, "STORAGE_NOT_CONFIGURED", "Logo uploads are unavailable until storage is configured.");
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 3 * 1024 * 1024) return jsonError(413, "UPLOAD_TOO_LARGE", "Upload request is too large.");

  let form: FormData;
  try { form = await request.formData(); }
  catch { return jsonError(400, "INVALID_FORM", "Upload form is invalid."); }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(422, "INVALID_UPLOAD", "Provide an image file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateBrandingImage(file, bytes, "logo");
  if (!validation.ok) return jsonError(422, "INVALID_IMAGE", validation.error);

  const settings = await db.businessSettings.findUnique({ where: { tenantId: access.user.tenantId! } });
  if (!settings) return jsonError(409, "BUSINESS_SETTINGS_REQUIRED", "Save your business details before uploading a logo.");
  let key: string | null = null;
  try {
    key = "tenants/" + access.user.tenantId + "/branding/" + randomUUID() + "." + validation.image.extension;
    const url = await uploadPublicAsset({ key, bytes, contentType: validation.image.mime });
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.businessSettings.update({ where: { tenantId: access.user.tenantId! }, data: { logoUrl: url } });
      await tx.auditLog.create({ data: { actorUserId: access.user.id, action: "tenant.business-logo.updated", entityType: "BusinessSettings", entityId: saved.id, metadata: { tenantId: access.user.tenantId } } });
      return saved;
    });
    return noStoreJson({ data: row });
  } catch (error) {
    if (key) {
      try { await deletePublicAsset(key); }
      catch (cleanupError) { console.error("Could not clean up tenant brand asset.", cleanupError instanceof Error ? cleanupError.message : "unknown error"); }
    }
    console.error("Tenant logo upload failed.", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "UPLOAD_FAILED", "The business logo could not be stored or saved.");
  }
}
