import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/authz";
import { updatePlatformBrandAsset } from "@/lib/branding/service";
import { validateBrandingImage } from "@/lib/security/image-validation";
import { isSameOriginRequest, jsonError, noStoreJson } from "@/lib/security/http";
import { deletePublicAsset, isObjectStorageConfigured, uploadPublicAsset } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return jsonError(403, "INVALID_ORIGIN", "Cross-origin changes are not allowed.");
  const access = await requirePlatformAdmin();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", "Only platform administrators can upload global brand assets.");
  if (!isObjectStorageConfigured()) return jsonError(503, "STORAGE_NOT_CONFIGURED", "Logo uploads are unavailable until S3-compatible storage is configured.");

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 3 * 1024 * 1024) return jsonError(413, "UPLOAD_TOO_LARGE", "Upload request is too large.");
  let form: FormData;
  try { form = await request.formData(); }
  catch { return jsonError(400, "INVALID_FORM", "Upload form is invalid."); }
  const kind = form.get("kind");
  const file = form.get("file");
  if ((kind !== "logo" && kind !== "favicon") || !(file instanceof File)) return jsonError(422, "INVALID_UPLOAD", "Provide an image file and choose logo or favicon.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateBrandingImage(file, bytes, kind);
  if (!validation.ok) return jsonError(422, "INVALID_IMAGE", validation.error);

  let key: string | null = null;
  try {
    key = "platform/branding/" + kind + "/" + randomUUID() + "." + validation.image.extension;
    const url = await uploadPublicAsset({ key, bytes, contentType: validation.image.mime });
    const branding = await updatePlatformBrandAsset(kind, url, access.user.id);
    revalidatePath("/", "layout");
    revalidatePath("/login");
    return noStoreJson({ data: { ...branding, url } });
  } catch (error) {
    if (key) {
      try { await deletePublicAsset(key); }
      catch (cleanupError) { console.error("Could not clean up uploaded branding asset.", cleanupError instanceof Error ? cleanupError.message : "unknown error"); }
    }
    console.error("Platform branding asset upload failed.", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "UPLOAD_FAILED", "The asset could not be stored or saved.");
  }
}
