"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CheckCircle2, LoaderCircle,
  Plus, RefreshCw, Search, X,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- One API component renders several resource-specific Prisma payloads; every write is validated server-side.
type Row = Record<string, any> & { id: string };
type Catalogs = {
  customers: Row[]; invoices: Row[]; products: Row[]; suppliers: Row[];
  salesOrders: Row[]; purchaseOrders: Row[]; supplierBills: Row[]; team: Row[];
};
type Column = { key: string; label: string };

const defaultCatalogs: Catalogs = {
  customers: [], invoices: [], products: [], suppliers: [], salesOrders: [], purchaseOrders: [], supplierBills: [], team: [],
};

const moduleConfig: Record<string, { title: string; description: string; columns: Column[]; empty: string; writable: boolean }> = {
  products: { title: "Products & inventory", description: "Manage SKUs, costs, selling prices, opening stock and reorder thresholds. Every stock change is recorded in the movement ledger.", columns: [
    { key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "category", label: "Category" },
    { key: "stockOnHand", label: "On hand" }, { key: "reorderLevel", label: "Reorder at" },
    { key: "purchaseCost", label: "Purchase cost" }, { key: "sellingPrice", label: "Selling price" }, { key: "status", label: "Status" },
  ], empty: "No products yet. Add your first product to establish the catalogue.", writable: true },
  suppliers: { title: "Suppliers", description: "Maintain supplier contact details and payment terms for purchasing and payables.", columns: [
    { key: "name", label: "Supplier" }, { key: "company", label: "Company" }, { key: "email", label: "Email" },
    { key: "phone", label: "Phone" }, { key: "taxId", label: "Tax ID" }, { key: "paymentTermsDays", label: "Terms (days)" }, { key: "status", label: "Status" },
  ], empty: "No suppliers recorded yet.", writable: true },
  "sales-orders": { title: "Orders & sales", description: "Create orders using current catalog prices. Orders do not deduct stock; stock is issued only when a delivery is completed.", columns: [
    { key: "orderNumber", label: "Order" }, { key: "customer.name", label: "Customer" }, { key: "orderDate", label: "Date" },
    { key: "items.length", label: "Lines" }, { key: "total", label: "Total" }, { key: "status", label: "Status" },
  ], empty: "No sales orders in this workspace yet.", writable: true },
  "purchase-orders": { title: "Purchase orders", description: "Create supplier orders. Inventory increases only from a posted goods receipt—not when a purchase order is created.", columns: [
    { key: "orderNumber", label: "PO number" }, { key: "supplier.name", label: "Supplier" }, { key: "orderDate", label: "Date" },
    { key: "expectedAt", label: "Expected" }, { key: "total", label: "Total" }, { key: "status", label: "Status" },
  ], empty: "No purchase orders yet.", writable: true },
  "goods-receipts": { title: "Goods receipts", description: "Post actual quantities received against purchase-order lines. Receipt posting and stock increases are atomic and idempotent.", columns: [
    { key: "receiptNumber", label: "Receipt" }, { key: "purchaseOrder.orderNumber", label: "Purchase order" },
    { key: "purchaseOrder.supplier.name", label: "Supplier" }, { key: "receivedAt", label: "Received" }, { key: "items.length", label: "Lines" }, { key: "status", label: "Status" },
  ], empty: "No goods receipts have been posted.", writable: true },
  deliveries: { title: "Deliveries", description: "Create deliveries from confirmed orders, dispatch them, and post delivered quantities. Stock is deducted exactly once when delivery is completed.", columns: [
    { key: "deliveryNumber", label: "Delivery" }, { key: "order.orderNumber", label: "Order" },
    { key: "order.customer.name", label: "Customer" }, { key: "scheduledAt", label: "Scheduled" },
    { key: "assignedUser.name", label: "Assigned to" }, { key: "status", label: "Status" },
  ], empty: "No deliveries yet.", writable: true },
  "customer-receipts": { title: "Customer receipts & allocations", description: "Record an actual customer receipt and allocate portions across invoices. The receipt is counted once while each allocation reduces one invoice balance.", columns: [
    { key: "receiptNumber", label: "Receipt" }, { key: "customer.name", label: "Customer" },
    { key: "amount", label: "Received" }, { key: "method", label: "Method" },
    { key: "receivedAt", label: "Date" }, { key: "allocations.length", label: "Allocations" }, { key: "status", label: "Status" },
  ], empty: "No customer receipts have been recorded.", writable: true },
  "supplier-bills": { title: "Supplier bills & payables", description: "Record supplier invoices separately from purchase orders, track due dates and monitor balances after allocated supplier payments.", columns: [
    { key: "billNumber", label: "Bill number" }, { key: "supplier.name", label: "Supplier" },
    { key: "dueDate", label: "Due date" }, { key: "total", label: "Total" }, { key: "paid", label: "Paid" }, { key: "balance", label: "Outstanding" }, { key: "status", label: "Status" },
  ], empty: "No supplier bills recorded.", writable: true },
  "supplier-payments": { title: "Supplier payments", description: "Record supplier payments and allocate amounts against supplier bills. Reversals are audited and do not delete history.", columns: [
    { key: "supplier.name", label: "Supplier" }, { key: "amount", label: "Amount" }, { key: "method", label: "Method" },
    { key: "paidAt", label: "Date" }, { key: "allocations.length", label: "Bill allocations" }, { key: "status", label: "Status" },
  ], empty: "No supplier payments recorded.", writable: true },
  inventory: { title: "Stock movement ledger", description: "Append-only inventory activity. Manual adjustments and stock issues are transaction-safe and cannot drive stock below zero.", columns: [
    { key: "createdAt", label: "Date" }, { key: "product.name", label: "Product" }, { key: "product.sku", label: "SKU" },
    { key: "movementType", label: "Movement" }, { key: "quantity", label: "Quantity" }, { key: "unitCost", label: "Unit cost" }, { key: "referenceType", label: "Reference" }, { key: "notes", label: "Notes" },
  ], empty: "No inventory movements recorded yet.", writable: true },
  "customer-follow-ups": { title: "Customer follow-ups", description: "Schedule collection reminders and other customer follow-ups. Mark each follow-up complete when action is taken.", columns: [
    { key: "title", label: "Follow-up" }, { key: "customer.name", label: "Customer" }, { key: "dueAt", label: "Due" },
    { key: "channel", label: "Channel" }, { key: "status", label: "Status" },
  ], empty: "No customer follow-ups yet.", writable: true },
  ledger: { title: "Ledgers & accounts", description: "Review append-only customer/supplier ledger entries and their source transaction references.", columns: [
    { key: "postedAt", label: "Posted" }, { key: "entryType", label: "Type" }, { key: "description", label: "Description" },
    { key: "customer.name", label: "Customer" }, { key: "supplier.name", label: "Supplier" }, { key: "debit", label: "Debit" }, { key: "credit", label: "Credit" },
  ], empty: "No ledger entries have been posted.", writable: false },
  permissions: { title: "Team & permissions", description: "Configure tenant-scoped module/action permissions for staff roles. Owners retain full access; staff cannot grant themselves permissions.", columns: [
    { key: "role", label: "Role" }, { key: "moduleKey", label: "Module" }, { key: "actionKey", label: "Action" }, { key: "granted", label: "Granted" },
  ], empty: "No permission overrides set. Role defaults remain in effect until an explicit override is saved.", writable: true },
};

