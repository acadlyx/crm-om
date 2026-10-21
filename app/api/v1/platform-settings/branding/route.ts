import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { getPlatformBranding } from "@/lib/branding/service";
import { brandingSchema } from "@/lib/security/branding-validation";

export const dynamic = "force-dynamic";
const noStore = { headers: { "Cache-Control": "no-store, max-age=0" } };

export async function GET() {
  return NextResponse.json({ data: await getPlatformBranding() }, noStore);
}
export async function PATCH(request: NextRequest) {
  const access = await requirePlatformAdmin();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status, ...noStore });
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Invalid origin" }, { status: 403, ...noStore }); }
    catch { return NextResponse.json({ error: "Invalid origin" }, { status: 403, ...noStore }); }
  }
  const raw = await request.json().catch(() => null);
  const parsed = brandingSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid branding configuration", details: parsed.error.flatten() }, { status: 400, ...noStore });
  const saved = await db.$transaction(async tx => {
    const before = await tx.platformSettings.findUnique({ where: { id: "global" } });
    const after = await tx.platformSettings.upsert({ where: { id: "global" }, create: { id: "global", ...parsed.data }, update: parsed.data });
    await tx.auditLog.create({ data: {
      actorUserId: access.user.id, action: "platform.branding.updated", entityType: "PlatformSettings", entityId: "global",
      metadata: { before: before ? { productName: before.productName, logoUrl: before.logoUrl, faviconUrl: before.faviconUrl, primaryColor: before.primaryColor } : null, after: { productName: after.productName, logoUrl: after.logoUrl, faviconUrl: after.faviconUrl, primaryColor: after.primaryColor } },
    }});
    return after;
  });
  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/platform-settings/branding");
  return NextResponse.json({ data: { ...saved, updatedAt: saved.updatedAt.toISOString() } }, noStore);
}
