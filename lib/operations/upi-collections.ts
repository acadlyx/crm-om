import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { invoiceStatusFromBalance, outstandingBalance } from "@/lib/operations/finance";

export type ReconcileUpiInput = {
  id: string;
  tenantId: string;
  actorUserId: string;
  utr: string;
  paidAt: Date;
  statementAmount?: number;
};

export type ReconcileUpiResult =
  | { kind: "RECONCILED"; status: "PAID"; paymentId?: string; receiptId?: string }
  | { kind: "ALREADY_RECONCILED"; status: "PAID"; paymentId?: string; receiptId?: string }
  | { kind: "NOT_FOUND" | "NOT_PENDING" | "EXPIRED" | "UTR_ALREADY_USED" | "AMOUNT_MISMATCH" | "INVOICE_NOT_FOUND" | "INVOICE_NOT_COLLECTIBLE" | "OVERPAYMENT" };

const sameAmount = (a: number, b: number) => Math.abs(Math.round(a * 100) - Math.round(b * 100)) === 0;

export async function reconcileUpiCollection(input: ReconcileUpiInput): Promise<ReconcileUpiResult> {
  return db.$transaction(async (tx) => {
    const intent = await tx.upiCollection.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: {
          include: {
            payments: { select: { id: true, amount: true, status: true } },
            receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } },
          },
        },
      },
    });
    if (!intent) return { kind: "NOT_FOUND" as const };
    if (intent.status === "PAID") {
      return intent.utr?.toLowerCase() === input.utr.toLowerCase()
        ? { kind: "ALREADY_RECONCILED" as const, status: "PAID" as const, paymentId: intent.paymentId ?? undefined, receiptId: intent.receiptId ?? undefined }
        : { kind: "NOT_PENDING" as const };
    }
    if (intent.status !== "PENDING") return { kind: "NOT_PENDING" as const };
    if (intent.expiresAt && intent.expiresAt.getTime() < Date.now()) {
      await tx.upiCollection.update({ where: { id: intent.id }, data: { status: "EXPIRED" } });
      return { kind: "EXPIRED" as const };
    }
    const amount = Number(intent.amount);
    if (input.statementAmount !== undefined && !sameAmount(input.statementAmount, amount)) {
      return { kind: "AMOUNT_MISMATCH" as const };
    }

    const priorUtr = await tx.upiCollection.findFirst({
      where: { tenantId: input.tenantId, utr: { equals: input.utr, mode: "insensitive" }, id: { not: intent.id } },
      select: { id: true },
    });
    if (priorUtr) return { kind: "UTR_ALREADY_USED" as const };
    const priorPayment = await tx.payment.findFirst({
      where: { tenantId: input.tenantId, reference: { equals: input.utr, mode: "insensitive" }, status: "POSTED" },
      select: { id: true },
    });
    const priorReceipt = await tx.customerReceipt.findFirst({
      where: { tenantId: input.tenantId, reference: { equals: input.utr, mode: "insensitive" }, status: "POSTED" },
      select: { id: true },
    });
    if (priorPayment || priorReceipt) return { kind: "UTR_ALREADY_USED" as const };

    let paymentId: string | undefined;
    let receiptId: string | undefined;
    if (intent.invoiceId) {
      const invoice = intent.invoice;
      if (!invoice) return { kind: "INVOICE_NOT_FOUND" as const };
      if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") {
        return { kind: "INVOICE_NOT_COLLECTIBLE" as const };
      }
      const balance = outstandingBalance(invoice.total, invoice.payments, invoice.receiptAllocations);
      if (amount > balance + 0.005) return { kind: "OVERPAYMENT" as const };

      const payment = await tx.payment.create({
        data: {
          tenantId: input.tenantId,
          invoiceId: invoice.id,
          amount: intent.amount,
          method: "UPI",
          reference: input.utr,
          paidAt: input.paidAt,
          status: "POSTED",
          idempotencyKey: "upi-collection-payment-" + intent.id,
          notes: ["Reconciled from UPI QR", intent.transactionRef, intent.notes].filter(Boolean).join(" · "),
        },
        select: { id: true },
      });
      paymentId = payment.id;
      const nextStatus = invoiceStatusFromBalance({
        total: invoice.total,
        paid: balance === 0 ? invoice.total : Number(invoice.total) - balance + amount,
        dueDate: invoice.dueDate,
        wasDraft: false,
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: nextStatus } });
      await tx.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          customerId: invoice.customerId,
          entryType: "CUSTOMER_PAYMENT",
          referenceType: "PAYMENT",
          referenceId: payment.id,
          description: "UPI payment against invoice " + invoice.invoiceNumber,
          debit: 0,
          credit: intent.amount,
          idempotencyKey: "upi-collection-ledger-" + intent.id,
          createdByUserId: input.actorUserId,
        },
      });
    } else {
      if (!intent.customerId || !intent.customer) return { kind: "NOT_FOUND" as const };
      const receiptNumber = "UPI-" + intent.transactionRef;
      const receipt = await tx.customerReceipt.create({
        data: {
          tenantId: input.tenantId,
          customerId: intent.customerId,
          receiptNumber,
          amount: intent.amount,
          method: "UPI",
          reference: input.utr,
          receivedAt: input.paidAt,
          status: "POSTED",
          idempotencyKey: "upi-collection-receipt-" + intent.id,
          notes: ["Reconciled from UPI QR", intent.transactionRef, intent.notes].filter(Boolean).join(" · "),
          createdByUserId: input.actorUserId,
        },
        select: { id: true },
      });
      receiptId = receipt.id;
      await tx.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          customerId: intent.customerId,
          entryType: "CUSTOMER_RECEIPT",
          referenceType: "CUSTOMER_RECEIPT",
          referenceId: receipt.id,
          description: "UPI customer receipt " + receiptNumber,
          debit: 0,
          credit: intent.amount,
          idempotencyKey: "upi-collection-ledger-" + intent.id,
          createdByUserId: input.actorUserId,
        },
      });
    }

    await tx.upiCollection.update({
      where: { id: intent.id },
      data: {
        status: "PAID",
        utr: input.utr,
        paidAt: input.paidAt,
        paymentId: paymentId ?? null,
        receiptId: receiptId ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "UPI_COLLECTION_RECONCILED",
        entityType: "UpiCollection",
        entityId: intent.id,
        metadata: {
          transactionRef: intent.transactionRef,
          amount,
          utr: input.utr,
          paymentId: paymentId ?? null,
          receiptId: receiptId ?? null,
        },
      },
    });
    return { kind: "RECONCILED" as const, status: "PAID" as const, paymentId, receiptId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