function readKey(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (part === "length" && Array.isArray(value)) return value.length;
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, row as unknown);
}
function showValue(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (["total", "paid", "balance", "amount", "unitCost", "purchaseCost", "sellingPrice", "debit", "credit"].includes(key)) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
  }
  if (/Date|At$|^date$|^dueDate$|^expectedAt$/.test(key) && !Number.isNaN(new Date(String(value)).valueOf())) {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(String(value)));
  }
  if (key === "granted") return value ? "Granted" : "Denied";
  return String(value).replaceAll("_", " ");
}
function titleCase(value: string) {
  return value.replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function idempotencyKey() { return crypto.randomUUID(); }

export function OperationsModule({ resource, owner, canUpdate = false }: { resource: string; owner: boolean; canUpdate?: boolean }) {
  const config = moduleConfig[resource];
  const [rows, setRows] = useState<Row[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs>(defaultCatalogs);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [visibleCount, setVisibleCount] = useState(3);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Row | null>(null);
  const [editingMaster, setEditingMaster] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [orderLines, setOrderLines] = useState<SalesLine[]>([{ productId: "", quantity: "1", discountPercent: "0", taxPercent: "0" }]);
  const [purchaseLines, setPurchaseLines] = useState([{ productId: "", quantity: "1" }]);
  const [receiptLines, setReceiptLines] = useState([{ purchaseOrderItemId: "", quantity: "1" }]);
  const [deliveryLines, setDeliveryLines] = useState([{ orderItemId: "", quantity: "1" }]);
  const [allocations, setAllocations] = useState<Allocation[]>([{ invoiceId: "", amount: "" }]);
  const [supplierAllocations, setSupplierAllocations] = useState<Allocation[]>([{ billId: "", amount: "" }]);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  const loadRows = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/operations/" + resource, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not load business records.");
      const normalised = (result.data || []).map((row: Row) => {
        if (resource === "supplier-bills") {
          const paid = (row.allocations || []).filter((entry: Row) => entry.payment?.status === "POSTED").reduce((sum: number, entry: Row) => sum + Number(entry.amount || 0), 0);
          return { ...row, paid, balance: Math.max(0, Number(row.total || 0) - paid) };
        }
        return row;
      });
      setRows(normalised);
      setVisibleCount(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load business records.");
    } finally {
      setLoading(false);
    }
  }, [resource]);

  const loadCatalogs = useCallback(async () => {
    const requests: Array<[keyof Catalogs, string]> = [];
    if (["sales-orders", "deliveries"].includes(resource)) {
      if (resource === "sales-orders") requests.push(["customers", "/api/v1/crm/customers"]);
      if (resource === "deliveries") {
        requests.push(["salesOrders", "/api/v1/operations/sales-orders"]);
        requests.push(["team", "/api/v1/operations/team"]);
      }
      if (resource === "sales-orders" || resource === "deliveries") requests.push(["products", "/api/v1/operations/products"]);
    }
    if (["purchase-orders", "goods-receipts"].includes(resource)) {
      requests.push(["purchaseOrders", "/api/v1/operations/purchase-orders"]);
      if (resource === "purchase-orders") {
        requests.push(["suppliers", "/api/v1/operations/suppliers"]);
        requests.push(["products", "/api/v1/operations/products"]);
      }
    }
    if (resource === "goods-receipts") requests.push(["suppliers", "/api/v1/operations/suppliers"]);
    if (resource === "customer-receipts") {
      requests.push(["customers", "/api/v1/crm/customers"]);
      requests.push(["invoices", "/api/v1/crm/invoices"]);
    }
    if (resource === "supplier-bills") {
      requests.push(["suppliers", "/api/v1/operations/suppliers"]);
      requests.push(["purchaseOrders", "/api/v1/operations/purchase-orders"]);
    }
    if (resource === "supplier-payments") {
      requests.push(["suppliers", "/api/v1/operations/suppliers"]);
      requests.push(["supplierBills", "/api/v1/operations/supplier-bills"]);
    }
    if (resource === "inventory") requests.push(["products", "/api/v1/operations/products"]);
    if (resource === "customer-follow-ups") {
      requests.push(["customers", "/api/v1/crm/customers"]);
      requests.push(["team", "/api/v1/operations/team"]);
    }
    if (!requests.length) return;
    const loaded = await Promise.all(requests.map(async ([key, url]) => {
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not load options for this form.");
      return [key, result.data || []] as const;
    }));
    setCatalogs((current) => ({ ...current, ...Object.fromEntries(loaded) }));
  }, [resource]);

  // The loaders perform asynchronous fetches; state changes only after network responses. The hook
  // lint rule sees the call graph and flags the call site despite the async boundary.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadRows();
    void loadCatalogs().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load form options."));
  }, [loadRows, loadCatalogs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const searchable = config.columns.map((column) => String(readKey(row, column.key) ?? "")).join(" ").toLowerCase();
      const matchesSearch = !needle || searchable.includes(needle);
      const status = String(row.status ?? row.movementType ?? "");
      const matchesStatus = statusFilter === "ALL" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter, config.columns]);
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => String(row.status ?? row.movementType ?? "")).filter(Boolean))].sort(), [rows]);

  const customerOptions = catalogs.customers.map((item) => ({ value: item.id, label: item.name + (item.company ? " · " + item.company : "") }));
  const productOptions = catalogs.products.filter((item) => item.status !== "INACTIVE").map((item) => ({ value: item.id, label: item.sku + " · " + item.name + " (on hand " + item.stockOnHand + ")" }));
  const supplierOptions = catalogs.suppliers.filter((item) => item.status !== "INACTIVE").map((item) => ({ value: item.id, label: item.name + (item.company ? " · " + item.company : "") }));
  const teamOptions = catalogs.team.filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.name + " · " + item.role.replaceAll("_", " ") }));
  const invoiceOptions = catalogs.invoices.filter((item) => {
    if (item.status === "CANCELLED") return false;
    const paid = (item.payments || []).filter((p: Row) => p.status === "POSTED").reduce((sum: number, p: Row) => sum + Number(p.amount || 0), 0)
      + (item.receiptAllocations || []).filter((a: Row) => a.receipt?.status === "POSTED").reduce((sum: number, a: Row) => sum + Number(a.amount || 0), 0);
    return Number(item.total || 0) - paid > 0.005;
  }).map((item) => ({ value: item.id, label: (item.invoiceNumber || "Invoice") + " · " + (item.customer?.name || item.customerName || "") + " · due " + new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Math.max(0, Number(item.total || 0) - (item.payments || []).filter((p: Row) => p.status === "POSTED").reduce((sum: number, p: Row) => sum + Number(p.amount || 0), 0) - (item.receiptAllocations || []).filter((a: Row) => a.receipt?.status === "POSTED").reduce((sum: number, a: Row) => sum + Number(a.amount || 0), 0))) }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    let payload: Record<string, unknown> = { ...raw };
    if (resource === "products") {
      payload = { ...raw, purchaseCost: Number(raw.purchaseCost || 0), sellingPrice: Number(raw.sellingPrice || 0), initialStock: Number(raw.initialStock || 0), reorderLevel: Number(raw.reorderLevel || 0) };
    } else if (resource === "suppliers") {
      payload = { ...raw, paymentTermsDays: Number(raw.paymentTermsDays || 0) };
    } else if (resource === "sales-orders") {
      payload = { ...raw, items: orderLines.filter((line) => line.productId).map((line) => ({ productId: line.productId, quantity: Number(line.quantity), discountPercent: Number(line.discountPercent || 0), taxPercent: Number(line.taxPercent || 0) })), idempotencyKey: idempotencyKey() };
    } else if (resource === "purchase-orders") {
      payload = { ...raw, items: purchaseLines.filter((line) => line.productId).map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })), idempotencyKey: idempotencyKey() };
    } else if (resource === "goods-receipts") {
      payload = { ...raw, purchaseOrderId: selectedOrderId, items: receiptLines.filter((line) => line.purchaseOrderItemId).map((line) => ({ purchaseOrderItemId: line.purchaseOrderItemId, quantity: Number(line.quantity) })), idempotencyKey: idempotencyKey() };
    } else if (resource === "deliveries") {
      payload = { ...raw, orderId: selectedOrderId, items: deliveryLines.filter((line) => line.orderItemId).map((line) => ({ orderItemId: line.orderItemId, quantity: Number(line.quantity) })), idempotencyKey: idempotencyKey() };
    } else if (resource === "customer-receipts") {
      payload = { ...raw, amount: Number(raw.amount), allocations: allocations.filter((line) => line.invoiceId && line.amount).map((line) => ({ invoiceId: line.invoiceId, amount: Number(line.amount) })), idempotencyKey: idempotencyKey() };
    } else if (resource === "supplier-bills") {
      payload = { ...raw, total: Number(raw.total) };
    } else if (resource === "supplier-payments") {
      payload = { ...raw, amount: Number(raw.amount), allocations: supplierAllocations.filter((line) => line.billId && line.amount).map((line) => ({ billId: line.billId, amount: Number(line.amount) })), idempotencyKey: idempotencyKey() };
    } else if (resource === "inventory") {
      payload = { ...raw, quantity: Number(raw.quantity), idempotencyKey: idempotencyKey() };
    } else if (resource === "customer-follow-ups") {
      payload = { ...raw, dueAt: raw.dueAt ? new Date(String(raw.dueAt)).toISOString() : undefined, idempotencyKey: idempotencyKey() };
    } else if (resource === "permissions") {
      payload = { ...raw, granted: raw.granted === "true" };
    }

    const editingMasterRecord = !!editingMaster && (resource === "products" || resource === "suppliers");
    const editingDraftOrder = resource === "sales-orders" && editingOrder !== null;
    let requestPayload: Record<string, unknown> = editingDraftOrder ? {
      action: "EDIT_DRAFT",
      customerId: payload.customerId,
      orderDate: payload.orderDate || undefined,
      expectedDeliveryAt: payload.expectedDeliveryAt || undefined,
      notes: payload.notes || null,
      items: payload.items,
    } : payload;
    if (editingMasterRecord) {
      requestPayload = resource === "products" ? {
        name: raw.name,
        category: raw.category || null,
        description: raw.description || null,
        sellingPrice: Number(raw.sellingPrice || 0),
        reorderLevel: Number(raw.reorderLevel || 0),
        ...(Object.prototype.hasOwnProperty.call(raw, "purchaseCost") ? { purchaseCost: Number(raw.purchaseCost || 0) } : {}),
      } : {
        name: raw.name,
        company: raw.company || null,
        email: raw.email || null,
        phone: raw.phone || null,
        address: raw.address || null,
        taxId: raw.taxId || null,
        paymentTermsDays: Number(raw.paymentTermsDays || 0),
        status: raw.status || editingMaster.status,
      };
    }

    try {
      if ((resource === "sales-orders" && !(payload.items as unknown[]).length)
        || (resource === "purchase-orders" && !(payload.items as unknown[]).length)
        || (resource === "goods-receipts" && !(payload.items as unknown[]).length)
        || (resource === "deliveries" && !(payload.items as unknown[]).length)) {
        throw new Error("Add at least one valid line item.");
      }
      if (resource === "goods-receipts" && !selectedOrderId) throw new Error("Choose a purchase order first.");
      if (resource === "deliveries" && !selectedOrderId) throw new Error("Choose a sales order first.");
      const endpoint = editingMasterRecord
        ? "/api/v1/operations/" + resource + "/" + encodeURIComponent(editingMaster!.id)
        : editingDraftOrder
          ? "/api/v1/operations/sales-orders/" + encodeURIComponent(editingOrder!.id)
          : "/api/v1/operations/" + resource;
      const response = await fetch(endpoint, {
        method: editingMasterRecord || editingDraftOrder ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not save this record.");
      setNotice(editingMasterRecord
        ? "Record updated. Existing stock quantities and transaction history were preserved."
        : editingDraftOrder ? "Draft order updated and totals recalculated."
          : result.idempotentReplay ? "This request was already processed; no duplicate transaction was created." : "Saved successfully.");
      form.reset();
      if (editingDraftOrder) { setEditingOrder(null); setFormOpen(false); }
      if (editingMasterRecord) { setEditingMaster(null); setFormOpen(false); }
      setOrderLines([{ productId: "", quantity: "1", discountPercent: "0", taxPercent: "0" }]);
      setPurchaseLines([{ productId: "", quantity: "1" }]);
      setReceiptLines([{ purchaseOrderItemId: "", quantity: "1" }]);
      setDeliveryLines([{ orderItemId: "", quantity: "1" }]);
      setAllocations([{ invoiceId: "", amount: "" }]);
      setSupplierAllocations([{ billId: "", amount: "" }]);
      setSelectedOrderId("");
      await loadRows();
      await loadCatalogs();
      if (resource === "products" && !editingMasterRecord) setNotice((result.idempotentReplay ? "" : "Product saved. ") + "Opening stock, if supplied, was added to the stock ledger.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(row: Row, body: Record<string, unknown>, confirmation?: string) {
    setNotice("");
    setError("");
    if (confirmation && !window.confirm(confirmation)) return;
    try {
      const response = await fetch("/api/v1/operations/" + resource + "/" + encodeURIComponent(row.id), {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not update this record.");
      setNotice("Update saved. The underlying transaction history has been retained.");
      await loadRows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this record.");
    }
  }

  function startEditOrder(row: Row) {
    setError("");
    setNotice("");
    setEditingOrder(row);
    const nextLines = (row.items || []).map((item: Row) => {
      const gross = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const discountPercent = gross > 0 ? Number(item.discountAmount || 0) / gross * 100 : 0;
      const taxable = gross - Number(item.discountAmount || 0);
      const taxPercent = taxable > 0 ? Number(item.taxAmount || 0) / taxable * 100 : 0;
      return {
        productId: item.productId,
        quantity: String(item.quantity),
        discountPercent: discountPercent.toFixed(2),
        taxPercent: taxPercent.toFixed(2),
      };
    });
    setOrderLines(nextLines.length ? nextLines : [{ productId: "", quantity: "1", discountPercent: "0", taxPercent: "0" }]);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditMaster(row: Row) {
    setError("");
    setNotice("");
    setEditingOrder(null);
    setEditingMaster(row);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditRow(row: Row) {
    if (resource === "sales-orders") startEditOrder(row);
    else if (resource === "products" || resource === "suppliers") startEditMaster(row);
  }

  async function issueInvoice(row: Row) {
    if (!window.confirm("Issue a customer invoice from order " + row.orderNumber + "? This will create a financial record and prevent the order from being cancelled.")) return;
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/v1/operations/sales-orders/" + encodeURIComponent(row.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ISSUE_INVOICE" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Could not issue invoice.");
      setNotice(result.idempotentReplay
        ? "This order already has invoice " + result.data.invoiceNumber + "; no duplicate invoice was created."
        : "Invoice " + result.data.invoiceNumber + " issued successfully.");
      await loadRows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue invoice.");
    }
  }

  async function changeStatus(row: Row, status: string) {
    let body: Record<string, unknown> = { status };
    if (status === "REVERSED") {
      const reason = window.prompt("Enter the reason for this reversal (required):");
      if (!reason || reason.trim().length < 3) { setError("A reversal reason of at least 3 characters is required."); return; }
      body = { status, reason: reason.trim() };
    }
    if (resource === "deliveries" && status === "FAILED") {
      const failureReason = window.prompt("Why did this delivery fail?");
      if (!failureReason || failureReason.trim().length < 3) { setError("Please enter the delivery failure reason."); return; }
      body = { status, failureReason: failureReason.trim() };
    }
    if (resource === "deliveries" && status === "DELIVERED") {
      body.proofOfDelivery = window.prompt("Proof of delivery reference (optional):") || "";
    }
    const label = status.replaceAll("_", " ").toLowerCase();
    const confirmation = ["CANCELLED", "REVERSED", "DELIVERED", "PARTIALLY_DELIVERED"].includes(status)
      ? "Confirm " + label + "? This may post inventory or financial changes and will be audited."
      : undefined;
    await updateRow(row, body, confirmation);
  }

  function exportCSV() {
    const values = [
      config.columns.map((column) => column.label),
      ...filtered.map((row) => config.columns.map((column) => String(readKey(row, column.key) ?? ""))),
    ];
    const csv = values.map((line) => line.map((value) => '"' + value.replaceAll('"', '""') + '"').join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = resource + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!config) return <div className="card">This operations module is not available.</div>;

  return (
    <div className="workspace-admin-page">
      <header className="crm-module-heading">
        <div><p className="dashboard-eyebrow">BUSINESS OPERATIONS</p><h1>{config.title}</h1><p className="dashboard-subtitle">{config.description}</p></div>
        <div className="operations-heading-actions">
          <button type="button" className="crm-secondary-button" onClick={() => { setLoading(true); setError(""); void loadRows(); void loadCatalogs(); }} disabled={loading}><RefreshCw size={15} />Refresh</button>
          {config.writable && <button type="button" className="brand-button crm-add-button" onClick={() => { setFormOpen((value) => !value); setError(""); setNotice(""); }}><Plus size={16} />{formOpen ? "Close form" : "Add new"}</button>}
        </div>
      </header>

      {notice && <p className="crm-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
      {error && <p className="workspace-form-message is-error" role="alert"><AlertCircle size={16} />{error}</p>}

      {formOpen && config.writable && <section className="card operations-form-card">
        <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">{editingMaster || editingOrder ? "EDIT RECORD" : "NEW RECORD"}</p><h2>{editingMaster ? "Edit " + (resource === "products" ? "product" : "supplier") : editingOrder ? "Edit draft " + editingOrder.orderNumber : resource === "goods-receipts" ? "Post goods received" : resource === "deliveries" ? "Create delivery" : resource === "customer-receipts" ? "Record customer receipt" : "Add " + config.title.toLowerCase()}</h2></div><button className="crm-secondary-button" type="button" onClick={() => { setFormOpen(false); setEditingOrder(null); setEditingMaster(null); }}><X size={15} />Close</button></div>
        <form className="operations-create-form" onSubmit={submit}>
          {resource === "products" && editingMaster && <>
            <div className="operations-form-grid">
              <TextField name="name" label="Product name *" required defaultValue={String(editingMaster.name || "")} />
              <TextField name="category" label="Category" defaultValue={String(editingMaster.category || "")} />
              <TextField name="sellingPrice" label="Selling price *" type="number" min="0" step="0.01" required defaultValue={String(editingMaster.sellingPrice ?? 0)} />
              <TextField name="reorderLevel" label="Reorder threshold" type="number" min="0" step="0.001" defaultValue={String(editingMaster.reorderLevel ?? 0)} />
              {Number(editingMaster.stockOnHand || 0) <= 0 && <TextField name="purchaseCost" label="Purchase cost" type="number" min="0" step="0.01" defaultValue={String(editingMaster.purchaseCost ?? 0)} />}
              <TextField name="description" label="Description" defaultValue={String(editingMaster.description || "")} />
            </div>
            <p className="owner-footnote">SKU and unit are immutable after creation. Purchase cost is editable only when no stock remains, to protect inventory valuation history.</p>
          </>}
          {resource === "products" && !editingMaster && <>
            <div className="operations-form-grid">
              <TextField name="sku" label="SKU / product code *" required placeholder="SKU-001" />
              <TextField name="name" label="Product name *" required placeholder="Product name" />
              <TextField name="category" label="Category" placeholder="Category" />
              <TextField name="unit" label="Unit *" required defaultValue="pcs" placeholder="pcs, kg, box…" />
              <TextField name="purchaseCost" label="Purchase cost *" type="number" min="0" step="0.01" required defaultValue="0" />
              <TextField name="sellingPrice" label="Selling price *" type="number" min="0" step="0.01" required defaultValue="0" />
              <TextField name="initialStock" label="Opening stock" type="number" min="0" step="0.001" defaultValue="0" />
              <TextField name="reorderLevel" label="Reorder threshold" type="number" min="0" step="0.001" defaultValue="0" />
              <TextField name="description" label="Description" placeholder="Optional product details" />
            </div>
            <p className="owner-footnote">Opening stock is posted once to the inventory movement ledger at product creation. Future stock changes must use receipts, deliveries, or audited adjustments.</p>
          </>}
          {resource === "suppliers" && editingMaster && <div className="operations-form-grid">
            <TextField name="name" label="Supplier name *" required defaultValue={String(editingMaster.name || "")} />
            <TextField name="company" label="Company" defaultValue={String(editingMaster.company || "")} />
            <TextField name="email" label="Email" type="email" defaultValue={String(editingMaster.email || "")} />
            <TextField name="phone" label="Phone" defaultValue={String(editingMaster.phone || "")} />
            <TextField name="taxId" label="Tax / GST ID" defaultValue={String(editingMaster.taxId || "")} />
            <TextField name="paymentTermsDays" label="Payment terms (days)" type="number" min="0" max="365" defaultValue={String(editingMaster.paymentTermsDays ?? 0)} />
            <TextField name="address" label="Address" defaultValue={String(editingMaster.address || "")} />
            <SelectField name="status" label="Status" defaultValue={String(editingMaster.status || "ACTIVE")} options={[{value:"ACTIVE",label:"Active"},{value:"INACTIVE",label:"Inactive"}]} />
          </div>}
          {resource === "suppliers" && !editingMaster && <div className="operations-form-grid">
            <TextField name="name" label="Supplier name *" required />
            <TextField name="company" label="Company" />
            <TextField name="email" label="Email" type="email" />
            <TextField name="phone" label="Phone" />
            <TextField name="taxId" label="Tax / GST ID" />
            <TextField name="paymentTermsDays" label="Payment terms (days)" type="number" min="0" max="365" defaultValue="0" />
            <TextField name="address" label="Address" />
          </div>}
          {resource === "sales-orders" && <>
            <div className="operations-form-grid">
              <SelectField name="customerId" label="Customer *" required options={customerOptions} placeholder="Select customer" defaultValue={editingOrder?.customerId || ""} />
              <TextField name="orderDate" label="Order date" type="date" defaultValue={editingOrder?.orderDate ? new Date(editingOrder.orderDate).toISOString().slice(0, 10) : undefined} />
              <TextField name="expectedDeliveryAt" label="Expected delivery" type="datetime-local" defaultValue={editingOrder?.expectedDeliveryAt ? new Date(editingOrder.expectedDeliveryAt).toISOString().slice(0, 16) : undefined} />
              {!editingOrder && <SelectField name="status" label="Initial status" options={[{ value: "DRAFT", label: "Draft" }, { value: "CONFIRMED", label: "Confirmed" }]} defaultValue="DRAFT" />}
              <TextField name="notes" label="Order notes" placeholder="Optional notes" defaultValue={editingOrder?.notes || ""} />
            </div>
            <LineEditor title="Order items" lines={orderLines} setLines={setOrderLines} productOptions={productOptions} mode="sales" />
          </>}
          {resource === "purchase-orders" && <>
            <div className="operations-form-grid">
              <SelectField name="supplierId" label="Supplier *" required options={supplierOptions} placeholder="Select supplier" />
              <TextField name="orderDate" label="Order date" type="date" />
              <TextField name="expectedAt" label="Expected receipt date" type="date" />
              <TextField name="notes" label="Purchase notes" />
            </div>
            <LineEditor title="Purchase items" lines={purchaseLines} setLines={setPurchaseLines} productOptions={productOptions} mode="purchase" />
            <p className="owner-footnote">Unit purchase costs come from the saved product cost, not from a client-supplied total. Create a goods receipt after items physically arrive.</p>
          </>}
          {resource === "goods-receipts" && <>
            <div className="operations-form-grid">
              <label className="field"><span>Purchase order *</span><select value={selectedOrderId} required onChange={(event) => { setSelectedOrderId(event.target.value); setReceiptLines([{ purchaseOrderItemId: "", quantity: "1" }]); }}><option value="">Select open purchase order</option>{catalogs.purchaseOrders.filter((item) => ["ORDERED", "PARTIALLY_RECEIVED"].includes(item.status)).map((item) => <option value={item.id} key={item.id}>{item.orderNumber} · {item.supplier?.name}</option>)}</select></label>
              <TextField name="receivedAt" label="Received at" type="datetime-local" />
              <TextField name="notes" label="Receipt notes" />
            </div>
            <ReceiptLineEditor lines={receiptLines} setLines={setReceiptLines} options={(catalogs.purchaseOrders.find((item) => item.id === selectedOrderId)?.items || []).filter((item: Row) => Number(item.receivedQuantity) < Number(item.quantity)).map((item: Row) => ({ value: item.id, label: item.product?.sku + " · " + item.product?.name + " · remaining " + Math.max(0, Number(item.quantity) - Number(item.receivedQuantity)) }))} />
          </>}
          {resource === "deliveries" && <>
            <div className="operations-form-grid">
              <label className="field"><span>Sales order *</span><select required value={selectedOrderId} onChange={(event) => { setSelectedOrderId(event.target.value); setDeliveryLines([{ orderItemId: "", quantity: "1" }]); }}><option value="">Select confirmed order</option>{catalogs.salesOrders.filter((item) => ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.orderNumber} · {item.customer?.name}</option>)}</select></label>
              <TextField name="scheduledAt" label="Scheduled delivery" type="datetime-local" />
              <SelectField name="assignedUserId" label="Assign to staff (optional)" options={teamOptions} placeholder="Unassigned" />
            </div>
            <DeliveryLineEditor lines={deliveryLines} setLines={setDeliveryLines} options={(catalogs.salesOrders.find((item) => item.id === selectedOrderId)?.items || []).filter((item: Row) => Number(item.deliveredQuantity) < Number(item.quantity)).map((item: Row) => {
              const pending = (catalogs.salesOrders.find((order) => order.id === selectedOrderId)?.deliveries || []).filter((delivery: Row) => !["CANCELLED", "FAILED", "DELIVERED", "PARTIALLY_DELIVERED"].includes(delivery.status)).flatMap((delivery: Row) => delivery.items || []).filter((deliveryItem: Row) => deliveryItem.orderItemId === item.id).reduce((sum: number, deliveryItem: Row) => sum + Number(deliveryItem.quantity), 0);
              return { value: item.id, label: item.product?.sku + " · " + item.product?.name + " · remaining " + Math.max(0, Number(item.quantity) - Number(item.deliveredQuantity) - pending) };
            })} />
          </>}
          {resource === "customer-receipts" && <>
            <div className="operations-form-grid">
              <SelectField name="customerId" label="Customer *" required options={customerOptions} placeholder="Select customer" />
              <TextField name="amount" label="Actual amount received *" type="number" min="0.01" step="0.01" required />
              <SelectField name="method" label="Payment method *" required defaultValue="UPI" options={paymentMethods} />
              <TextField name="reference" label="Transaction reference" />
              <TextField name="receivedAt" label="Received at" type="datetime-local" />
              <TextField name="notes" label="Receipt notes" />
            </div>
            <AllocationEditor lines={allocations} setLines={setAllocations} options={invoiceOptions} label="Allocate to invoices" keyName="invoiceId" />
            <p className="owner-footnote">The total posted receipt is counted once as a collection. Invoice allocations must not exceed the actual receipt or each invoice&apos;s outstanding balance.</p>
          </>}
          {resource === "supplier-bills" && <>
            <div className="operations-form-grid">
              <SelectField name="supplierId" label="Supplier *" required options={supplierOptions} placeholder="Select supplier" />
              <SelectField name="purchaseOrderId" label="Related purchase order (optional)" options={catalogs.purchaseOrders.filter((item) => item.supplier?.id).map((item) => ({ value: item.id, label: item.orderNumber + " · " + item.supplier.name }))} placeholder="No linked purchase order" />
              <TextField name="billNumber" label="Supplier invoice number *" required />
              <TextField name="issueDate" label="Invoice date" type="date" />
              <TextField name="dueDate" label="Due date *" type="date" required />
              <TextField name="total" label="Invoice total *" type="number" min="0.01" step="0.01" required />
              <TextField name="notes" label="Notes" />
            </div>
          </>}
          {resource === "supplier-payments" && <>
            <div className="operations-form-grid">
              <SelectField name="supplierId" label="Supplier *" required options={supplierOptions} placeholder="Select supplier" />
              <TextField name="amount" label="Actual payment amount *" type="number" min="0.01" step="0.01" required />
              <SelectField name="method" label="Payment method *" required defaultValue="UPI" options={paymentMethods} />
              <TextField name="reference" label="Transaction reference" />
              <TextField name="paidAt" label="Payment date" type="datetime-local" />
              <TextField name="notes" label="Notes" />
            </div>
            <AllocationEditor lines={supplierAllocations} setLines={setSupplierAllocations} options={catalogs.supplierBills.filter((bill) => bill.status !== "CANCELLED").map((bill) => ({ value: bill.id, label: bill.billNumber + " · " + bill.supplier?.name + " · total " + bill.total }))} label="Allocate to supplier bills" keyName="billId" />
          </>}
          {resource === "inventory" && <>
            <div className="operations-form-grid">
              <SelectField name="productId" label="Product *" required options={productOptions} placeholder="Select product" />
              <SelectField name="movementType" label="Movement type *" required defaultValue="ADJUSTMENT_IN" options={[
                { value: "ADJUSTMENT_IN", label: "Adjustment in" }, { value: "ADJUSTMENT_OUT", label: "Adjustment out" },
                { value: "DAMAGE", label: "Damage / write-off" }, { value: "LOSS", label: "Lost stock" },
                { value: "SALE_RETURN", label: "Customer return" }, { value: "PURCHASE_RETURN", label: "Return to supplier" },
              ]} />
              <TextField name="quantity" label="Quantity *" type="number" min="0.001" step="0.001" required />
              <TextField name="notes" label="Reason / transaction note *" required placeholder="Reason for adjustment" />
            </div>
            <p className="owner-footnote">Stock cannot be reduced below zero. Adjustment cost comes from the saved product cost; every movement has a transaction reference and audit event. Use goods receipts and delivery posting for normal business flows.</p>
          </>}
          {resource === "customer-follow-ups" && <div className="operations-form-grid">
            <SelectField name="customerId" label="Customer *" required options={customerOptions} placeholder="Select customer" />
            <TextField name="title" label="Follow-up title *" required />
            <TextField name="dueAt" label="Due date/time *" type="datetime-local" required />
            <SelectField name="channel" label="Channel" options={[{ value: "PHONE", label: "Phone" }, { value: "EMAIL", label: "Email" }, { value: "WHATSAPP", label: "WhatsApp (provider must be configured)" }, { value: "IN_PERSON", label: "In person" }]} placeholder="Select channel" />
            <SelectField name="assignedUserId" label="Assigned staff member (optional)" options={teamOptions} placeholder="Unassigned" />
            <TextField name="notes" label="Notes" />
          </div>}
          {resource === "permissions" && <>
            <div className="operations-form-grid">
              <SelectField name="role" label="Team role *" required options={roleOptions} />
              <TextField name="moduleKey" label="Module key *" required placeholder="e.g. products, sales-orders" />
              <SelectField name="actionKey" label="Action *" required options={[{value:"read",label:"Read"},{value:"create",label:"Create"},{value:"update",label:"Update"},{value:"delete",label:"Delete"},{value:"manage",label:"Manage"}]} />
              <SelectField name="granted" label="Permission *" required defaultValue="true" options={[{ value: "true", label: "Allow" }, { value: "false", label: "Deny" }]} />
            </div>
            <p className="owner-footnote">Overrides are checked server-side. Only the business owner can change them. A deny or allow override replaces the role default for that module/action.</p>
          </>}
          <div className="crm-form-actions"><button className="brand-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="workspace-spinner" size={16} /> : <Plus size={16} />}{busy ? "Saving…" : editingMaster ? "Save changes" : editingOrder ? "Update draft order" : "Save record"}</button><button type="button" className="crm-secondary-button" onClick={() => { setFormOpen(false); setEditingOrder(null); setEditingMaster(null); }}>Cancel</button></div>
        </form>
      </section>}

      <section className="card workspace-list-card operations-list-card">
        <div className="crm-table-toolbar">
          <div><h2>Saved records</h2><p className="owner-table-caption">{filtered.length} record{filtered.length === 1 ? "" : "s"} · loaded from the business database</p></div>
          <div className="operations-table-actions">
            <label className="crm-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(3); }} placeholder={"Search " + config.title.toLowerCase()} aria-label={"Search " + config.title} /></label>
            {statusOptions.length > 0 && <select className="operations-status-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setVisibleCount(3); }} aria-label="Filter by status"><option value="ALL">All statuses</option>{statusOptions.map((option) => <option value={option} key={option}>{titleCase(option)}</option>)}</select>}
            <button type="button" className="crm-secondary-button" onClick={exportCSV} disabled={!filtered.length}><ArrowDownToLine size={15} />Export CSV</button>
          </div>
        </div>
        {loading ? <div className="operations-loading"><LoaderCircle className="workspace-spinner" size={20} />Loading saved records…</div>
          : filtered.length === 0 ? <div className="dashboard-empty"><span className="dashboard-empty-icon"><Search size={18} /></span><strong>{search || statusFilter !== "ALL" ? "No records match your filters" : "Nothing has been recorded yet"}</strong><p>{error || (search || statusFilter !== "ALL" ? "Change the search or status filter and try again." : config.empty)}</p></div>
          : <>
            <div className="workspace-table-wrap"><table className="workspace-table operations-table"><thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead>
              <tbody>{filtered.slice(0, visibleCount).map((row) => <tr key={row.id}>{config.columns.map((column) => <td key={column.key}><Cell row={row} column={column} /></td>)}<td><RowActions resource={resource} row={row} owner={owner} canUpdate={canUpdate} onChange={changeStatus} onUpdate={updateRow} onInvoice={issueInvoice} onEdit={handleEditRow} /></td></tr>)}</tbody>
            </table></div>
            <div className="operations-table-footer"><span>Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} matching records</span>
              {filtered.length > visibleCount && <button className="crm-secondary-button" type="button" onClick={() => setVisibleCount((count) => Math.min(filtered.length, count + 20))}>Show more ({filtered.length - visibleCount} remaining) <ArrowRight size={14} /></button>}
              {visibleCount > 3 && <button className="crm-secondary-button" type="button" onClick={() => setVisibleCount(3)}>Show fewer</button>}
            </div>
          </>}
      </section>
    </div>
  );
}

const paymentMethods = [
  { value: "CASH", label: "Cash" }, { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "UPI", label: "UPI" }, { value: "CARD", label: "Card" }, { value: "CHEQUE", label: "Cheque" }, { value: "OTHER", label: "Other" },
];
const roleOptions = [
  { value: "STAFF", label: "Staff" }, { value: "SALES", label: "Sales" }, { value: "DELIVERY", label: "Delivery" },
  { value: "COLLECTIONS", label: "Collections" }, { value: "INVENTORY_MANAGER", label: "Inventory manager" }, { value: "ACCOUNTANT", label: "Accountant" },
];

function TextField({ name, label, type = "text", required, defaultValue, placeholder, min, max, step }: {
  name: string; label: string; type?: string; required?: boolean; defaultValue?: string; placeholder?: string;
  min?: string; max?: string; step?: string;
}) {
  return <label className="field"><span>{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} min={min} max={max} step={step} /></label>;
}
function SelectField({ name, label, required, defaultValue, options, placeholder }: {
  name: string; label: string; required?: boolean; defaultValue?: string; options: Array<{ value: string; label: string }>; placeholder?: string;
}) {
  return <label className="field"><span>{label}</span><select name={name} required={required} defaultValue={defaultValue ?? ""}><option value="">{placeholder || "Select an option"}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}
type SalesLine = { productId: string; quantity: string; discountPercent?: string; taxPercent?: string };
function LineEditor({ title, lines, setLines, productOptions, mode }: {
  title: string; lines: SalesLine[]; setLines: (lines: SalesLine[]) => void; productOptions: Array<{value:string;label:string}>;
  mode: "sales" | "purchase";
}) {
  return <div className="operations-lines"><div className="operations-lines-heading"><strong>{title}</strong><button type="button" className="crm-secondary-button" onClick={() => setLines([...lines, mode === "sales" ? { productId: "", quantity: "1", discountPercent: "0", taxPercent: "0" } : { productId: "", quantity: "1" }])}><Plus size={14} />Add line</button></div>
    {lines.map((line,index) => <div className="operations-line-row" key={index}>
      <label className="field"><span>Product</span><select required={index===0} value={line.productId} onChange={(event) => setLines(lines.map((entry,i) => i===index ? {...entry,productId:event.target.value} : entry))}><option value="">Select product</option>{productOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label className="field"><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,quantity:event.target.value}:entry))}/></label>
      {mode==="sales" && <>
        <label className="field"><span>Discount %</span><input type="number" min="0" max="100" step="0.01" value={line.discountPercent || "0"} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,discountPercent:event.target.value}:entry))}/></label>
        <label className="field"><span>Tax %</span><input type="number" min="0" max="100" step="0.01" value={line.taxPercent || "0"} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,taxPercent:event.target.value}:entry))}/></label>
      </>}
      {lines.length > 1 && <button type="button" className="crm-secondary-button operations-remove-line" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Remove</button>}
    </div>)}
  </div>;
}

