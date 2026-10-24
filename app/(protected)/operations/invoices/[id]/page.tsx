import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPlatformBranding } from "@/lib/branding/service";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { BrandLogo } from "@/components/brand-logo";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function amount(value: unknown, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}
function date(value: Date | string) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

export default async function InvoiceDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) redirect("/logintoprivatecrmbysyzent7456");
  const permission = await requireWorkspacePermission(access, "invoices", "read");
  if (!permission.ok) notFound();
  const { id } = await params;
  const [invoice, business, platform] = await Promise.all([
    db.invoice.findFirst({
      where: { id, tenantId: access.tenantId, status: { not: "CANCELLED" } },
      include: {
        customer: true,
        items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
        salesOrder: { select: { orderNumber: true } },
        payments: { select: { amount: true, status: true } },
        receiptAllocations: { include: { receipt: { select: { amount: true, status: true, method: true, receivedAt: true, receiptNumber: true } } } },
      },
    }),
    db.businessSettings.findUnique({ where: { tenantId: access.tenantId } }),
    getPlatformBranding(),
  ]);
  if (!invoice) notFound();
  const paid = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + Number(payment.amount), 0)
    + invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const balance = Math.max(0, Number(invoice.total) - paid);
  const currency = business?.currency || "INR";
  const companyName = business?.businessName || platform.productName;

  return (
    <div className="invoice-document-page">
      <div className="invoice-document-toolbar"><Link className="crm-secondary-button" href="/crm/invoices">Back to invoices</Link><PrintButton /></div>
      <article className="invoice-document">
        <header className="invoice-document-header">
          <div className="invoice-company">
            {business?.logoUrl ? <img src={business.logoUrl} alt="" /> : <BrandLogo branding={platform} />}
            <h1>{companyName}</h1>
            {business?.address && <p>{business.address}</p>}
            {business?.contactEmail && <p>{business.contactEmail}</p>}
            {business?.contactPhone && <p>{business.contactPhone}</p>}
          </div>
          <div className="invoice-meta">
            <p className="dashboard-eyebrow">INVOICE</p>
            <h2>{invoice.invoiceNumber}</h2>
            <span className={"crm-pill " + (balance <= 0.005 ? "crm-pill-paid" : invoice.status === "OVERDUE" ? "crm-pill-overdue" : "crm-pill-sent")}>{invoice.status.replaceAll("_", " ")}</span>
            <p><span>Issue date</span><strong>{date(invoice.issueDate)}</strong></p>
            <p><span>Due date</span><strong>{date(invoice.dueDate)}</strong></p>
            {invoice.salesOrder && <p><span>Sales order</span><strong>{invoice.salesOrder.orderNumber}</strong></p>}
          </div>
        </header>

        <section className="invoice-bill-to">
          <p className="dashboard-eyebrow">BILL TO</p>
          <h3>{invoice.customer.name}</h3>
          {invoice.customer.company && <p>{invoice.customer.company}</p>}
          {invoice.customer.email && <p>{invoice.customer.email}</p>}
          {invoice.customer.phone && <p>{invoice.customer.phone}</p>}
          {invoice.customer.address && <p>{invoice.customer.address}</p>}
        </section>

        <div className="invoice-lines-wrap"><table className="invoice-lines-table">
          <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Tax</th><th className="numeric">Line total</th></tr></thead>
          <tbody>
            {invoice.items.map((item) => <tr key={item.id}>
              <td><strong>{item.description}</strong></td>
              <td>{item.product?.sku || "—"}</td>
              <td>{Number(item.quantity)} {item.product?.unit || ""}</td>
              <td>{amount(item.unitPrice, currency)}</td>
              <td>{amount(item.discountAmount, currency)}</td>
              <td>{amount(item.taxAmount, currency)}</td>
              <td className="numeric">{amount(item.lineTotal, currency)}</td>
            </tr>)}
            {invoice.items.length === 0 && <tr><td colSpan={7}>No invoice line items were saved on this record.</td></tr>}
          </tbody>
        </table></div>

        <div className="invoice-total-area">
          <div className="invoice-notes"><p className="dashboard-eyebrow">NOTES</p><p>{invoice.notes || "Thank you for your business."}</p></div>
          <div className="invoice-total-card">
            <p><span>Subtotal</span><strong>{amount(invoice.subtotal, currency)}</strong></p>
            <p><span>Discount</span><strong>{amount(invoice.discountAmount, currency)}</strong></p>
            <p><span>Tax</span><strong>{amount(invoice.taxAmount, currency)}</strong></p>
            <p className="invoice-grand-total"><span>Invoice total</span><strong>{amount(invoice.total, currency)}</strong></p>
            <p><span>Payments received</span><strong>{amount(paid, currency)}</strong></p>
            <p className="invoice-balance"><span>Balance due</span><strong>{amount(balance, currency)}</strong></p>
          </div>
        </div>

        <section className="invoice-payment-history">
          <h3>Payment history</h3>
          {invoice.payments.filter((payment) => payment.status === "POSTED").length + invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").length === 0
            ? <p>No payments have been recorded against this invoice.</p>
            : <ul>
              {invoice.payments.filter((payment) => payment.status === "POSTED").map((payment, index) => <li key={"payment-" + index}><span>Payment received · {date(invoice.issueDate)}</span><strong>{amount(payment.amount, currency)}</strong></li>)}
              {invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").map((allocation) => <li key={allocation.id}><span>{allocation.receipt.receiptNumber} · {allocation.receipt.method} · {date(allocation.receipt.receivedAt)}</span><strong>{amount(allocation.amount, currency)}</strong></li>)}
            </ul>}
        </section>
        <footer className="invoice-document-footer">{platform.footerText.replaceAll("{product_name}", companyName).replaceAll("{year}", String(new Date().getFullYear()))}</footer>
      </article>
      <p className="invoice-print-hint">Use your browser's print dialog and select “Save as PDF” to export this invoice.</p>
    </div>
  );
}
