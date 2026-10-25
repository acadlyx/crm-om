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
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48) || "payment";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return Response.json({ error: { message: access.message } }, { status: access.status });
  const permission = await requireWorkspacePermission(access, "supplier-payments", "read");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: { message: "Invalid supplier payment identifier." } }, { status: 400 });
  }
  const [payment, settings] = await Promise.all([
    db.supplierPayment.findFirst({
      where: { id, tenantId: access.tenantId },
      include: {
        supplier: true,
        allocations: { include: { bill: { select: { billNumber: true, total: true, dueDate: true, status: true } } } },
      },
    }),
    db.businessSettings.findUnique({ where: { tenantId: access.tenantId } }),
  ]);
  if (!payment) return Response.json({ error: { message: "Supplier payment not found in this workspace." } }, { status: 404 });

  const allocated = payment.status === "POSTED" ? payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0) : 0;
  const unallocated = Math.max(0, Number(payment.amount) - allocated);
  const currency = settings?.currency || "INR";
  const preferences = objectValue(settings?.preferences);
  const template = normalizeDocumentTemplates(preferences.documentTemplates).supplierPayment;
  const document: DocumentPDFData = {
    kind: "supplierPayment",
    number: "PAY-" + payment.id.slice(0, 8).toUpperCase(),
    status: payment.status,
    currency,
    business: {
      name: settings?.businessName || "Business",
      address: settings?.address,
      email: settings?.contactEmail,
      phone: settings?.contactPhone,
      logoUrl: settings?.logoUrl,
    },
    party: {
      label: "Paid to supplier",
      name: payment.supplier.name,
      company: payment.supplier.company,
      email: payment.supplier.email,
      phone: payment.supplier.phone,
      address: payment.supplier.address,
      taxId: payment.supplier.taxId,
    },
    metadata: [
      { label: "Payment date", value: dateLabel(payment.paidAt) },
      { label: "Payment method", value: payment.method.replaceAll("_", " ") },
      { label: "Reference / UTR", value: payment.reference || "—" },
      { label: "Currency", value: currency },
    ],
    items: payment.allocations.map((allocation) => ({
      description: allocation.bill.billNumber,
      detail: "Supplier bill due " + dateLabel(allocation.bill.dueDate),
      total: money(allocation.amount, currency),
    })),
    totals: [
      { label: "Payment amount", value: money(payment.amount, currency), strong: true },
      { label: "Allocated to bills", value: money(allocated, currency) },
      ...(unallocated > 0.005 ? [{ label: "Unallocated", value: money(unallocated, currency) }] : []),
    ],
    history: payment.allocations.map((allocation) => ({
      label: allocation.bill.billNumber + " · " + allocation.bill.status.replaceAll("_", " "),
      value: money(allocation.amount, currency),
    })),
    notes: payment.notes,
  };
  try {
    const bytes = await renderDocumentPdf(document, template);
    const safeNumber = filename("PAY-" + payment.id.slice(0, 8));
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="supplier-payment-' + safeNumber + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent("supplier-payment-" + safeNumber + ".pdf"),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Supplier payment PDF rendering failed.", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: { message: "This supplier payment PDF could not be generated." } }, { status: 500 });
  }
}
