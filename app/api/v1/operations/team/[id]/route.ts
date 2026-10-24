import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/crm/access";

function fail(message: string, status = 400) {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}
function ownerRole(role: string) { return role === "TENANT_ADMIN" || role === "PLATFORM_ADMIN"; }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  if (!ownerRole(access.user.role)) return fail("Only the business owner can manage team accounts.", 403);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid team member identifier.");

  const parsed = z.object({
    isActive: z.boolean().optional(),
    role: z.enum(["STAFF", "SALES", "DELIVERY", "COLLECTIONS", "INVENTORY_MANAGER", "ACCOUNTANT"]).optional(),
  }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return fail(parsed.success ? "Supply a role or active status." : "Invalid team account update.");
  if (id === access.user.id && (parsed.data.role !== undefined || parsed.data.isActive === false)) {
    return fail("You cannot change your own role or deactivate your own account.", 409);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, tenantId: access.tenantId },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      if (!existing) return { kind: "NOT_FOUND" as const };
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: parsed.data,
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: parsed.data.isActive === undefined ? "TEAM_MEMBER_ROLE_UPDATED" : "TEAM_MEMBER_ACCESS_UPDATED",
          entityType: "User",
          entityId: updated.id,
          metadata: { before: { role: existing.role, isActive: existing.isActive }, after: { role: updated.role, isActive: updated.isActive } },
        },
      });
      return { kind: "UPDATED" as const, user: updated };
    });
    if (result.kind === "NOT_FOUND") return fail("Team member not found in this workspace.", 404);
    return Response.json({ data: result.user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Team update failed:", (error as { code?: string }).code || "UNKNOWN");
    return fail("Could not update this team account.", 500);
  }
}