type ReceiptLine = { purchaseOrderItemId: string; quantity: string };
function ReceiptLineEditor({ lines, setLines, options }: { lines: ReceiptLine[]; setLines: (lines: ReceiptLine[]) => void; options: Array<{value:string;label:string}> }) {
  return <div className="operations-lines"><div className="operations-lines-heading"><strong>Receipt quantities</strong><button type="button" className="crm-secondary-button" onClick={()=>setLines([...lines,{purchaseOrderItemId:"",quantity:"1"}])}><Plus size={14}/>Add line</button></div>
    {lines.map((line,index)=><div className="operations-line-row" key={index}>
      <label className="field"><span>Purchase-order line</span><select required={index===0} value={line.purchaseOrderItemId} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,purchaseOrderItemId:event.target.value}:entry))}><option value="">Select item</option>{options.map((option)=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label className="field"><span>Received quantity</span><input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,quantity:event.target.value}:entry))}/></label>
      {lines.length>1&&<button type="button" className="crm-secondary-button operations-remove-line" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Remove</button>}
    </div>)}
  </div>;
}
type DeliveryLine = { orderItemId: string; quantity: string };
function DeliveryLineEditor({ lines, setLines, options }: { lines: DeliveryLine[]; setLines: (lines: DeliveryLine[]) => void; options: Array<{value:string;label:string}> }) {
  return <div className="operations-lines"><div className="operations-lines-heading"><strong>Items to deliver</strong><button type="button" className="crm-secondary-button" onClick={()=>setLines([...lines,{orderItemId:"",quantity:"1"}])}><Plus size={14}/>Add line</button></div>
    {lines.map((line,index)=><div className="operations-line-row" key={index}>
      <label className="field"><span>Sales-order line</span><select required={index===0} value={line.orderItemId} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,orderItemId:event.target.value}:entry))}><option value="">Select item</option>{options.map((option)=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label className="field"><span>Quantity to deliver</span><input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,quantity:event.target.value}:entry))}/></label>
      {lines.length>1&&<button type="button" className="crm-secondary-button operations-remove-line" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Remove</button>}
    </div>)}
  </div>;
}
type Allocation = { invoiceId?: string; billId?: string; amount: string };
function AllocationEditor({ lines, setLines, options, label, keyName }: {
  lines: Allocation[]; setLines: (lines: Allocation[]) => void; options: Array<{value:string;label:string}>; label: string; keyName: "invoiceId" | "billId";
}) {
  return <div className="operations-lines"><div className="operations-lines-heading"><strong>{label}</strong><button type="button" className="crm-secondary-button" onClick={()=>setLines([...lines,{[keyName]:"",amount:""}])}><Plus size={14}/>Add allocation</button></div>
    {lines.map((line,index)=><div className="operations-line-row" key={index}>
      <label className="field"><span>Invoice / bill</span><select value={line[keyName] || ""} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,[keyName]:event.target.value}:entry))}><option value="">Unallocated</option>{options.map((option)=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label className="field"><span>Allocated amount</span><input type="number" min="0.01" step="0.01" value={line.amount} onChange={(event)=>setLines(lines.map((entry,i)=>i===index?{...entry,amount:event.target.value}:entry))}/></label>
      {lines.length>1&&<button type="button" className="crm-secondary-button operations-remove-line" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Remove</button>}
    </div>)}
  </div>;
}

