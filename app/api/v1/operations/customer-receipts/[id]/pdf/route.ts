import { requireWorkspaceAccess } from "@/lib/crm/access";
import { db } from "@/lib/db";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { normalizeDocumentTemplates } from "@/lib/documents/templates";
import { normalizeReceiptTemplate } from "@/lib/receipts/template";
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
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48) || "receipt";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return Response.json({ error: { message: access.message } }, { status: access.status });
  const permission = await requireWorkspacePermission(access, "customer-receipts", "read");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: { message: "Invalid receipt identifier." } }, { status: 400 });
  }
  const [receipt, settings] = await Promise.all([
    db.customerReceipt.findFirst({
      where: { id, tenantId: access.tenantId },
      include: {
        customer: { select: { name: true, company: true, email: true, phone: true, addresses: true } },
        allocations: { include: { invoice: { select: { invoiceNumber: true } } }, orderBy: { invoice: { invoiceNumber: "asc" } } },
      },
    }),
    db.businessSettings.findUnique({ where: { tenantId: access.tenantId } }),
  ]);
  if (!receipt) return Response.json({ error: { message: "Receipt not found in this workspace." } }, { status: 404 });

  const currency = settings?.currency || "INR";
  const preferences = objectValue(settings?.preferences);
  const rawTemplates = objectValue(preferences.documentTemplates);
  let template = normalizeDocumentTemplates(rawTemplates).customerReceipt;
  // Migrate the visual preferences of older receipt templates until the new studio is saved.
  if (!rawTemplates.customerReceipt && preferences.receiptTemplate) {
    const legacy = normalizeReceiptTemplate(preferences.receiptTemplate);
    template = { ...template, title: legacy.title, accentColor: legacy.accentColor, footerText: legacy.footerText, signatureLabel: legacy.signatureLabel };
  }
  const allocated = receipt.status === "POSTED" ? receipt.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0) : 0;
  const unallocated = receipt.status === "POSTED" ? Math.max(0, Number(receipt.amount) - allocated) : 0;
  const reversed = receipt.status === "REVERSED";
  const document: DocumentPDFData = {
    kind: "customerReceipt",
    number: receipt.receiptNumber,
    status: receipt.status === "REVERSED" ? "REVERSED - NOT VALID AS PAYMENT CONFIRMATION" : receipt.status,
    currency,
    business: {
      name: settings?.businessName || "Business",
      address: settings?.address,
      email: settings?.contactEmail,
      phone: settings?.contactPhone,
      logoUrl: settings?.logoUrl,
    },
    party: {
      label: "Received from",
      name: receipt.customer.name,
      company: receipt.customer.company,
      email: receipt.customer.email,
      phone: receipt.customer.phone,
      address: Array.isArray(receipt.customer.addresses)
        ? receipt.customer.addresses.map((part) => String(part)).join(", ")
        : receipt.customer.addresses && typeof receipt.customer.addresses === "object"
          ? Object.values(receipt.customer.addresses as Record<string, unknown>).map(String).join(", ")
          : typeof receipt.customer.addresses === "string" ? receipt.customer.addresses : "",
    },
    metadata: [
      { label: "Date received", value: dateLabel(receipt.receivedAt) },
      { label: "Payment method", value: receipt.method.replaceAll("_", " ") },
      { label: "Transaction reference", value: receipt.reference || "—" },
      { label: "Currency", value: currency },
    ],
    items: receipt.allocations.map((allocation) => ({
      description: allocation.invoice.invoiceNumber,
      detail: "Invoice allocation",
      total: money(allocation.amount, currency),
    })),
    totals: [
      { label: reversed ? "Reversed receipt amount" : "Amount received", value: money(receipt.amount, currency), strong: true },
      { label: "Amount allocated", value: money(allocated, currency) },
      ...(unallocated > 0.005 ? [{ label: "Unallocated amount", value: money(unallocated, currency) }] : []),
    ],
    notes: [reversed ? "This receipt has been reversed and is not valid as confirmation of payment." : null, receipt.notes].filter(Boolean).join("\n"),
  };
  try {
    const bytes = await renderDocumentPdf(document, template);
    const safeNumber = filename(receipt.receiptNumber);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="receipt-' + safeNumber + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent("receipt-" + safeNumber + ".pdf"),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Customer receipt PDF rendering failed.", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: { message: "This receipt PDF could not be generated." } }, { status: 500 });
  }
}
