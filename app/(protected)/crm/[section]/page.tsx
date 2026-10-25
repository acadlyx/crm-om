import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { db } from "@/lib/db";
import { CrmModule, type CrmColumn, type CrmField } from "@/components/crm-module";
import { Activity, ArrowRight, CircleDollarSign, FileWarning, HandCoins, TrendingUp, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown> & { id: string };

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}
function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(value);
}
function humanize(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function CrmSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const access = await requireWorkspaceAccess();
  if (!access.ok) redirect("/logintoprivatecrmbysyzent7456");
  const tenantId = access.tenantId;
  const permission = await requireWorkspacePermission(access, section, "read");
  if (!permission.ok) notFound();
  const updatePermission = await requireWorkspacePermission(access, section, "update");
  const deletePermission = await requireWorkspacePermission(access, section, "delete");

  if (section === "reports") {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [payments, expenses, invoices, pipeline, latestPayments, latestExpenses] = await Promise.all([
      db.payment.aggregate({ where: { tenantId, paidAt: { gte: monthStart } }, _sum: { amount: true } }),
      db.expense.aggregate({ where: { tenantId, status: "PAID", spentAt: { gte: monthStart } }, _sum: { amount: true } }),
      db.invoice.findMany({
        where: { tenantId, status: { not: "CANCELLED" } },
        select: { id: true, invoiceNumber: true, total: true, dueDate: true, status: true, customer: { select: { name: true } }, payments: { select: { amount: true, status: true } }, receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } } },
        orderBy: { dueDate: "asc" },
      }),
      db.deal.aggregate({ where: { tenantId, stage: { notIn: ["WON", "LOST"] } }, _sum: { value: true }, _count: { _all: true } }),
      db.payment.findMany({
        where: { tenantId }, orderBy: { paidAt: "desc" }, take: 5,
        select: { id: true, amount: true, paidAt: true, method: true, invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } } },
      }),
      db.expense.findMany({ where: { tenantId }, orderBy: { spentAt: "desc" }, take: 5, select: { id: true, title: true, amount: true, status: true, spentAt: true } }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const outstanding = invoices.map((invoice) => {
      const legacyPaid = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + Number(payment.amount), 0);
      const allocatedPaid = invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const paid = legacyPaid + allocatedPaid;
      return { ...invoice, paid, balance: Math.max(0, Number(invoice.total) - paid) };
    }).filter((invoice) => invoice.balance > 0);
    const overdue = outstanding.filter((invoice) => invoice.dueDate < today);
    const collected = Number(payments._sum.amount || 0);
    const spent = Number(expenses._sum.amount || 0);
    const openValue = Number(pipeline._sum.value || 0);
    const reportMetrics = [
      { label: "Payments received this month", value: currency(collected), note: "From recorded customer payments", icon: HandCoins, tone: "green" },
      { label: "Expenses this month", value: currency(spent), note: "Marked as paid", icon: Wallet, tone: "amber" },
      { label: "Open receivables", value: currency(outstanding.reduce((sum, item) => sum + item.balance, 0)), note: overdue.length + " overdue invoices", icon: FileWarning, tone: "violet" },
      { label: "Open sales pipeline", value: currency(openValue), note: pipeline._count._all + " active deals", icon: TrendingUp, tone: "blue" },
    ];

    return (
      <div className="crm-module-page">
        <header className="crm-module-heading">
          <div><p className="dashboard-eyebrow">BUSINESS INTELLIGENCE</p><h1>Business reports</h1><p className="dashboard-subtitle">Track cash coming in, cash going out and unpaid customer invoices. Figures use saved workspace records.</p></div>
          <Link className="brand-button crm-add-button" href="/crm/invoices"><FileWarning size={16} />Review invoices</Link>
        </header>
        <section className="dashboard-metrics crm-report-metrics" aria-label="Financial summary">
          {reportMetrics.map((metric) => {
            const Icon = metric.icon;
            return <article className="dashboard-metric" key={metric.label}>
              <div className={"dashboard-metric-icon tone-" + metric.tone}><Icon size={20} aria-hidden="true" /></div>
              <p className="dashboard-metric-label">{metric.label}</p>
              <p className="dashboard-metric-value crm-report-value">{metric.value}</p>
              <p className="dashboard-metric-note">{metric.note}</p>
            </article>;
          })}
        </section>
        <div className="dashboard-content-grid dashboard-lower-grid">
          <section className="card dashboard-panel">
            <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">FOLLOW-UP REQUIRED</p><h2>Overdue invoices</h2></div><span className="dashboard-panel-count">{overdue.length} overdue</span></div>
            {overdue.length ? <div className="dashboard-feed">{overdue.slice(0, 8).map((invoice) => <div className="dashboard-feed-item" key={invoice.id}>
              <span className="dashboard-feed-icon"><FileWarning size={16} /></span>
              <div className="dashboard-feed-copy"><strong>{invoice.invoiceNumber} · {invoice.customer.name}</strong><span>Due {dateLabel(invoice.dueDate)} · Balance {currency(invoice.balance)}</span></div>
              <Link className="dashboard-row-action" href="/crm/payments" aria-label={"Record payment for " + invoice.invoiceNumber}><ArrowRight size={16} /></Link>
            </div>)}</div> : <div className="dashboard-empty"><span className="dashboard-empty-icon"><CircleDollarSign size={20} /></span><strong>No overdue balances</strong><p>Invoices that pass their due date with money still outstanding appear here.</p></div>}
          </section>
          <section className="card dashboard-panel">
            <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">RECENT CASH FLOW</p><h2>Latest payments</h2></div><Link className="dashboard-panel-link" href="/crm/payments">All payments <ArrowRight size={14} /></Link></div>
            {latestPayments.length ? <div className="dashboard-feed">{latestPayments.map((payment) => <div className="dashboard-feed-item" key={payment.id}>
              <span className="dashboard-feed-icon"><HandCoins size={16} /></span>
              <div className="dashboard-feed-copy"><strong>{payment.invoice.customer.name}</strong><span>{payment.invoice.invoiceNumber} · {humanize(payment.method)} · {dateLabel(payment.paidAt)}</span></div>
              <strong className="crm-money-positive">{currency(Number(payment.amount))}</strong>
            </div>)}</div> : <div className="dashboard-empty"><span className="dashboard-empty-icon"><HandCoins size={20} /></span><strong>No payments recorded yet</strong><p>Once you record a customer payment against an invoice, it will appear here.</p><Link className="dashboard-text-link" href="/crm/payments">Record a payment <ArrowRight size={15} /></Link></div>}
          </section>
        </div>
        <section className="card dashboard-panel">
          <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">COST CONTROL</p><h2>Latest expenses</h2></div><Link className="dashboard-panel-link" href="/crm/expenses">Manage expenses <ArrowRight size={14} /></Link></div>
          {latestExpenses.length ? <div className="crm-expense-report-list">{latestExpenses.map((expense) => <div key={expense.id} className="crm-expense-report-row">
            <span className="dashboard-feed-icon"><Wallet size={16} /></span><div><strong>{expense.title}</strong><span>{dateLabel(expense.spentAt)} · {humanize(expense.status)}</span></div><strong>{currency(Number(expense.amount))}</strong>
          </div>)}</div> : <div className="dashboard-empty"><span className="dashboard-empty-icon"><Wallet size={20} /></span><strong>No expenses recorded yet</strong><p>Record rent, payroll, software, travel and other business costs to understand spend.</p><Link className="dashboard-text-link" href="/crm/expenses">Add your first expense <ArrowRight size={15} /></Link></div>}
          <p className="crm-report-disclaimer"><Activity size={14} /> These are management summaries, not tax, accounting or bank-reconciled statements.</p>
        </section>
      </div>
    );
  }

  const [customers, leads] = await Promise.all([
    db.customer.findMany({ where: { tenantId }, select: { id: true, name: true, company: true }, orderBy: { name: "asc" }, take: 300 }),
    db.lead.findMany({ where: { tenantId, status: { notIn: ["LOST", "CONVERTED"] } }, select: { id: true, fullName: true, company: true }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  const customerOptions = customers.map((customer) => ({ label: customer.name + (customer.company ? " · " + customer.company : ""), value: customer.id }));
  const leadOptions = leads.map((lead) => ({ label: lead.fullName + (lead.company ? " · " + lead.company : ""), value: lead.id }));

  let title = "";
  let description = "";
  let resource = "";
  let rows: Row[] = [];
  let fields: CrmField[] = [];
  let columns: CrmColumn[] = [];
  let workflow: { field: "status" | "stage"; label: string; options: { label: string; value: string }[] } | undefined;
  let recordLabel = "";

  switch (section) {
    case "customers": {
      title = "Customers"; resource = "customers"; recordLabel = "customer";
      description = "Keep every customer, company and contact detail in one workspace.";
      const records = await db.customer.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 300 });
      rows = records.map((item) => ({
        id: item.id, name: item.name, company: item.company, email: item.email, phone: item.phone,
        address: Array.isArray(item.addresses) ? item.addresses.map(String).join(", ") : "",
        creditLimit: Number(item.creditLimit), paymentTermsDays: item.paymentTermsDays, notes: item.notes,
        status: item.status, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
      }));
      fields = [
        { name: "name", label: "Contact / customer name", type: "text", required: true, placeholder: "Full name" },
        { name: "company", label: "Company", type: "text", placeholder: "Business name" },
        { name: "email", label: "Email", type: "email", placeholder: "name@company.com" },
        { name: "phone", label: "Phone", type: "tel", placeholder: "+91 ..." },
        { name: "address", label: "Business / billing address", type: "textarea", placeholder: "Street, city, state, postal code" },
        { name: "creditLimit", label: "Credit limit (₹; 0 = no limit)", type: "number", step: "0.01", placeholder: "0.00" },
        { name: "paymentTermsDays", label: "Payment terms (days)", type: "number", step: "1", placeholder: "0" },
        { name: "notes", label: "Notes", type: "textarea", placeholder: "Preferences, context or next steps" },
      ];
      columns = [
        { key: "name", label: "Customer" }, { key: "company", label: "Company" },
        { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
        { key: "address", label: "Address" }, { key: "creditLimit", label: "Credit limit" },
        { key: "paymentTermsDays", label: "Terms (days)" }, { key: "notes", label: "Notes" },
        { key: "status", label: "Status" }, { key: "createdAt", label: "Created" }, { key: "updatedAt", label: "Updated" },
      ];
      workflow = { field: "status", label: "Status", options: [{ label: "Active", value: "ACTIVE" }, { label: "Inactive", value: "INACTIVE" }] };
      break;
    }
    case "leads": {
      title = "Leads"; resource = "leads"; recordLabel = "lead";
      description = "Capture prospects, where they came from, potential value and next sales status.";
      const records = await db.lead.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 300 });
      rows = records.map((item) => ({ id: item.id, fullName: item.fullName, company: item.company, email: item.email, phone: item.phone, source: item.source, status: item.status, estimatedValue: Number(item.estimatedValue), notes: item.notes, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
      fields = [
        { name: "fullName", label: "Contact name", type: "text", required: true, placeholder: "Prospect name" },
        { name: "company", label: "Company", type: "text", placeholder: "Company / business" },
        { name: "email", label: "Email", type: "email", placeholder: "prospect@example.com" },
        { name: "phone", label: "Phone", type: "tel", placeholder: "+91 ..." },
        { name: "source", label: "Lead source", type: "text", placeholder: "Website, referral, event…" },
        { name: "estimatedValue", label: "Potential value (₹)", type: "number", step: "0.01", placeholder: "0.00" },
        { name: "status", label: "Initial status", type: "select", options: [{ label: "New", value: "NEW" }, { label: "Contacted", value: "CONTACTED" }, { label: "Qualified", value: "QUALIFIED" }] },
        { name: "notes", label: "Notes", type: "textarea", placeholder: "What they need and next follow-up" },
      ];
      columns = [
        { key: "fullName", label: "Lead" }, { key: "company", label: "Company" }, { key: "email", label: "Email" },
        { key: "phone", label: "Phone" }, { key: "source", label: "Source" }, { key: "estimatedValue", label: "Potential value" },
        { key: "notes", label: "Notes" }, { key: "status", label: "Status" }, { key: "createdAt", label: "Created" }, { key: "updatedAt", label: "Updated" },
      ];
      workflow = { field: "status", label: "Progress", options: [{ label: "New", value: "NEW" }, { label: "Contacted", value: "CONTACTED" }, { label: "Qualified", value: "QUALIFIED" }, { label: "Converted", value: "CONVERTED" }, { label: "Lost", value: "LOST" }] };
      break;
    }
    case "deals": {
      title = "Sales pipeline"; resource = "deals"; recordLabel = "deal";
      description = "Track the value and stage of sales opportunities from qualification to won or lost.";
      const records = await db.deal.findMany({ where: { tenantId }, include: { customer: { select: { name: true, company: true } }, lead: { select: { fullName: true, company: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
      rows = records.map((item) => ({
        id: item.id, title: item.title, contact: item.customer?.name || item.lead?.fullName || "Unlinked",
        company: item.customer?.company || item.lead?.company || null, customerName: item.customer?.name || null,
        leadName: item.lead?.fullName || null, value: Number(item.value), stage: item.stage,
        expectedCloseDate: item.expectedCloseDate?.toISOString() || null, closedAt: item.closedAt?.toISOString() || null,
        notes: item.notes, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
      }));
      fields = [
        { name: "title", label: "Opportunity / deal", type: "text", required: true, placeholder: "e.g. Annual service contract" },
        { name: "customerId", label: "Customer (optional)", type: "select", options: customerOptions },
        { name: "leadId", label: "Lead (optional)", type: "select", options: leadOptions },
        { name: "value", label: "Deal value (₹)", type: "number", step: "0.01", placeholder: "0.00" },
        { name: "stage", label: "Pipeline stage", type: "select", required: true, options: [{ label: "Qualification", value: "QUALIFICATION" }, { label: "Proposal", value: "PROPOSAL" }, { label: "Negotiation", value: "NEGOTIATION" }] },
        { name: "expectedCloseDate", label: "Expected close date", type: "date" },
        { name: "notes", label: "Notes", type: "textarea", placeholder: "Scope, blockers and next steps" },
      ];
      columns = [
        { key: "title", label: "Opportunity" }, { key: "contact", label: "Related contact" }, { key: "company", label: "Company" },
        { key: "value", label: "Value" }, { key: "expectedCloseDate", label: "Expected close" }, { key: "closedAt", label: "Closed at" },
        { key: "stage", label: "Stage" }, { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created" }, { key: "updatedAt", label: "Updated" },
      ];
      workflow = { field: "stage", label: "Move stage", options: [{ label: "Qualification", value: "QUALIFICATION" }, { label: "Proposal", value: "PROPOSAL" }, { label: "Negotiation", value: "NEGOTIATION" }, { label: "Won", value: "WON" }, { label: "Lost", value: "LOST" }] };
      break;
    }
    case "invoices": {
      title = "Invoices"; resource = "invoices"; recordLabel = "invoice";
      description = "Create customer invoices, set due dates and see exactly what is still owed.";
      const records = await db.invoice.findMany({ where: { tenantId }, include: { customer: { select: { name: true, company: true } }, payments: { select: { amount: true, status: true } }, receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } } }, orderBy: { createdAt: "desc" }, take: 300 });
      rows = records.map((item) => {
        const paidAmount = item.payments.filter((p) => p.status === "POSTED").reduce((sum, p) => sum + Number(p.amount), 0) + item.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
        const balance = Math.max(0, Number(item.total) - paidAmount);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const status = balance > 0 && item.dueDate < today && item.status !== "CANCELLED" ? "OVERDUE" : item.status;
        return {
          id: item.id, invoiceNumber: item.invoiceNumber, customerName: item.customer.name, customerCompany: item.customer.company,
          issueDate: item.issueDate.toISOString(), dueDate: item.dueDate.toISOString(), subtotal: Number(item.subtotal),
          discountAmount: Number(item.discountAmount), taxAmount: Number(item.taxAmount), total: Number(item.total),
          paidAmount, balance, status, notes: item.notes, salesOrderId: item.salesOrderId,
          createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
        };
      });
      fields = [
        { name: "customerId", label: "Bill to customer", type: "select", required: true, options: customerOptions },
        { name: "issueDate", label: "Issue date", type: "date" },
        { name: "dueDate", label: "Due date", type: "date" },
        { name: "subtotal", label: "Invoice amount before tax (₹)", type: "number", step: "0.01", required: true, placeholder: "0.00" },
        { name: "taxAmount", label: "Tax amount (₹)", type: "number", step: "0.01", placeholder: "0.00" },
        { name: "notes", label: "Notes / payment terms", type: "textarea", placeholder: "Payment terms or work description" },
      ];
      columns = [
        { key: "invoiceNumber", label: "Invoice" }, { key: "customerName", label: "Customer" }, { key: "customerCompany", label: "Company" },
        { key: "issueDate", label: "Issue date" }, { key: "dueDate", label: "Due date" }, { key: "subtotal", label: "Subtotal" },
        { key: "discountAmount", label: "Discount" }, { key: "taxAmount", label: "Tax" }, { key: "total", label: "Total" },
        { key: "paidAmount", label: "Paid" }, { key: "balance", label: "Remaining" }, { key: "status", label: "Status" },
        { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created" }, { key: "updatedAt", label: "Updated" },
      ];
      break;
    }
    case "payments": {
      title = "Payments received"; resource = "payments"; recordLabel = "payment";
      description = "Log cash, UPI, card, cheque or bank-transfer receipts against invoices. Balances and invoice status update automatically.";
      const [records, invoicesForPayment] = await Promise.all([
        db.payment.findMany({ where: { tenantId }, include: { invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } } }, orderBy: { paidAt: "desc" }, take: 300 }),
        db.invoice.findMany({ where: { tenantId, status: { not: "CANCELLED" } }, include: { customer: { select: { name: true } }, payments: { select: { amount: true, status: true } }, receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } } }, orderBy: { dueDate: "asc" }, take: 300 }),
      ]);
      rows = records.map((item) => ({
        id: item.id, invoiceNumber: item.invoice.invoiceNumber, customerName: item.invoice.customer.name,
        amount: Number(item.amount), method: item.method, reference: item.reference, paidAt: item.paidAt.toISOString(),
        notes: item.notes, status: item.status, createdAt: item.createdAt.toISOString(),
      }));
      const invoiceOptions = invoicesForPayment.map((item) => {
        const paid = item.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + Number(payment.amount), 0) + item.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
        return { item, balance: Math.max(0, Number(item.total) - paid) };
      }).filter(({ balance }) => balance > 0.005).map(({ item, balance }) => ({ label: item.invoiceNumber + " · " + item.customer.name + " · Due " + currency(balance), value: item.id }));
      fields = [
        { name: "invoiceId", label: "Invoice to pay", type: "select", required: true, options: invoiceOptions },
        { name: "amount", label: "Amount received (₹)", type: "number", step: "0.01", required: true, placeholder: "0.00" },
        { name: "method", label: "Payment method", type: "select", required: true, options: [{ label: "UPI", value: "UPI" }, { label: "Bank transfer", value: "BANK_TRANSFER" }, { label: "Cash", value: "CASH" }, { label: "Card", value: "CARD" }, { label: "Cheque", value: "CHEQUE" }, { label: "Other", value: "OTHER" }] },
        { name: "reference", label: "Transaction / receipt reference", type: "text", placeholder: "UTR, transaction ID or receipt no." },
        { name: "paidAt", label: "Payment date", type: "date" },
        { name: "notes", label: "Notes", type: "textarea", placeholder: "Optional receipt notes" },
      ];
      columns = [
        { key: "invoiceNumber", label: "Invoice" }, { key: "customerName", label: "Customer" }, { key: "amount", label: "Amount received" },
        { key: "method", label: "Method" }, { key: "reference", label: "UTR / reference" }, { key: "paidAt", label: "Received on" },
        { key: "notes", label: "Notes" }, { key: "status", label: "Status" }, { key: "createdAt", label: "Created" },
      ];
      if (!invoiceOptions.length) description = "No unpaid invoices right now. Create an invoice first; the system will prevent payments greater than the amount still owed.";
      break;
    }
    case "expenses": {
      title = "Expenses"; resource = "expenses"; recordLabel = "expense";
      description = "Record operating costs, vendors, payment method and whether an expense has been paid or is still planned.";
      const records = await db.expense.findMany({ where: { tenantId }, orderBy: { spentAt: "desc" }, take: 300 });
      rows = records.map((item) => ({ id: item.id, title: item.title, category: item.category, amount: Number(item.amount), vendor: item.vendor, method: item.method, status: item.status, spentAt: item.spentAt.toISOString(), notes: item.notes, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
      fields = [
        { name: "title", label: "Expense description", type: "text", required: true, placeholder: "Rent, software subscription, travel…" },
        { name: "category", label: "Category", type: "text", placeholder: "Rent, payroll, marketing, software…" },
        { name: "amount", label: "Amount (₹)", type: "number", step: "0.01", required: true, placeholder: "0.00" },
        { name: "spentAt", label: "Expense date", type: "date" },
        { name: "vendor", label: "Vendor / paid to", type: "text", placeholder: "Supplier or recipient" },
        { name: "method", label: "Payment method", type: "select", options: [{ label: "UPI", value: "UPI" }, { label: "Bank transfer", value: "BANK_TRANSFER" }, { label: "Cash", value: "CASH" }, { label: "Card", value: "CARD" }, { label: "Cheque", value: "CHEQUE" }, { label: "Other", value: "OTHER" }] },
        { name: "status", label: "Payment status", type: "select", options: [{ label: "Paid", value: "PAID" }, { label: "Planned / unpaid", value: "PLANNED" }] },
        { name: "notes", label: "Notes", type: "textarea", placeholder: "Receipt number, cost centre or notes" },
      ];
      columns = [
        { key: "title", label: "Expense" }, { key: "category", label: "Category" }, { key: "vendor", label: "Paid to" },
        { key: "amount", label: "Amount" }, { key: "method", label: "Method" }, { key: "spentAt", label: "Expense date" },
        { key: "status", label: "Status" }, { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created" }, { key: "updatedAt", label: "Updated" },
      ];
      workflow = { field: "status", label: "Payment status", options: [{ label: "Paid", value: "PAID" }, { label: "Planned / unpaid", value: "PLANNED" }] };
      break;
    }
    case "tasks": {
      title = "Tasks & follow-ups"; resource = "tasks"; recordLabel = "task";
      description = "Make sure calls, customer follow-ups, sales actions and deadlines do not slip through the cracks.";
      const records = await db.task.findMany({ where: { tenantId }, include: { customer: { select: { name: true } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }], take: 300 });
      rows = records.map((item) => ({ id: item.id, title: item.title, customerName: item.customer?.name || null, description: item.description, priority: item.priority, status: item.status, dueDate: item.dueDate?.toISOString() || null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
      fields = [
        { name: "title", label: "Task", type: "text", required: true, placeholder: "Call customer, send quotation…" },
        { name: "customerId", label: "Related customer (optional)", type: "select", options: customerOptions },
        { name: "dueDate", label: "Due date and time", type: "date" },
        { name: "priority", label: "Priority", type: "select", options: [{ label: "Low", value: "LOW" }, { label: "Medium", value: "MEDIUM" }, { label: "High", value: "HIGH" }, { label: "Urgent", value: "URGENT" }] },
        { name: "status", label: "Status", type: "select", options: [{ label: "To do", value: "TODO" }, { label: "In progress", value: "IN_PROGRESS" }, { label: "Done", value: "DONE" }] },
        { name: "description", label: "Description", type: "textarea", placeholder: "Details, owner and next action" },
      ];
      columns = [
        { key: "title", label: "Task" }, { key: "customerName", label: "Customer" }, { key: "description", label: "Description" },
        { key: "dueDate", label: "Due" }, { key: "priority", label: "Priority" }, { key: "status", label: "Status" },
        { key: "createdAt", label: "Created" }, { key: "updatedAt", label: "Updated" },
      ];
      workflow = { field: "status", label: "Update progress", options: [{ label: "To do", value: "TODO" }, { label: "In progress", value: "IN_PROGRESS" }, { label: "Done", value: "DONE" }] };
      break;
    }
    default:
      notFound();
  }

  return <CrmModule key={JSON.stringify(rows)} resource={resource} title={title} description={description} fields={fields} columns={columns} initialRows={rows} workflow={workflow} recordLabel={recordLabel} owner={access.user.role === "TENANT_ADMIN" || access.user.role === "PLATFORM_ADMIN"} canUpdate={updatePermission.ok} canDelete={deletePermission.ok} />;
}