function Cell({ row, column }: { row: Row; column: Column }) {
  const value = readKey(row, column.key);
  if (column.key === "status" || column.key === "movementType") {
    const state = String(value || "unknown").toLowerCase();
    return <span className={"crm-pill " + (["paid","posted","delivered","received","active","confirmed","partially_delivered","partially_received"].includes(state) ? "crm-pill-active" : ["cancelled","reversed","failed","inactive","loss","damage"].includes(state) ? "crm-pill-overdue" : "")}>{titleCase(String(value || "Unknown"))}</span>;
  }
  if (column.key === "notes" && value) return <span title={String(value)}>{String(value).slice(0,80)}{String(value).length>80?"…":""}</span>;
  return <span>{showValue(value, column.key)}</span>;
}

function RowActions({ resource, row, owner, canUpdate, onChange, onUpdate, onInvoice, onEdit }: {
  resource: string; row: Row; owner: boolean; canUpdate: boolean; onChange: (row: Row, status: string) => void;
  onUpdate: (row: Row, body: Record<string, unknown>, confirmation?: string) => void;
  onInvoice: (row: Row) => void;
  onEdit: (row: Row) => void;
}) {
  if (resource === "sales-orders") return <div className="operations-row-actions">
    {canUpdate && row.status === "DRAFT" && <button type="button" className="crm-secondary-button" onClick={()=>onEdit(row)}>Edit draft</button>}
    {canUpdate && row.status === "DRAFT" && <button type="button" className="crm-secondary-button" onClick={()=>onChange(row,"CONFIRMED")}>Confirm</button>}
    {owner && ["CONFIRMED","PARTIALLY_DELIVERED","DELIVERED"].includes(row.status) && !(row.invoices || []).length && <button type="button" className="crm-secondary-button" onClick={()=>onInvoice(row)}>Issue invoice</button>}
    {canUpdate && ["DRAFT","CONFIRMED","PARTIALLY_DELIVERED"].includes(row.status) && <button type="button" className="crm-secondary-button is-danger" onClick={()=>onChange(row,"CANCELLED")}>Cancel</button>}
    {(row.invoices || []).map((invoice: Row) => <a key={invoice.id} className="crm-pill crm-pill-active" href={"/operations/invoices/" + invoice.id}>{invoice.invoiceNumber}</a>)}
  </div>;
  if (resource === "purchase-orders") return <div className="operations-row-actions">
    {canUpdate && !["CANCELLED","RECEIVED"].includes(row.status) && <button type="button" className="crm-secondary-button is-danger" onClick={()=>onChange(row,"CANCELLED")}>Cancel</button>}
  </div>;
  if (resource === "deliveries") return <div className="operations-row-actions">
    {canUpdate && row.status === "PENDING" && <button type="button" className="crm-secondary-button" onClick={()=>onChange(row,"DISPATCHED")}>Dispatch</button>}
    {canUpdate && ["PENDING","DISPATCHED"].includes(row.status) && <>
      <button type="button" className="crm-secondary-button" onClick={()=>onChange(row,"PARTIALLY_DELIVERED")}>Post delivery</button>
      <button type="button" className="crm-secondary-button is-danger" onClick={()=>onChange(row,"FAILED")}>Failed</button>
      <button type="button" className="crm-secondary-button is-danger" onClick={()=>onChange(row,"CANCELLED")}>Cancel</button>
    </>}
  </div>;
  if (["goods-receipts","customer-receipts","supplier-payments"].includes(resource) && row.status === "POSTED" && owner) {
    return <button type="button" className="crm-secondary-button is-danger" onClick={()=>onChange(row,"REVERSED")}>Reverse</button>;
  }
  if (resource === "customer-follow-ups" && canUpdate && row.status === "OPEN") return <div className="operations-row-actions">
    <button type="button" className="crm-secondary-button" onClick={()=>onUpdate(row,{status:"COMPLETED"})}>Complete</button>
    <button type="button" className="crm-secondary-button is-danger" onClick={()=>onUpdate(row,{status:"CANCELLED"})}>Cancel</button>
  </div>;
  if (resource === "products") return <div className="operations-row-actions">
    {canUpdate && <button type="button" className="crm-secondary-button" onClick={() => onEdit(row)}>Edit</button>}
    {owner && row.status !== "INACTIVE" && <button type="button" className="crm-secondary-button is-danger" onClick={() => onUpdate(row,{status:"INACTIVE"},"Deactivate this product? Existing stock and transaction history will be preserved.")}>Deactivate</button>}
  </div>;
  if (resource === "suppliers") return <div className="operations-row-actions">
    {canUpdate && <button type="button" className="crm-secondary-button" onClick={() => onEdit(row)}>Edit</button>}
    {owner && row.status !== "INACTIVE" && <button type="button" className="crm-secondary-button is-danger" onClick={() => onUpdate(row,{status:"INACTIVE"},"Deactivate this supplier? Existing purchase and payment history will be preserved.")}>Deactivate</button>}
  </div>;
  if (resource === "permissions" && owner) return <button type="button" className="crm-secondary-button" onClick={()=>onUpdate(row,{granted:!row.granted})}>{row.granted?"Deny":"Allow"}</button>;
  return <span className="muted">—</span>;
}
