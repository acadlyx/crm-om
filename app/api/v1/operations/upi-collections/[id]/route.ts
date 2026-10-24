import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { isSameOriginRequest } from "@/lib/security/http";
import { reconcileUpiCollection } from "@/lib/operations/upi-collections";
import { isMissingUpiCollectionTable, UPI_SCHEMA_NOT_READY_MESSAGE } from "@/lib/operations/upi-schema-error";

export const dynamic = "force-dynamic";

const utrSchema = z.string().trim().min(6).max(160).regex(/^[A-Za-z0-9._/-]+$/, "Enter the UTR / transaction reference shown by the bank.");
const schema = z.object({
  utr: utrSchema,
  paidAt: z.coerce.date().optional(),
  amount: z.coerce.number().finite().positive().optional(),
}).strict();

function jsonError(status: number, message: string) {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return jsonError(403, "Cross-origin changes are not allowed.");
  const access = await requireWorkspaceAccess();
  if (!access.ok) return jsonError(access.status, access.message);
  const permission = await requireWorkspacePermission(access, "upi-collections", "update");
  if (!permission.ok) return jsonError(permission.status, permission.message);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id¶»§q«^