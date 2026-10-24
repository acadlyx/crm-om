import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { isSameOriginRequest } from "@/lib/security/http";
import { outstandingBalance } from "@/lib/operations/finance";

export const dynamic = "force-dynamic";

const upiIdSchema = z.string().trim().min(5).max(256)
  .regex(/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/, "Enter a valid UPI ID such as name@bank");
const amountSchema = z.coerce.number().finite().positive().max(9999999999)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Amount must have at most two decimal places.");
const createSchema = z.object({
  upiId: upiIdSchema,
  amount: amountSchema,
  customerId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  payerName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(160),
}).strict().refine((value) => Boolean(value.customerId || value.invoiceId), {
  message: "Choose a customer or invoice so the collection can be reconciled to the right workspace record.",
});

function jsonError(status: number, message: string) {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return jsonError(access.status, access.message);
  const permission = await requireWorkspacePermission(access, "upi-collections", "read");
  if (!permission.ok) return jsonError(permission.status, permission.message);

  try {
    const [rows, settings] = await Promise.all([
      db.upiCollection.findMany({
        where: { tenantId: access.tenantId },
        include: {
          customer: { select: { id: true, name: true, company: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true, customer: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.businessSettings.findUnique({ where: { tenantId: access.tenantId }, select: { businessName: true, currency: true } }),
    ]);
    return Response.json({
      data: rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        paidAt: row.paidAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      business: { name: settings?.businessName || "Business", currency: settings?.currency || "INR" },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("UPI collections read failed.", error instanceof Error ? error.message : "unknown");
    return jsonError(500, "Could not load UPI collection history. Refresh and retry.");
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError(403, "Cross-origin changes are not allowed.");
  const access = await requireWorkspaceAccess();
  if (!access.ok) return jsonError(access.status, access.message);
  const permission = await requireWorkspacePermission(access, "upi-collections", "create");
  if (!permission.ok) return jsonError(permission.status, permission.message);

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message || "Check the UPI collection details.");

  const values = parsed.data;
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.upiCollection.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: access.tenantId, idempotencyKey: values.idempotencyKey } },
      });
      if (existing) {
        const same = existing.upiId.toLowerCase() === values.upiId.toLowerCase()
          && Math.round(Number(existing.amount) * 100) === Math.round(values.amount * 100)
          && (existing.invoiceId ?? null) === (values.invoiceId ?? null)
          && (existing.customerId ?? null) === (values.customerId ?? null)
          && (existing.payerName ?? null) === (values.payerName || null)
          && (existing.notes ?? null) === (values.notes || null);
        if (!same) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        return { row: existing, replay: true as const };
      }

      let customerId = values.customerId ?? null;
      const invoiceId = values.invoiceId ?? null;
      if (invoiceId) {
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, tenantId: access.tenantId },
          include: {
            payments: { select: { amount: true, status: true } },
            receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } },
          },
        });
        if (!invoice) throw new Error("INVOICE_NOT_FOUND");
        if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") throw new Error("INVOICE_NOT_COLLECTIBLE");
        const balance = outstandingBalance(invoice.total, invoice.payments, invoice.receiptAllocations);
        if (balance <= 0.005) throw new Error("INVOICE_ALREADY_PAID");
        if (values.amount > balance + 0.005) throw new Error("AMOUNT_EXCEEDS_BALANCE");
        if (customerId && customerId !== invoice.customerId) throw new Error("CUSTOMER_INVOICE_MISMATCH");
        customerId = invoice.customerId;
      }
      if (customerId) {
        const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId: access.tenantId }, select: { id: true } });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      }

      const settings = await tx.businessSettings.findUnique({ where: { tenantId: access.tenantId }, select: { currency: true } });
      if (settings?.currency && settings.currency !== "INR") throw new Error("UPI_REQUIRES_INR");

      const transactionRef = "AYZ" + crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
      const row = await tx.upiCollection.create({
        data: {
          tenantId: access.tenantId,
          customerId,
          invoiceId,
          upiId: values.upiId.toLowerCase(),
          payerName: values.payerName || null,
          amount: values.amount,
          currency: "INR",
          transactionRef,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          notes: values.notes || null,
          createdByUserId: access.user.id,
          idempotencyKey: values.idempotencyKey,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: "UPI_COLLECTION_CREATED",
          entityType: "UpiCollection",
          entityId: row.id,
          metadata: { transactionRef, amount: values.amount, upiId: values.upiId.toLowerCase(), invoiceId, customerId },
        },
      });
      return { row, replay: false as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return Response.json({
      data: { ...result.row, amount: Number(result.row.amount), expiresAt: result.row.expiresAt?.toISOString() ?? null, createdAt: result.row.createdAt.toISOString() },
      idempotentReplay: result.replay,
    }, { status: result.replay ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const responses: Record<string, [number, string]> = {
      IDEMPOTENCY_KEY_CONFLICT: [409, "That retry key was already used for different collection details. Refresh the form and retry."],
      INVOICE_NOT_FOUND: [404, "Invoice not found in this workspace."],
      INVOICE_NOT_COLLECTIBLE: [409, "Draft or cancelled invoices cannot receive UPI collections."],
      INVOICE_ALREADY_PAID: [409, "This invoice has no outstanding balance."],
      AMOUNT_EXCEEDS_BALANCE: [409, "The QR amount exceeds the invoice's outstanding balance."],
      CUSTOMER_INVOICE_MISMATCH: [400, "The selected customer does not match the invoice."],
      CUSTOMER_NOT_FOUND: [404, "Customer not found in this workspace."],
      UPI_REQUIRES_INR: [400, "UPI QR collection currently supports INR workspaces only."],
    };
    if (responses[message]) return jsonError(...responses[message]);
    if ((error as { code?: string })?.code === "P2002") return jsonError(409, "A duplicate collection key was submitted. Retry the same request to retrieve the existing QR.");
    if ((error as { code?: string })?.code === "P2034") return jsonError(409, "Another collection changed the invoice at the same time. Retry this operation.");
    console.error("UPI collection creation failed.", (error as { code?: string })?.code || "UNKNOWN");
    return jsonError(500, "Could not create the UPI QR. Check the details and retry.");
  }
}
