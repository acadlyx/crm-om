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
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "INR", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(Number(value ?? 0)).replace(/[\u00a0\u202f]/g, " ");
  } catch { return "INR " + Number(value ?? 0).toFixed(2); }
}
function filename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48) || "bill";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return Response.json({ error: { message: access.message } }, { status: access.status });
  const permission = await requireWorkspacePermission(access, "supplier-bills", "read");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: { message: "Invalid supplier bill identifier." } }, { status: 400 });
  }
  const [bill, settings] = await Promise.all([
    db.supplierBill.findFirst({
      where: { id, tenantId: access.tenantId },
      include: {
        supplier: true,
        purchaseOrder: {
          include: {
            items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
          },
        },
        allocations: { include: { payment: { select: { amount: true, status: true, method: true, reference: true, paidAt: true } } } },
      },
    }),
    db.businessSettings.findUnique({ where: { tenantId: access.tenantId } }),
  ]);
  if (!bill) return Response.json({ error: { message: "Supplier bill not found in this workspace." } }, { status: 404 });
  const paid = bill.allocations.filter((allocation) => allocation.payment.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const balance = Math.max(0, Number(bill.total) - paid);
  const currency = settings?.currency || "INR";
  const preferences = objectValue(settings?.preferences);
  const template = normalizeDocumentTemplates(preferences.documentTemplates).supplierBill;
  const document: DocumentPDFData = {
    kind: "supplierBill",
    number: bill.billNumber,
    status: balance <= 0.005 ? "PAID" : bill.status,
    currency,
    business: {
      name: settings?.businessName || "Business",
      address: settings?.address,
      email: settings?.contactEmail,
      phone: settings?.contactPhone,
      logoUrl: settings?.logoUrl,
    },
    party: {
      label: "Supplier",
      name: bill.supplier.name,
      company: bill.supplier.company,
      email: bill.supplier.email,
      phone: bill.supplier.phone,
      address: bill.supplier.address,
      taxId: bill.supplier.taxId,
    },
    metadata: [
      { label: "Issue date", value: dateLabel(bill.issueDate) },
      { label: "Due date", value: dateLabel(bill.dueDate) },
      ...(bill.purchaseOrder ? [{ label: "Purchase order", value: bill.purchaseOrder.orderNumber }] : []),
      { label: "Currency", value: currency },
    ],
    items: (bill.purchaseOrder?.items || []).map((item) => ({
      description: item.product.name,
      detail: item.product.sku ? "SKU " + item.product.sku : "",
      quantity: Number(item.quantity) + (item.product.unit ? " " + item.product.unit : ""),
      unitPrice: money(item.unitCost, currency),
      total: money(item.lineTotal, currency),
    })),
    totals: [
      { label: "Bill total", value: money(bill.total, currency), strong: true },
      { label: "Payments allocated", value: money(paid, currency) },
      { label: "Outstanding balance", value: money(balance, currency), strong: true },
    ],
    history: bill.allocations.filter((allocation) => allocation.payment.status === "POSTED").map((allocation) => ({
      label: "Payment · " + dateLabel(allocation.payment.paidAt) + " · " + allocation.payment.method.replaceAll("_", " ") + (allocation.payment.reference ? " · " + allocation.payment.reference : ""),
      value: money(allocation.amount, currency),
    })),
    notes: bill.notes,
  };
  try {
    const bytes = await renderDocumentPdf(document, template);
    const safeNumber = filename(bill.billNumber);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="supplier-bill-' + safeNumber + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent("supplier-bill-" + safeNumber + ".pdf"),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Supplier bill PDF rendering failed.", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: { message: "This supplier bill PDF could not be generated." } }, { status: 500 });
  }
}
