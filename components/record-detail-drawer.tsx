"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, CircleDot, Eye, LoaderCircle, X } from "lucide-react";
import "./record-detail-drawer.css";

type DetailSource = "crm" | "operations";
type DetailField = { key: string; label: string; format?: "money" | "date" | "datetime" | "status" | "number" | "boolean" };
type DetailCollection = { key: string; label: string; fields: DetailField[] };
type EntityDetailConfig = { title: string; fields: DetailField[]; collections?: DetailCollection[] };

const CRM_DETAILS: Record<string, EntityDetailConfig> = {
  customers: {
    title: "Customer profile",
    fields: [
      { key: "name", label: "Customer name" }, { key: "company", label: "Company" },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
      { key: "status", label: "Status", format: "status" }, { key: "addresses", label: "Address" },
      { key: "creditLimit", label: "Credit limit", format: "money" },
      { key: "paymentTermsDays", label: "Payment terms", format: "number" },
      { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created", format: "datetime" },
      { key: "updatedAt", label: "Last updated", format: "datetime" },
    ],
    collections: [
      { key: "invoices", label: "Recent invoices", fields: [
        { key: "invoiceNumber", label: "Invoice" }, { key: "issueDate", label: "Issued", format: "date" },
        { key: "dueDate", label: "Due date", format: "date" }, { key: "total", label: "Total", format: "money" },
        { key: "status", label: "Status", format: "status" },
      ] },
      { key: "deals", label: "Related deals", fields: [
        { key: "title", label: "Deal" }, { key: "value", label: "Value", format: "money" },
        { key: "stage", label: "Stage", format: "status" }, { key: "expectedCloseDate", label: "Expected close", format: "date" },
      ] },
      { key: "followUps", label: "Follow-ups", fields: [
        { key: "title", label: "Follow-up" }, { key: "dueAt", label: "Due", format: "datetime" },
        { key: "status", label: "Status", format: "status" }, { key: "channel", label: "Channel" },
      ] },
    ],
  },
  leads: {
    title: "Lead details",
    fields: [
      { key: "fullName", label: "Lead name" }, { key: "company", label: "Company" },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
      { key: "source", label: "Source" }, { key: "status", label: "Status", format: "status" },
      { key: "estimatedValue", label: "Estimated value", format: "money" }, { key: "notes", label: "Notes" },
      { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
    ],
    collections: [{ key: "deals", label: "Related deals", fields: [
      { key: "title", label: "Deal" }, { key: "value", label: "Value", format: "money" },
      { key: "stage", label: "Stage", format: "status" }, { key: "expectedCloseDate", label: "Expected close", format: "date" },
    ] }],
  },
  deals: {
    title: "Deal details",
    fields: [
      { key: "title", label: "Deal" }, { key: "stage", label: "Stage", format: "status" },
      { key: "value", label: "Value", format: "money" }, { key: "expectedCloseDate", label: "Expected close", format: "date" },
      { key: "closedAt", label: "Closed", format: "datetime" }, { key: "customer.name", label: "Customer" },
      { key: "customer.company", label: "Customer company" }, { key: "lead.fullName", label: "Related lead" },
      { key: "lead.company", label: "Lead company" }, { key: "notes", label: "Notes" },
      { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
    ],
  },
  invoices: {
    title: "Invoice details",
    fields: [
      { key: "invoiceNumber", label: "Invoice number" }, { key: "status", label: "Status", format: "status" },
      { key: "customer.name", label: "Customer" }, { key: "customer.company", label: "Company" },
      { key: "salesOrder.orderNumber", label: "Sales order" }, { key: "issueDate", label: "Issue date", format: "date" },
      { key: "dueDate", label: "Due date", format: "date" }, { key: "subtotal", label: "Subtotal", format: "money" },
      { key: "discountAmount", label: "Discount", format: "money" }, { key: "taxAmount", label: "Tax", format: "money" },
      { key: "total", label: "Invoice total", format: "money" }, { key: "notes", label: "Notes" },
      { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
    ],
    collections: [
      { key: "items", label: "Invoice items", fields: [
        { key: "description", label: "Description" }, { key: "quantity", label: "Quantity", format: "number" },
        { key: "unitPrice", label: "Unit price", format: "money" }, { key: "discountAmount", label: "Discount", format: "money" },
        { key: "taxAmount", label: "Tax", format: "money" }, { key: "lineTotal", label: "Line total", format: "money" },
      ] },
      { key: "payments", label: "Posted payments", fields: [
        { key: "amount", label: "Amount", format: "money" }, { key: "method", label: "Method" },
        { key: "reference", label: "Reference" }, { key: "paidAt", label: "Paid at", format: "datetime" },
        { key: "status", label: "Status", format: "status" },
      ] },
      { key: "receiptAllocations", label: "Receipt allocations", fields: [
        { key: "receipt.receiptNumber", label: "Receipt" }, { key: "amount", label: "Allocated", format: "money" },
        { key: "receipt.method", label: "Method" }, { key: "receipt.receivedAt", label: "Received", format: "datetime" },
        { key: "receipt.status", label: "Status", format: "status" },
      ] },
    ],
  },
  payments: {
    title: "Payment details",
    fields: [
      { key: "invoice.invoiceNumber", label: "Invoice" }, { key: "invoice.customer.name", label: "Customer" },
      { key: "invoice.total", label: "Invoice total", format: "money" }, { key: "amount", label: "Payment amount", format: "money" },
      { key: "method", label: "Method" }, { key: "reference", label: "Reference / UTR" },
      { key: "paidAt", label: "Payment date", format: "datetime" }, { key: "status", label: "Status", format: "status" },
      { key: "notes", label: "Notes" }, { key: "createdAt", label: "Recorded", format: "datetime" },
    ],
  },
  expenses: {
    title: "Expense details",
    fields: [
      { key: "title", label: "Expense" }, { key: "category", label: "Category" },
      { key: "amount", label: "Amount", format: "money" }, { key: "vendor", label: "Vendor" },
      { key: "spentAt", label: "Expense date", format: "date" }, { key: "method", label: "Payment method" },
      { key: "status", label: "Status", format: "status" }, { key: "notes", label: "Notes" },
      { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
    ],
  },
  tasks: {
    title: "Task details",
    fields: [
      { key: "title", label: "Task" }, { key: "status", label: "Status", format: "status" },
      { key: "priority", label: "Priority", format: "status" }, { key: "dueDate", label: "Due date", format: "datetime" },
      { key: "customer.name", label: "Related customer" }, { key: "description", label: "Description" },
      { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
    ],
  },
};

const OPERATIONS_DETAILS: Record<string, EntityDetailConfig> = {
  products: { title: "Product details", fields: [
    { key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "category", label: "Category" },
    { key: "unit", label: "Unit" }, { key: "description", label: "Description" },
    { key: "purchaseCost", label: "Purchase cost", format: "money" }, { key: "sellingPrice", label: "Selling price", format: "money" },
    { key: "stockOnHand", label: "Stock on hand", format: "number" }, { key: "reorderLevel", label: "Reorder level", format: "number" },
    { key: "status", label: "Status", format: "status" }, { key: "createdAt", label: "Created", format: "datetime" },
    { key: "updatedAt", label: "Last updated", format: "datetime" },
  ] },
  suppliers: { title: "Supplier details", fields: [
    { key: "name", label: "Supplier" }, { key: "company", label: "Company" }, { key: "email", label: "Email" },
    { key: "phone", label: "Phone" }, { key: "address", label: "Address" }, { key: "taxId", label: "Tax ID" },
    { key: "paymentTermsDays", label: "Payment terms (days)", format: "number" }, { key: "status", label: "Status", format: "status" },
    { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
  ], collections: [
    { key: "purchaseOrders", label: "Purchase orders", fields: [{ key: "orderNumber", label: "Order" }, { key: "orderDate", label: "Date", format: "date" }, { key: "total", label: "Total", format: "money" }, { key: "status", label: "Status", format: "status" }] },
    { key: "bills", label: "Supplier bills", fields: [{ key: "billNumber", label: "Bill" }, { key: "dueDate", label: "Due date", format: "date" }, { key: "total", label: "Total", format: "money" }, { key: "status", label: "Status", format: "status" }] },
  ] },
  "sales-orders": { title: "Sales order details", fields: [
    { key: "orderNumber", label: "Order number" }, { key: "status", label: "Status", format: "status" },
    { key: "customer.name", label: "Customer" }, { key: "customer.company", label: "Company" },
    { key: "orderDate", label: "Order date", format: "date" }, { key: "expectedDeliveryAt", label: "Expected delivery", format: "datetime" },
    { key: "subtotal", label: "Subtotal", format: "money" }, { key: "discountAmount", label: "Discount", format: "money" },
    { key: "taxAmount", label: "Tax", format: "money" }, { key: "total", label: "Total", format: "money" },
    { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
  ], collections: [
    { key: "items", label: "Ordered items", fields: [{ key: "product.name", label: "Product" }, { key: "product.sku", label: "SKU" }, { key: "description", label: "Description" }, { key: "quantity", label: "Ordered", format: "number" }, { key: "deliveredQuantity", label: "Delivered", format: "number" }, { key: "unitPrice", label: "Unit price", format: "money" }, { key: "lineTotal", label: "Line total", format: "money" }] },
    { key: "deliveries", label: "Deliveries", fields: [{ key: "deliveryNumber", label: "Delivery" }, { key: "status", label: "Status", format: "status" }, { key: "scheduledAt", label: "Scheduled", format: "datetime" }, { key: "completedAt", label: "Completed", format: "datetime" }] },
    { key: "invoices", label: "Invoices", fields: [{ key: "invoiceNumber", label: "Invoice" }, { key: "status", label: "Status", format: "status" }, { key: "total", label: "Total", format: "money" }, { key: "dueDate", label: "Due date", format: "date" }] },
  ] },
  "purchase-orders": { title: "Purchase order details", fields: [
    { key: "orderNumber", label: "Purchase order" }, { key: "status", label: "Status", format: "status" },
    { key: "supplier.name", label: "Supplier" }, { key: "supplier.company", label: "Company" },
    { key: "orderDate", label: "Order date", format: "date" }, { key: "expectedAt", label: "Expected date", format: "date" },
    { key: "subtotal", label: "Subtotal", format: "money" }, { key: "taxAmount", label: "Tax", format: "money" },
    { key: "total", label: "Total", format: "money" }, { key: "notes", label: "Notes" },
    { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
  ], collections: [
    { key: "items", label: "Ordered items", fields: [{ key: "product.name", label: "Product" }, { key: "product.sku", label: "SKU" }, { key: "quantity", label: "Quantity", format: "number" }, { key: "receivedQuantity", label: "Received", format: "number" }, { key: "unitCost", label: "Unit cost", format: "money" }, { key: "lineTotal", label: "Line total", format: "money" }] },
    { key: "receipts", label: "Goods receipts", fields: [{ key: "receiptNumber", label: "Receipt" }, { key: "status", label: "Status", format: "status" }, { key: "receivedAt", label: "Received", format: "datetime" }] },
    { key: "bills", label: "Supplier bills", fields: [{ key: "billNumber", label: "Bill" }, { key: "dueDate", label: "Due date", format: "date" }, { key: "total", label: "Total", format: "money" }, { key: "status", label: "Status", format: "status" }] },
  ] },
  "goods-receipts": { title: "Goods receipt details", fields: [
    { key: "receiptNumber", label: "Receipt" }, { key: "status", label: "Status", format: "status" },
    { key: "purchaseOrder.orderNumber", label: "Purchase order" }, { key: "purchaseOrder.supplier.name", label: "Supplier" },
    { key: "receivedAt", label: "Received at", format: "datetime" }, { key: "notes", label: "Notes" },
    { key: "createdAt", label: "Created", format: "datetime" },
  ], collections: [{ key: "items", label: "Received items", fields: [{ key: "product.name", label: "Product" }, { key: "product.sku", label: "SKU" }, { key: "quantity", label: "Received quantity", format: "number" }, { key: "unitCost", label: "Unit cost", format: "money" }] }] },
  deliveries: { title: "Delivery details", fields: [
    { key: "deliveryNumber", label: "Delivery" }, { key: "status", label: "Status", format: "status" },
    { key: "order.orderNumber", label: "Sales order" }, { key: "order.customer.name", label: "Customer" },
    { key: "scheduledAt", label: "Scheduled", format: "datetime" }, { key: "dispatchedAt", label: "Dispatched", format: "datetime" },
    { key: "completedAt", label: "Completed", format: "datetime" }, { key: "assignedUser.name", label: "Assigned to" },
    { key: "proofOfDelivery", label: "Proof of delivery" }, { key: "failureReason", label: "Failure reason" }, { key: "createdAt", label: "Created", format: "datetime" },
  ], collections: [{ key: "items", label: "Delivered items", fields: [{ key: "product.name", label: "Product" }, { key: "product.sku", label: "SKU" }, { key: "quantity", label: "Delivered quantity", format: "number" }, { key: "unitCost", label: "Unit cost", format: "money" }] }] },
  "customer-receipts": { title: "Customer receipt details", fields: [
    { key: "receiptNumber", label: "Receipt number" }, { key: "customer.name", label: "Customer" },
    { key: "customer.company", label: "Company" }, { key: "amount", label: "Amount received", format: "money" },
    { key: "method", label: "Payment method" }, { key: "reference", label: "Reference / UTR" },
    { key: "receivedAt", label: "Received at", format: "datetime" }, { key: "status", label: "Status", format: "status" },
    { key: "notes", label: "Notes" }, { key: "createdAt", label: "Recorded", format: "datetime" },
  ], collections: [{ key: "allocations", label: "Invoice allocations", fields: [{ key: "invoice.invoiceNumber", label: "Invoice" }, { key: "invoice.status", label: "Invoice status", format: "status" }, { key: "amount", label: "Allocated amount", format: "money" }] }] },
  "supplier-bills": { title: "Supplier bill details", fields: [
    { key: "billNumber", label: "Bill number" }, { key: "supplier.name", label: "Supplier" },
    { key: "supplier.company", label: "Company" }, { key: "purchaseOrder.orderNumber", label: "Purchase order" },
    { key: "issueDate", label: "Issue date", format: "date" }, { key: "dueDate", label: "Due date", format: "date" },
    { key: "total", label: "Bill total", format: "money" }, { key: "paid", label: "Payments allocated", format: "money" },
    { key: "balance", label: "Outstanding balance", format: "money" }, { key: "status", label: "Status", format: "status" },
    { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
  ], collections: [{ key: "allocations", label: "Payment allocations", fields: [{ key: "payment.paidAt", label: "Payment date", format: "datetime" }, { key: "payment.method", label: "Method" }, { key: "payment.reference", label: "Reference" }, { key: "amount", label: "Allocated", format: "money" }] }] },
  "supplier-payments": { title: "Supplier payment details", fields: [
    { key: "supplier.name", label: "Supplier" }, { key: "supplier.company", label: "Company" },
    { key: "amount", label: "Amount", format: "money" }, { key: "method", label: "Method" },
    { key: "reference", label: "Reference / UTR" }, { key: "paidAt", label: "Date paid", format: "datetime" },
    { key: "status", label: "Status", format: "status" }, { key: "notes", label: "Notes" },
    { key: "createdAt", label: "Recorded", format: "datetime" },
  ], collections: [{ key: "allocations", label: "Bill allocations", fields: [{ key: "bill.billNumber", label: "Supplier bill" }, { key: "bill.dueDate", label: "Due date", format: "date" }, { key: "bill.status", label: "Bill status", format: "status" }, { key: "amount", label: "Allocated amount", format: "money" }] }] },
  inventory: { title: "Inventory movement details", fields: [
    { key: "createdAt", label: "Movement date", format: "datetime" }, { key: "product.name", label: "Product" },
    { key: "product.sku", label: "SKU" }, { key: "movementType", label: "Movement type", format: "status" },
    { key: "quantity", label: "Quantity", format: "number" }, { key: "unitCost", label: "Unit cost", format: "money" },
    { key: "referenceType", label: "Source type" }, { key: "notes", label: "Notes" },
  ] },
  "customer-follow-ups": { title: "Customer follow-up details", fields: [
    { key: "title", label: "Follow-up" }, { key: "customer.name", label: "Customer" },
    { key: "assignedUser.name", label: "Assigned to" }, { key: "dueAt", label: "Due", format: "datetime" },
    { key: "channel", label: "Channel" }, { key: "status", label: "Status", format: "status" },
    { key: "notes", label: "Notes" }, { key: "createdAt", label: "Created", format: "datetime" }, { key: "updatedAt", label: "Last updated", format: "datetime" },
  ] },
  ledger: { title: "Ledger entry details", fields: [
    { key: "postedAt", label: "Posted at", format: "datetime" }, { key: "entryType", label: "Entry type", format: "status" },
    { key: "referenceType", label: "Source type" }, { key: "description", label: "Description" },
    { key: "customer.name", label: "Customer" }, { key: "supplier.name", label: "Supplier" },
    { key: "debit", label: "Debit", format: "money" }, { key: "credit", label: "Credit", format: "money" },
    { key: "createdAt", label: "Created", format: "datetime" },
  ] },
  permissions: { title: "Permission details", fields: [
    { key: "role", label: "Role", format: "status" }, { key: "moduleKey", label: "Module" },
    { key: "actionKey", label: "Action" }, { key: "granted", label: "Permission", format: "boolean" },
    { key: "updatedAt", label: "Last updated", format: "datetime" },
  ] },
};

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}
function readableLabel(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function printableText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(printableText).filter((item) => item !== "Not provided").join(", ") || "Not provided";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = ["label", "name", "company", "address", "city", "state", "postalCode", "country"];
    const parts = candidates.map((key) => obj[key]).filter((item) => typeof item === "string" && item.trim()) as string[];
    return parts.join(", ") || "Details available";
  }
  const text = String(value);
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)) return "Available in the audit record";
  return text;
}
function formatValue(value: unknown, field: DetailField): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (field.format === "boolean") return value ? "Granted" : "Denied";
  if (field.format === "status") return readableLabel(String(value));
  if (field.format === "date" || field.format === "datetime" || field.key.endsWith("At") || field.key.endsWith("Date")) {
    const parsed = new Date(String(value));
    if (Number.isFinite(parsed.getTime())) {
      const hasTime = field.format === "datetime" || field.key.endsWith("At");
      return new Intl.DateTimeFormat("en-IN", hasTime
        ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
    }
  }
  if (field.format === "money") {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(number) : "Not provided";
  }
  if (field.format === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(number) : "Not provided";
  }
  return printableText(value);
}

export function RecordDetailDrawer({ source, resource, id, onClose }: {
  source: DetailSource; resource: string; id: string; onClose: () => void;
}) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const config = useMemo(() => (source === "crm" ? CRM_DETAILS : OPERATIONS_DETAILS)[resource], [source, resource]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    setRecord(null);
    fetch("/api/v1/" + source + "/" + encodeURIComponent(resource) + "/" + encodeURIComponent(id), {
      cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "Record details could not be loaded.");
      if (!payload?.data || typeof payload.data !== "object") throw new Error("This record was not found.");
      if (active) setRecord(payload.data as Record<string, unknown>);
    }).catch((cause: unknown) => {
      if (active && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "Record details could not be loaded.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [source, resource, id]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  const titleValue = record && config ? readPath(record, config.fields[0].key) : null;
  return (
    <div className="record-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="record-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="record-detail-title">
        <header className="record-detail-header">
          <div className="record-detail-header-icon"><Eye size={20} /></div>
          <div className="record-detail-heading-copy">
            <p>RECORD DETAILS</p>
            <h2 id="record-detail-title">{loading ? "Loading details…" : config?.title || "Record details"}</h2>
            {record && <strong>{printableText(titleValue)}</strong>}
          </div>
          <button type="button" className="record-detail-close" aria-label="Close record details" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="record-detail-content">
          {loading && <div className="record-detail-state" role="status"><LoaderCircle className="workspace-spinner" size={22} /><span>Loading saved record details…</span></div>}
          {!loading && error && <div className="record-detail-state is-error" role="alert"><AlertCircle size={22} /><div><strong>Details unavailable</strong><p>{error}</p><button type="button" className="crm-secondary-button" onClick={() => window.location.reload()}>Refresh page</button></div></div>}
          {!loading && record && config && <>
            <section className="record-detail-section">
              <div className="record-detail-section-heading"><span><CircleDot size={15} /></span><h3>Overview</h3></div>
              <dl className="record-detail-field-grid">
                {config.fields.map((field) => {
                  const value = readPath(record, field.key);
                  if (value === undefined || value === null || value === "") return null;
                  return <div key={field.key} className={"record-detail-field" + (field.key === "notes" || field.key === "description" || field.key === "addresses" ? " is-wide" : "")}>
                    <dt>{field.label}</dt><dd>{formatValue(value, field)}</dd>
                  </div>;
                })}
              </dl>
            </section>
            {(config.collections || []).map((collection) => {
              const items = readPath(record, collection.key);
              if (!Array.isArray(items) || items.length === 0) return null;
              return <section className="record-detail-section" key={collection.key}>
                <div className="record-detail-section-heading"><span><CalendarClock size={15} /></span><h3>{collection.label}</h3><small>{items.length} shown</small></div>
                <div className="record-detail-related-list">
                  {items.map((item, index) => (
                    <article className="record-detail-related-item" key={String(readPath(item, collection.fields[0]?.key) ?? index) + "-" + index}>
                      {collection.fields.map((field) => {
                        const value = readPath(item, field.key);
                        if (value === undefined || value === null || value === "") return null;
                        return <div className="record-detail-related-field" key={field.key}><span>{field.label}</span><strong>{formatValue(value, field)}</strong></div>;
                      })}
                    </article>
                  ))}
                </div>
              </section>;
            })}
            <p className="record-detail-readonly-note"><CheckCircle2 size={15} />Read-only details from this workspace. Use the available record actions to make authorised changes.</p>
          </>}
        </div>
        <footer className="record-detail-footer"><button type="button" className="crm-secondary-button" onClick={onClose}>Close details</button></footer>
      </section>
    </div>
  );
}
