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
  if (!z.string().uuid().safeParse(id).success) return jsonError(400, "Invalid UPI collection identifier.");
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message || "Enter a valid UTR and payment date.");

  try {
    const result = await reconcileUpiCollection({
      id,
      tenantId: access.tenantId,
      actorUserId: access.user.id,
      utr: parsed.data.utr,
      paidAt: parsed.data.paidAt ?? new Date(),
      statementAmount: parsed.data.amount,
    });
    switch (result.kind) {
      case "RECONCILED":
        return Response.json({ data: result, message: "Payment reconciled and added to financial history." }, { headers: { "Cache-Control": "private, no-store" } });
      case "ALREADY_RECONCILED":
        return Response.json({ data: result, idempotentReplay: true, message: "This UTR was already reconciled; no duplicate payment was created." }, { headers: { "Cache-Control": "private, no-store" } });
      case "NOT_FOUND": return jsonError(404, "UPI collection not found in this workspace.");
      case "NOT_PENDING": return jsonError(409, "Only a pending UPI collection can be reconciled. Refresh history to see its current status.");
      case "EXPIRED": return jsonError(409, "This QR has expired. Generate a new QR before recording another payment.");
      case "UTR_ALREADY_USED": return jsonError(409, "This UTR already exists in payment history. It cannot be applied twice.");
      case "AMOUNT_MISMATCH": return jsonError(409, "The statement amount does not match the QR amount.");
      case "INVOICE_NOT_FOUND": return jsonError(404, "The linked invoice no longer exists in this workspace.");
      case "INVOICE_NOT_COLLECTIBLE": return jsonError(409, "The linked invoice is a draft or cancelled and cannot receive payments.");
      case "OVERPAYMENT": return jsonError(409, "This payment exceeds the current outstanding invoice balance. Refresh the invoice before reconciling.");
    }
  } catch (error) {
    if (isMissingUpiCollectionTable(error)) return jsonError(503, UPI_SCHEMA_NOT_READY_MESSAGE);
    if ((error as { code?: string })?.code === "P2002") return jsonError(409, "That UTR or payment key already exists. Refresh payment history before retrying.");
    if ((error as { code?: string })?.code === "P2034") return jsonError(409, "Another transaction changed this invoice at the same time. Retry the reconciliation.");
    console.error("UPI reconciliation failed.", (error as { code?: string })?.code || "UNKNOWN");
    return jsonError(500, "Could not reconcile this payment. Its history was not intentionally changed; refresh and retry.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return jsonError(403, "Cross-origin changes are not allowed.");
  const access = await requireWorkspaceAccess();
  if (!access.ok) return jsonError(access.status, access.message);
  const permission = await requireWorkspacePermission(access, "upi-collections", "delete");
  if (!permission.ok) return jsonError(permission.status, permission.message);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonError(400, "Invalid UPI collection identifier.");

  try {
    const result = await db.$transaction(async (tx) => {
      const row = await tx.upiCollection.findFirst({ where: { id, tenantId: access.tenantId } });
      if (!row) return "NOT_FOUND";
      if (row.status !== "PENDING") return "IMMUTABLE";
      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: "UPI_COLLECTION_DELETED",
          entityType: "UpiCollection",
          entityId: row.id,
          metadata: { transactionRef: row.transactionRef, amount: Number(row.amount), reason: "Pending collection cancelled by authorized user" },
        },
      });
      await tx.upiCollection.delete({ where: { id: row.id } });
      return "DELETED";
    });
    if (result === "NOT_FOUND") return jsonError(404, "UPI collection not found in this workspace.");
    if (result === "IMMUTABLE") return jsonError(409, "Paid, expired or failed UPI history is retained for audit. Do not delete a financial record.");
    return Response.json({ data: { id, deleted: true } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isMissingUpiCollectionTable(error)) return jsonError(503, UPI_SCHEMA_NOT_READY_MESSAGE);
    console.error("UPI collection delete failed.", (error as { code?: string })?.code || "UNKNOWN");
    return jsonError(500, "Could not delete this pending collection. Refresh and retry.");
  }
}
