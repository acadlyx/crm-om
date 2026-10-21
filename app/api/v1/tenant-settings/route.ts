import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { z } from "zod";
export const dynamic = "force-dynamic";
const schema = z.object({
  businessName: z.string().trim().min(1).max(160),
  logoUrl: z.union([z.literal(""), z.string().url().max(2048)]).optional().transform(v => v || null),
  contactEmail: z.union([z.literal(""), z.string().email().max(320)]).optional().transform(v => v || null),
  contactPhone: z.string().max(40).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  invoicePrefix: z.string().trim().min(1).max(20),
  invoiceIdentity: z.record(z.string(), z.unknown()).default({}),
  preferences: z.record(z.string(), z.unknown()).default({})
}).strict();
export async function GET() {
  const access = await requireTenantUser();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  const settings = await db.businessSettings.findUnique({ where: { tenantId: access.user.tenantId! } });
  return NextResponse.json({ data: settings }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: NextRequest) {
  const access = await requireTenantUser();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });
  if (!["TENANT_ADMIN", "PLATFORM_ADMIN"].includes(access.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid business settings", details: parsed.error.flatten() }, { status: 400 });
  const data = await db.businessSettings.upsert({
    where: { tenantId: access.user.tenantId! },
    create: { ...parsed.data, tenantId: access.user.tenantId! },
    update: parsed.data
  });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
