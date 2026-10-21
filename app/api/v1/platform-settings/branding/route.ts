import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/authz";
import { getPlatformBranding, updatePlatformBranding } from "@/lib/branding/service";
import { brandingSchema } from "@/lib/security/branding-validation";
import { isSameOriginRequest, jsonError, noStoreJson } from "@/lib/security/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return noStoreJson({ data: await getPlatformBranding() });
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request)) return jsonError(403, "INVALID_ORIGIN", "Cross-origin changes are not allowed.");
  const access = await requirePlatformAdmin();
  if (!access.ok) return jsonError(access.status, access.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
    access.status === 401 ? "Sign in to continue." : "Only platform administrators can update global branding.");

  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "INVALID_JSON", "Request body must be valid JSON."); }
  const parsed = brandingSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "VALIDATION_ERROR", "Check the branding fields and try again.");

  try {
    const data = await updatePlatformBranding(parsed.data, access.user.id);
    // Dynamic branding reads use no persistent cache; layout invalidation also refreshes framework-level surfaces.
    revalidatePath("/", "layout");
    revalidatePath("/login");
    revalidatePath("/platform-settings/branding");
    return noStoreJson({ data });
  } catch (error) {
    console.error("Platform branding update failed.", error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "BRANDING_UPDATE_FAILED", "Branding could not be saved. Please try again.");
  }
}
