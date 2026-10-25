import { requireWorkspaceAccess } from "@/lib/crm/access";
import { db } from "@/lib/db";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { normalizeDocumentTemplates } from "@/lib/documents/templates";
import { renderDocumentPdf, type DocumentPDFData } from "@/lib/documents/pdf-renderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function money(value: unknown, currency: string): string {
  let safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "INR";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: safeCurrency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(Number(value ?? 0)).replace(/[\u00a0\u202f]/g, " ");
  } catch {
    safeCurrency = "INR";
    return safeCurrency + " " + Number(value ?? 0).toFixed(2);
  }
}
function address(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(address).filter(Boolean).join(", ");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(address).filter(Boolean).join(", ");
  return "";
}
function filename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48) || "invoice";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return Response.json({ error: { message: access.message } }, { status: access.status });
  const permission = await requireWorkspacePermission(access, "invoices", "read");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: { message: "Invalid invoice identifier." } }, { status: 400 });
  }

  const [invoice, settings] = await Promise.all([
    db.invoice.findFirst({
      where: { id, tenantId: access.tenantId, status: { not: "CANCELLED" } },
      include: {
        customer: true,
        items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
        salesOrder: { select: { orderNumber: true } },
        payments: { select: { amount: true, status: true, paidAt: true, method: true } },
        receiptAllocations: { include: { receipt: { select: { amount: true, status: true, method: true, receivedAt: true, receiptNumber: true } } } },
      },
    }),
    db.businessSettings.findUnique({ where: { tenantId: access.tenantId } }),
  ]);
  if (!invoice) return Response.json({ error: { message: "Invoice not found in this workspace." } }, { status: 404 });

  const paid = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + Number(payment.amount), 0)
    + invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const balance = Math.max(0, Number(invoice.total) - paid);
  const currency = settings?.currency || "INR";
  const preferences = objectValue(settings?.preferences);
  const template = normalizeDocumentTemplates(preferences.documentTemplates).invoice;
  const document: DocumentPDFData = {
    kind: "invoice",
    number: invoice.invoiceNumber,
    status: balance <= 0.005 ? "PAID" : invoice.status,
    currency,
    business: {
      name: settings?.businessName || "Business",
      address: settings?.address,
      email: settings?.contactEmail,
      phone: settings?.contactPhone,
      logoUrl: settings?.logoUrl,
    },
    party: {
      label: "Bill to",
      name: invoice.customer.name,
      company: invoice.customer.company,
      email: invoice.customer.email,
      phone: invoice.customer.phone,
      address: address(invoice.customer.addresses),
    },
    metadata: [
      { label: "Issue date", value: dateLabel(invoice.issueDate) },
      { label: "Due date", value: dateLabel(invoice.dueDate) },
      ...(invoice.salesOrder ? [{ label: "Sales order", value: invoice.salesOrder.orderNumber }] : []),
      { label: "Currency", value: currency },
    ],
    items: invoice.items.map((item) => ({
      description: item.description || item.product?.name || "Item",
      detail: item.product?.sku ? "SKU " + item.product.sku : "",
      quantity: Number(item.quantity) + (item.product?.unit ? " " + item.product.unit : ""),
      unitPrice: money(item.unitPrice, currency),
      discount: money(item.discountAmount, currency),
      tax: money(item.taxAmount, currency),
      total: money(item.lineTotal, currency),
    })),
    totals: [
      { label: "Subtotal", value: money(invoice.subtotal, currency) },
      { label: "Discount", value: money(invoice.discountAmount, currency) },
      { label: "Tax", value: money(invoice.taxAmount, currency) },
      { label: "Invoice total", value: money(invoice.total, currency), strong: true },
      { label: "Payments received", value: money(paid, currency) },
      { label: "Balance due", value: money(balance, currency), strong: true },
    ],
    history: [
      ...invoice.payments.filter((payment) => payment.status === "POSTED").map((payment) => ({
        label: "Payment · " + dateLabel(payment.paidAt) + " · " + payment.method.replaceAll("_", " "),
        value: money(payment.amount, currency),
      })),
      ...invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").map((allocation) => ({
        label: allocation.receipt.receiptNumber + " · " + allocation.receipt.method.replaceAll("_", " ") + " · " + dateLabel(allocation.receipt.receivedAt),
        value: money(allocation.amount, currency),
      })),
    ],
    notes: invoice.notes,
  };
  try {
    const bytes = await renderDocumentPdf(document, template);
    const safeNumber = filename(invoice.invoiceNumber);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="invoice-' + safeNumber + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent("invoice-" + safeNumber + ".pdf"),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Invoice PDF rendering failed.", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: { message: "This invoice PDF could not be generated." } }, { status: 500 });
  }
}
