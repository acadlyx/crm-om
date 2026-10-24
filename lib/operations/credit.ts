import "server-only";
import type { Prisma } from "@/generated/prisma/client";

function amount(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Computes current customer exposure as unpaid posted-invoice balance plus
 * confirmed/unbilled order value. A sales order is excluded when it is about
 * to be invoiced so its value is not counted twice.
 */
export async function customerCreditExposure(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerId: string,
  excludeSalesOrderId?: string,
): Promise<number> {
  const [invoices, orders] = await Promise.all([
    tx.invoice.findMany({
      where: { tenantId, customerId, status: { not: "CANCELLED" } },
      select: {
        total: true,
        payments: { select: { amount: true, status: true } },
        receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } },
      },
    }),
    tx.salesOrder.findMany({
      where: {
        tenantId,
        customerId,
        status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] },
        ...(excludeSalesOrderId ? { id: { not: excludeSalesOrderId } } : {}),
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
      select: { total: true },
    }),
  ]);

  const unpaidInvoices = invoices.reduce((sum, invoice) => {
    const payments = invoice.payments
      .filter((payment) => payment.status === "POSTED")
      .reduce((total, payment) => total + amount(payment.amount), 0);
    const allocations = invoice.receiptAllocations
      .filter((allocation) => allocation.receipt.status === "POSTED")
      .reduce((total, allocation) => total + amount(allocation.amount), 0);
    return sum + Math.max(0, amount(invoice.total) - payments - allocations);
  }, 0);
  const openOrders = orders.reduce((sum, order) => sum + amount(order.total), 0);
  return roundMoney(unpaidInvoices + openOrders);
}
