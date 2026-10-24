import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { writeAuditEvent } from "@/lib/crm/access";

const allowedRole = z.enum(["STAFF", "SALES", "DELIVERY", "COLLECTIONS", "INVENTORY_MANAGER", "ACCOUNTANT"]);
function fail(message: string, status = 400) {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}
function ownerRole(role: string) { return role === "TENANT_ADMIN" || role === "PLATFORM_ADMIN"; }

export async function GET() {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  if (!ownerRole(access.user.role)) return fail("Only the business owner can manage team accounts.", 403);
  try {
    const users = await db.user.findMany({
      where: { tenantId: access.tenantId },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 500,
    });
    return Response.json({ data: users }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    console.error("Team list failed:", code || "UNKNOWN");
    return fail("Team management is unavailable. Apply the pending team migration if this is a new deployment.", 503);
  }
}

export async function POST(request: Request) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  if (!ownerRole(access.user.role)) return fail("Only the business owner can create team accounts.", 403);
  const parsed = z.object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(320),
    password: z.string().min(12).max(200),
    role: allowedRole,
  }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Check the team member details.");
  const tenantId = access.tenantId;
  const email = parsed.data.email.toLowerCase();
  try {
    const passwordHash = await hash(parsed.data.password, 12);
    const user = await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true, tenantId: true } });
      if (existing) throw new Error(existing.tenantId === tenantId ? "EMAIL_ALREADY_IN_WORKSPACE" : "EMAIL_ALREADY_IN_USE");
      const created = await tx.user.create({
        data: { tenantId, name: parsed.data.name, email, passwordHash, role: parsed.data.role, isActive: true },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id, action: "TEAM_MEMBER_CREATED", entityType: "User", entityId: created.id,
          metadata: { role: created.role, email: created.email },
        },
      });
      return created;
    });
    return Response.json({ data: user }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "EMAIL_ALREADY_IN_WORKSPACE") return fail("A team member with this email already exists in your workspace.", 409);
    if (message === "EMAIL_ALREADY_IN_USE" || (error as { code?: string }).code === "P2002") return fail("This email address is already used by another account.", 409);
    console.error("Team create failed:", (error as { code?: string }).code || "UNKNOWN");
    return fail("Could not create this team member.", 500);
  }
}
