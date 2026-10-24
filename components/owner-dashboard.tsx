import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes,
  CalendarClock, CheckCircle2, ClipboardList, CreditCard, FileText, HandCoins,
  Package, ShoppingCart, Truck, Users, Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { sumPostedAmounts, sumPostedAllocations } from "@/lib/operations/finance";

type PeriodKey = "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "LAST_30_DAYS" | "THIS_MONTH" | "FY" | "CUSTOM";
type SearchParams = Record<string, string | string[] | undefined>;

function pickParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function midnight(date: Date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function endOfDay(date: Date) { const d = midnight(date); d.setDate(d.getDate() + 1); d.setMilliseconds(d.getMilliseconds() - 1); return d; }
function parseDate(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(value + "T00:00:00");
  return Number.isNaN(date.valueOf()) ? fallback : date;
}
function periodRange(params: SearchParams, financialYearStartMonth: number) {
  const now = new Date();
  const today = midnight(now);
  const requested = pickParam(params.period) as PeriodKey | undefined;
  const period: PeriodKey = ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "THIS_MONTH", "FY", "CUSTOM"].includes(requested || "") ? requested! : "LAST_30_DAYS";
  let start = new Date(today);
  let end = endOfDay(today);
  if (period === "YESTERDAY") { start.setDate(start.getDate() - 1); end = endOfDay(start); }
  if (period === "LAST_7_DAYS") start.setDate(start.getDate() - 6);
  if (period === "LAST_30_DAYS") start.setDate(start.getDate() - 29);
  if (period === "THIS_MONTH") start = new Date(today.getFullYear(), today.getMonth(), 1);
  if (period === "FY") {
    const monthIndex = Math.max(1, Math.min(12, financialYearStartMonth)) - 1;
    const year = today.getMonth() < monthIndex ? today.getFullYear() - 1 : today.getFullYear();
    start = new Date(year, monthIndex, 1);
  }
  if (period === "CUSTOM") {
    start = midnight(parseDate(pickParam(params.start), new Date(today.getFullYear(), today.getMonth(), 1)));
    end = endOfDay(parseDate(pickParam(params.end), today));
    if (start > end) { const oldStart = start; start = midnight(end); end = endOfDay(oldStart); }
    const maxRange = 366 * 3 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxRange) start = new Date(end.getTime() - maxRange);
  }
  return { period, start, end, today };
}
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
  catch { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value); }
}
function dateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function number(value: unknown) { return Number(value ?? 0); }
function invoicePaid(invoice: {
  payments: Array<{ amount: unknown; status?: string }>;
  receiptAllocations: Array<{ amount: unknown; receipt: { status: string } }>;
}) {
  return sumPostedAmounts(invoice.payments) + sumPostedAllocations(invoice.receiptAllocations);
}
function currencyPercent(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value) + "%";
}
function ShowMoreList<T extends { id: string }>({ items, empty, renderItem }: {
  items: T[];
  empty: string;
  renderItem: (item: T) => ReactNode;
}) {
  if (!items.length) return <div className="owner-empty"><CheckCircle2 size={17} /><span>{empty}</span></div>;
  return (
    <div className="owner-action-list">
      {items.slice(0, 3).map((item) => <div key={item.id}>{renderItem(item)}</div>)}
      {items.length > 3 && <details className="owner-show-more"><summary>Show {items.length - 3} more</summary>{items.slice(3).map((item) => <div key={item.id}>{renderItem(item)}</div>)}</details>}
    </div>
  );
}

export async function OwnerDashboard({ tenantId, searchParams }: { tenantId: string; searchParams: SearchParams }) {
  let settings: { currency: string; financialYearStartMonth: number } | null = null;
  try {
    settings = await db.businessSettings.findUnique({ where: { tenantId }, select: { currency: true, financialYearStartMonth: true } });
  } catch {
    settings = null;
  }
  const { period, start, end, today } = periodRange(searchParams, settings?.financialYearStartMonth ?? 4);
  const currency = settings?.currency || "INR";
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
  const priorMonth = new Date(today); priorMonth.setDate(priorMonth.getDate() - 30);

  let datasets: {
    salesOrders: any[]; periodDeliveries: any[]; periodInvoices: any[]; allInvoices: any[]; periodPayments: any[];
    periodReceipts: any[]; products: any[]; pendingDeliveries: any[]; bills: any[];
    periodSupplierPayments: any[]; purchaseOrders: any[]; followUps: any[]; tasks: any[]; movements: any[];
  };
  try {
    const [
      salesOrders, periodDeliveries, periodInvoices, allInvoices, periodPayments, periodReceipts, products,
      pendingDeliveries, bills, periodSupplierPayments, purchaseOrders, followUps, tasks, movements,
    ] = await Promise.all([
      db.salesOrder.findMany({
        where: { tenantId, orderDate: { gte: start, lte: end }, status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED"] } },
        select: {
          id: true, orderNumber: true, status: true, total: true, orderDate: true, customer: { select: { id: true, name: true } },
          items: { select: { productId: true, quantity: true, deliveredQuantity: true, unitPrice: true, unitCost: true, discountAmount: true, product: { select: { sku: true, name: true } } } },
        },
        orderBy: { orderDate: "desc" }, take: 5000,
      }),
      db.delivery.findMany({
        where: { tenantId, status: { in: ["PARTIALLY_DELIVERED", "DELIVERED"] }, completedAt: { gte: start, lte: end } },
        select: {
          id: true, deliveryNumber: true, completedAt: true,
          order: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true } } } },
          items: { select: {
            productId: true, quantity: true, unitCost: true,
            product: { select: { name: true, sku: true, purchaseCost: true } },
            orderItem: { select: { quantity: true, unitPrice: true, discountAmount: true } },
          } },
        },
        orderBy: { completedAt: "desc" }, take: 5000,
      }),
      db.invoice.findMany({
        where: { tenantId, salesOrderId: null, issueDate: { gte: start, lte: end }, status: { not: "CANCELLED" } },
        select: { id: true, invoiceNumber: true, total: true, issueDate: true, dueDate: true, status: true, customer: { select: { id: true, name: true } } },
        orderBy: { issueDate: "desc" }, take: 5000,
      }),
      db.invoice.findMany({
        where: { tenantId, status: { not: "CANCELLED" } },
        select: {
          id: true, invoiceNumber: true, total: true, issueDate: true, dueDate: true, status: true,
          customer: { select: { id: true, name: true } },
          payments: { select: { amount: true, paidAt: true, status: true } },
          receiptAllocations: { select: { amount: true, receipt: { select: { status: true, receivedAt: true } } } },
          items: { select: { productId: true, description: true, quantity: true, unitPrice: true, lineTotal: true } },
        },
        orderBy: { dueDate: "asc" }, take: 10000,
      }),
      db.payment.findMany({ where: { tenantId, status: "POSTED", paidAt: { gte: start, lte: end } }, select: { id: true, amount: true, paidAt: true, status: true } , take: 10000 }),
      db.customerReceipt.findMany({ where: { tenantId, status: "POSTED", receivedAt: { gte: start, lte: end } }, select: { id: true, amount: true, receivedAt: true }, take: 10000 }),
      db.product.findMany({ where: { tenantId, status: "ACTIVE" }, select: { id: true, sku: true, name: true, category: true, unit: true, stockOnHand: true, reorderLevel: true, purchaseCost: true, sellingPrice: true }, orderBy: { name: "asc" }, take: 10000 }),
      db.delivery.findMany({
        where: { tenantId, status: { in: ["PENDING", "DISPATCHED", "FAILED"] } },
        select: { id: true, deliveryNumber: true, status: true, scheduledAt: true, failureReason: true, order: { select: { orderNumber: true, customer: { select: { name: true } } } } },
        orderBy: { scheduledAt: "asc" }, take: 1000,
      }),
      db.supplierBill.findMany({
        where: { tenantId, status: { not: "CANCELLED" } },
        select: { id: true, billNumber: true, total: true, dueDate: true, status: true, supplier: { select: { name: true } }, allocations: { select: { amount: true, payment: { select: { status: true } } } } },
        orderBy: { dueDate: "asc" }, take: 10000,
      }),
      db.supplierPayment.findMany({ where: { tenantId, status: "POSTED", paidAt: { gte: start, lte: end } }, select: { id: true, amount: true, paidAt: true }, take: 10000 }),
      db.purchaseOrder.findMany({
        where: { tenantId, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } },
        select: { id: true, orderNumber: true, status: true, expectedAt: true, supplier: { select: { name: true } } },
        orderBy: { expectedAt: "asc" }, take: 1000,
      }),
      db.customerFollowUp.findMany({
        where: { tenantId, status: "OPEN", dueAt: { lte: nextWeek } },
        select: { id: true, title: true, dueAt: true, customer: { select: { name: true } } },
        orderBy: { dueAt: "asc" }, take: 1000,
      }),
      db.task.findMany({
        where: { tenantId, status: { not: "DONE" }, OR: [{ dueDate: null }, { dueDate: { lte: nextWeek } }] },
        select: { id: true, title: true, dueDate: true, priority: true, status: true },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }], take: 1000,
      }),
      db.inventoryMovement.findMany({
        where: { tenantId, createdAt: { gte: priorMonth }, movementType: { in: ["DAMAGE", "LOSS", "SALE_RETURN", "PURCHASE_RETURN"] } },
        select: { id: true, movementType: true, quantity: true, createdAt: true, notes: true, product: { select: { name: true, sku: true, unit: true } } },
        orderBy: { createdAt: "desc" }, take: 300,
      }),
    ]);
    datasets = { salesOrders, periodDeliveries, periodInvoices, allInvoices, periodPayments, periodReceipts, products, pendingDeliveries, bills, periodSupplierPayments, purchaseOrders, followUps, tasks, movements };
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = code === "P2021" || code === "P2022"
      ? "Business operations tables are not available yet. Apply the pending business operations migration before enabling these workflows."
      : "The database is temporarily unavailable. The dashboard is withholding figures rather than showing sample or stale business metrics.";
    return (
      <div className="owner-dashboard">
        <header className="owner-header"><div><p className="dashboard-eyebrow">OWNER COMMAND CENTRE</p><h1>Business overview</h1><p className="dashboard-subtitle">Live business intelligence</p></div></header>
        <section className="owner-system-notice" role="status"><AlertCircle size={22} /><div><strong>Live data is currently unavailable</strong><p>{message}</p><small>Reference: {(error as { code?: string }).code || "DATABASE_UNAVAILABLE"}</small></div></section>
      </div>
    );
  }

  const {
    salesOrders, periodDeliveries, periodInvoices, allInvoices, periodPayments, periodReceipts, products,
    pendingDeliveries, bills, periodSupplierPayments, purchaseOrders, followUps, tasks, movements,
  } = datasets;
  const bookedSales = salesOrders.reduce((sum, order) => sum + number(order.total), 0)
    + periodInvoices.reduce((sum, invoice) => sum + number(invoice.total), 0);
  const collections = periodPayments.reduce((sum, payment) => sum + number(payment.amount), 0)
    + periodReceipts.reduce((sum, receipt) => sum + number(receipt.amount), 0);
  const receivables = allInvoices.map((invoice) => {
    const paid = invoicePaid(invoice);
    return { ...invoice, paid, balance: Math.max(0, number(invoice.total) - paid), daysOverdue: Math.max(0, Math.floor((today.getTime() - midnight(new Date(invoice.dueDate)).getTime()) / 86400000)) };
  }).filter((invoice) => invoice.balance > 0.005);
  const overdue = receivables.filter((invoice) => new Date(invoice.dueDate) < today).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const receivablesTotal = receivables.reduce((sum, invoice) => sum + invoice.balance, 0);
  const overdueTotal = overdue.reduce((sum, invoice) => sum + invoice.balance, 0);
  const ageing = [
    { label: "Not due", value: receivables.filter((item) => new Date(item.dueDate) >= today).reduce((sum, item) => sum + item.balance, 0) },
    { label: "1–7 days", value: overdue.filter((item) => item.daysOverdue <= 7).reduce((sum, item) => sum + item.balance, 0) },
    { label: "8–30 days", value: overdue.filter((item) => item.daysOverdue >= 8 && item.daysOverdue <= 30).reduce((sum, item) => sum + item.balance, 0) },
    { label: "31–60 days", value: overdue.filter((item) => item.daysOverdue >= 31 && item.daysOverdue <= 60).reduce((sum, item) => sum + item.balance, 0) },
    { label: "60+ days", value: overdue.filter((item) => item.daysOverdue > 60).reduce((sum, item) => sum + item.balance, 0) },
  ];
  const payables = bills.map((bill) => {
    const paid = bill.allocations.filter((item: { payment: { status: string }; amount: unknown }) => item.payment.status === "POSTED").reduce((sum: number, item: { amount: unknown }) => sum + number(item.amount), 0);
    return { ...bill, balance: Math.max(0, number(bill.total) - paid) };
  }).filter((bill) => bill.balance > 0.005);
  const payableTotal = payables.reduce((sum, bill) => sum + bill.balance, 0);
  const deliveredProfitLines = periodDeliveries.flatMap((delivery) => delivery.items.map((item: any) => {
    const quantity = number(item.quantity);
    const orderedQuantity = Math.max(number(item.orderItem.quantity), 0.000001);
    const revenue = quantity * number(item.orderItem.unitPrice) - number(item.orderItem.discountAmount) * quantity / orderedQuantity;
    const costUnit = item.unitCost === null || item.unitCost === undefined ? number(item.product.purchaseCost) : number(item.unitCost);
    return { revenue, cost: quantity * costUnit };
  }));
  const grossProfit = deliveredProfitLines.reduce((sum, item) => sum + item.revenue - item.cost, 0);
  const deliveredRevenue = deliveredProfitLines.reduce((sum, item) => sum + item.revenue, 0);
  const grossMargin = deliveredRevenue > 0 ? grossProfit / deliveredRevenue * 100 : 0;
  const inventoryValue = products.reduce((sum, product) => sum + number(product.stockOnHand) * number(product.purchaseCost), 0);
  const lowStock = products.filter((product) => number(product.stockOnHand) <= number(product.reorderLevel));
  const outOfStock = products.filter((product) => number(product.stockOnHand) <= 0);
  const orderCount = salesOrders.length;
  const averageOrder = orderCount ? salesOrders.reduce((sum, order) => sum + number(order.total), 0) / orderCount : 0;
  const overdueDeliveries = pendingDeliveries.filter((item) => item.scheduledAt && new Date(item.scheduledAt) < new Date() && ["PENDING", "DISPATCHED"].includes(item.status));
  const dueSoonInvoices = receivables.filter((item) => new Date(item.dueDate) >= today && new Date(item.dueDate) <= nextWeek);
  const delayedPOs = purchaseOrders.filter((item) => item.expectedAt && new Date(item.expectedAt) < today);
  const pendingReceiptCount = purchaseOrders.filter((po) => po.status === "PARTIALLY_RECEIVED").length;
  const failedDeliveries = pendingDeliveries.filter((item) => item.status === "FAILED");
  const actionCount = overdue.length + dueSoonInvoices.length + followUps.length + tasks.length + overdueDeliveries.length + failedDeliveries.length + lowStock.length + delayedPOs.length + movements.length;
  const topProducts = new Map<string, { id: string; sku: string; name: string; value: number; quantity: number }>();
  const topCustomers = new Map<string, { id: string; name: string; value: number; orders: number }>();
  const customerOrderIds = new Map<string, Set<string>>();
  for (const delivery of periodDeliveries) {
    const customerId = delivery.order.customer.id;
    const customer = topCustomers.get(customerId) || { id: customerId, name: delivery.order.customer.name, value: 0, orders: 0 };
    let orderIds = customerOrderIds.get(customerId);
    if (!orderIds) { orderIds = new Set<string>(); customerOrderIds.set(customerId, orderIds); }
    orderIds.add(delivery.order.id);
    for (const item of delivery.items) {
      const qty = number(item.quantity);
      const lineRevenue = qty * number(item.orderItem.unitPrice)
        - number(item.orderItem.discountAmount) * qty / Math.max(number(item.orderItem.quantity), 0.000001);
      const sku = item.product.sku;
      const productName = item.product.name;
      const entry = topProducts.get(item.productId) || { id: item.productId, sku, name: productName, value: 0, quantity: 0 };
      entry.quantity += qty;
      entry.value += lineRevenue;
      topProducts.set(item.productId, entry);
      customer.value += lineRevenue;
    }
    customer.orders = orderIds.size;
    topCustomers.set(customerId, customer);
  }
  const bestProducts = [...topProducts.values()].sort((a, b) => b.value - a.value).slice(0, 5);
  const customerLeaders = [...topCustomers.values()].sort((a, b) => b.value - a.value).slice(0, 5);

  const buckets = Array.from({ length: 7 }, (_, index) => {
    const span = (end.getTime() - start.getTime() + 1) / 7;
    const bucketStart = new Date(start.getTime() + span * index);
    const bucketEnd = index === 6 ? end : new Date(start.getTime() + span * (index + 1) - 1);
    const salesFromOrders = salesOrders.filter((order) => new Date(order.orderDate) >= bucketStart && new Date(order.orderDate) <= bucketEnd).reduce((sum, order) => sum + number(order.total), 0);
    const salesFromInvoices = periodInvoices.filter((invoice) => new Date(invoice.issueDate) >= bucketStart && new Date(invoice.issueDate) <= bucketEnd).reduce((sum, invoice) => sum + number(invoice.total), 0);
    const collectedFromPayments = periodPayments.filter((payment) => new Date(payment.paidAt) >= bucketStart && new Date(payment.paidAt) <= bucketEnd).reduce((sum, payment) => sum + number(payment.amount), 0);
    const collectedFromReceipts = periodReceipts.filter((receipt) => new Date(receipt.receivedAt) >= bucketStart && new Date(receipt.receivedAt) <= bucketEnd).reduce((sum, receipt) => sum + number(receipt.amount), 0);
    return { label: dateLabel(bucketStart).replace(/ \d{4}$/, ""), sales: salesFromOrders + salesFromInvoices, collections: collectedFromPayments + collectedFromReceipts };
  });
  const maxTrend = Math.max(1, ...buckets.flatMap((item) => [item.sales, item.collections]));
  const periodLabel = dateLabel(start) + " – " + dateLabel(end);
  const actionUrl = (base: string) => base + "?period=" + period;
  const kpis = [
    { label: "Sales booked", value: money(bookedSales, currency), note: "Orders and standalone invoices issued in period", icon: ShoppingCart, href: actionUrl("/operations/sales-orders"), tone: "blue" },
    { label: "Collections received", value: money(collections, currency), note: "Posted customer payments in period", icon: HandCoins, href: actionUrl("/operations/customer-receipts"), tone: "green" },
    { label: "Supplier payments sent", value: money(periodSupplierPayments.reduce((sum, payment) => sum + number(payment.amount), 0), currency), note: "Posted supplier payments in period", icon: Wallet, href: actionUrl("/operations/supplier-payments"), tone: "amber" },
    { label: "Customer receivables", value: money(receivablesTotal, currency), note: "Cumulative unpaid invoice balances", icon: CreditCard, href: "/crm/invoices", tone: "violet" },
    { label: "Overdue receivables", value: money(overdueTotal, currency), note: overdue.length + " overdue invoices", icon: AlertCircle, href: "/crm/invoices", tone: "amber" },
    { label: "Supplier payables", value: money(payableTotal, currency), note: "Unpaid supplier bills after posted allocations", icon: Wallet, href: "/operations/supplier-bills", tone: "amber" },
    { label: "Est. gross profit", value: money(grossProfit, currency), note: "Delivered in period · estimated cost · " + currencyPercent(grossMargin) + " margin", icon: Activity, href: "/operations/sales-orders", tone: "green" },
    { label: "Orders · avg. value", value: String(orderCount) + " · " + money(averageOrder, currency), note: "Orders booked in selected period", icon: FileText, href: actionUrl("/operations/sales-orders"), tone: "blue" },
    { label: "Inventory valuation", value: money(inventoryValue, currency), note: "Estimated at current product purchase cost", icon: Boxes, href: "/operations/inventory", tone: "violet" },
    { label: "Pending deliveries", value: String(pendingDeliveries.filter((d) => ["PENDING", "DISPATCHED"].includes(d.status)).length), note: overdueDeliveries.length + " delayed", icon: Truck, href: "/operations/deliveries", tone: "amber" },
    { label: "Low / out of stock", value: lowStock.length + " / " + outOfStock.length, note: "Based on product reorder thresholds", icon: Package, href: "/operations/products", tone: outOfStock.length ? "amber" : "blue" },
  ];
  const openOrders = salesOrders.filter((order) => ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(order.status));
  const latestMovements = movements.slice(0, 10);

  return (
    <div className="owner-dashboard">
      <header className="owner-header">
        <div>
          <p className="dashboard-eyebrow">OWNER COMMAND CENTRE</p>
          <h1>Business overview</h1>
          <p className="dashboard-subtitle">A live view of sales, collections, stock and work that needs attention.</p>
        </div>
        <span className="owner-live"><span />Live database</span>
      </header>

      <section className="owner-filter-card">
        <div><strong>Reporting period</strong><p>{periodLabel}</p></div>
        <form action="/dashboard" method="get" className="owner-date-filters">
          <label><span>Period</span><select name="period" defaultValue={period}>
            <option value="TODAY">Today</option><option value="YESTERDAY">Yesterday</option>
            <option value="LAST_7_DAYS">Last 7 days</option><option value="LAST_30_DAYS">Last 30 days</option>
            <option value="THIS_MONTH">This month</option><option value="FY">This financial year</option><option value="CUSTOM">Custom range</option>
          </select></label>
          <label><span>From</span><input name="start" type="date" defaultValue={start.toISOString().slice(0, 10)} /></label>
          <label><span>To</span><input name="end" type="date" defaultValue={end.toISOString().slice(0, 10)} /></label>
          <button className="brand-button" type="submit">Apply filters</button>
        </form>
      </section>

      <section className="owner-kpis" aria-label="Executive business KPIs">
        {kpis.map((metric) => {
          const Icon = metric.icon;
          return <Link href={metric.href} className="owner-kpi card" key={metric.label}>
            <span className={"owner-kpi-icon tone-" + metric.tone}><Icon size={18} aria-hidden="true" /></span>
            <span className="owner-kpi-label">{metric.label}</span>
            <strong className="owner-kpi-value">{metric.value}</strong>
            <span className="owner-kpi-note">{metric.note}</span>
            <ArrowUpRight className="owner-kpi-arrow" size={15} aria-hidden="true" />
          </Link>;
        })}
      </section>

      <section className="owner-two-col">
        <article className="card owner-panel">
          <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">CASH & SALES TREND</p><h2>Sales vs collections</h2></div><span className="owner-panel-note">7 buckets · selected period</span></div>
          <div className="owner-trend-legend"><span><i className="owner-legend-sales" />Sales booked</span><span><i className="owner-legend-collections" />Cash collected</span></div>
          <div className="owner-trend-chart" role="img" aria-label={"Sales and customer collections by date bucket for " + periodLabel}>
            {buckets.map((bucket, index) => <div className="owner-trend-item" key={index}>
              <div className="owner-trend-bars">
                <span title={"Sales " + money(bucket.sales, currency)} className="owner-bar-sales" style={{ height: Math.max(bucket.sales ? 3 : 0, bucket.sales / maxTrend * 100) + "%" }} />
                <span title={"Collections " + money(bucket.collections, currency)} className="owner-bar-collections" style={{ height: Math.max(bucket.collections ? 3 : 0, bucket.collections / maxTrend * 100) + "%" }} />
              </div>
              <span className="owner-trend-label">{bucket.label}</span>
            </div>)}
          </div>
          <div className="owner-trend-total"><span>Sales <strong>{money(bookedSales, currency)}</strong></span><span>Collections <strong>{money(collections, currency)}</strong></span></div>
        </article>
        <article className="card owner-panel">
          <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">CUSTOMER DUES</p><h2>Receivable ageing</h2></div><Link className="dashboard-panel-link" href="/crm/invoices">Review invoices <ArrowRight size={14} /></Link></div>
          <div className="owner-ageing-list">
            {ageing.map((bucket) => <div className="owner-ageing-row" key={bucket.label}>
              <div className="owner-ageing-label"><span>{bucket.label}</span><strong>{money(bucket.value, currency)}</strong></div>
              <div className="owner-ageing-track"><span style={{ width: Math.min(100, receivablesTotal ? bucket.value / receivablesTotal * 100 : 0) + "%" }} /></div>
            </div>)}
          </div>
          <p className="owner-footnote">Ageing is calculated from invoice due dates and posted payments/allocations. Receivables are a cumulative balance, not limited to the selected sales period.</p>
        </article>
      </section>

      <section className="owner-two-col">
        <article className="card owner-panel">
          <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">ACTION CENTRE · {actionCount} ITEMS</p><h2>Needs attention</h2></div><span className="owner-panel-note">Open and upcoming work</span></div>
          <div className="owner-action-groups">
            <section><div className="owner-action-heading"><AlertCircle size={15} /><strong>Overdue customer invoices</strong><span>{overdue.length}</span></div>
              <ShowMoreList items={overdue.map((item) => ({ id: item.id, ...item }))} empty="No overdue customer balances." renderItem={(item) => <Link className="owner-action-row" href={"/crm/invoices"}><span><strong>{item.invoiceNumber} · {item.customer.name}</strong><small>Due {dateLabel(item.dueDate)} · {item.daysOverdue} days overdue</small></span><b>{money(item.balance, currency)}</b></Link>} />
            </section>
            <section><div className="owner-action-heading"><CalendarClock size={15} /><strong>Payments due soon</strong><span>{dueSoonInvoices.length}</span></div>
              <ShowMoreList items={dueSoonInvoices.map((item) => ({ id: item.id, ...item }))} empty="No upcoming invoice due dates in the next 7 days." renderItem={(item) => <Link className="owner-action-row" href="/crm/invoices"><span><strong>{item.invoiceNumber} · {item.customer.name}</strong><small>Due {dateLabel(item.dueDate)}</small></span><b>{money(item.balance, currency)}</b></Link>} />
            </section>
            <section><div className="owner-action-heading"><Users size={15} /><strong>Collection follow-ups</strong><span>{followUps.length}</span></div>
              <ShowMoreList items={followUps} empty="No open customer follow-ups due soon." renderItem={(item) => <Link className="owner-action-row" href="/operations/customer-follow-ups"><span><strong>{item.title}</strong><small>{item.customer.name} · Due {dateLabel(item.dueAt)}</small></span><ArrowRight size={15} /></Link>} />
            </section>
            <section><div className="owner-action-heading"><ClipboardList size={15} /><strong>Open tasks</strong><span>{tasks.length}</span></div>
              <ShowMoreList items={tasks} empty="No open tasks are due soon." renderItem={(item) => <Link className="owner-action-row" href="/crm/tasks"><span><strong>{item.title}</strong><small>{item.status.replaceAll("_", " ")} · {item.dueDate ? "Due " + dateLabel(item.dueDate) : "No due date"} · {item.priority}</small></span><ArrowRight size={15} /></Link>} />
            </section>
            <section><div className="owner-action-heading"><ShoppingCart size={15} /><strong>Open orders not fully delivered</strong><span>{openOrders.length}</span></div>
              <ShowMoreList items={openOrders} empty="No confirmed sales orders are awaiting delivery." renderItem={(item) => <Link className="owner-action-row" href="/operations/sales-orders"><span><strong>{item.orderNumber} · {item.customer.name}</strong><small>{item.status.replaceAll("_", " ")} · {dateLabel(item.orderDate)}</small></span><b>{money(number(item.total), currency)}</b></Link>} />
            </section>
            <section><div className="owner-action-heading"><Truck size={15} /><strong>Delayed deliveries</strong><span>{overdueDeliveries.length}</span></div>
              <ShowMoreList items={overdueDeliveries} empty="No delayed deliveries." renderItem={(item) => <Link className="owner-action-row" href="/operations/deliveries"><span><strong>{item.deliveryNumber} · {item.order.customer.name}</strong><small>{item.status} · Scheduled {item.scheduledAt ? dateLabel(item.scheduledAt) : "not set"}</small></span><ArrowRight size={15} /></Link>} />
            </section>
            <section><div className="owner-action-heading"><AlertCircle size={15} /><strong>Failed deliveries</strong><span>{failedDeliveries.length}</span></div>
              <ShowMoreList items={failedDeliveries} empty="No failed deliveries recorded." renderItem={(item) => <Link className="owner-action-row" href="/operations/deliveries"><span><strong>{item.deliveryNumber} · {item.order.customer.name}</strong><small>{item.failureReason || "Failure reason not recorded"}</small></span><ArrowRight size={15} /></Link>} />
            </section>
            <section><div className="owner-action-heading"><Package size={15} /><strong>Replenishment needed</strong><span>{lowStock.length}</span></div>
              <ShowMoreList items={lowStock} empty="All active products are above their reorder threshold." renderItem={(item) => <Link className="owner-action-row" href="/operations/products"><span><strong>{item.name} · {item.sku}</strong><small>Stock {number(item.stockOnHand)} {item.unit} · reorder at {number(item.reorderLevel)}</small></span><b>{number(item.stockOnHand) <= 0 ? "Out of stock" : "Low stock"}</b></Link>} />
            </section>
            <section><div className="owner-action-heading"><ShoppingCart size={15} /><strong>Late purchase orders</strong><span>{delayedPOs.length}</span></div>
              <ShowMoreList items={delayedPOs} empty={pendingReceiptCount ? "No late orders; " + pendingReceiptCount + " orders are awaiting partial receipts." : "No purchase orders are past their expected date."} renderItem={(item) => <Link className="owner-action-row" href="/operations/purchase-orders"><span><strong>{item.orderNumber} · {item.supplier.name}</strong><small>Expected {item.expectedAt ? dateLabel(item.expectedAt) : "date not set"}</small></span><ArrowRight size={15} /></Link>} />
            </section>
            <section><div className="owner-action-heading"><ArrowDownRight size={15} /><strong>Returns / damage / loss</strong><span>{movements.length}</span></div>
              <ShowMoreList items={latestMovements} empty="No stock return, damage or loss movements in the last 30 days." renderItem={(item) => <Link className="owner-action-row" href="/operations/inventory"><span><strong>{item.product.name} · {item.movementType.replaceAll("_", " ")}</strong><small>{number(item.quantity)} units · {dateLabel(item.createdAt)}{item.notes ? " · " + item.notes : ""}</small></span><ArrowRight size={15} /></Link>} />
            </section>
          </div>
          <p className="owner-footnote">Failed email/WhatsApp delivery alerts appear here only after a provider-backed delivery status is configured; no synthetic alerts are shown.</p>
        </article>
        <div className="owner-stacked-panels">
          <article className="card owner-panel">
            <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">PRODUCT PERFORMANCE</p><h2>Top products delivered</h2></div><Link className="dashboard-panel-link" href="/operations/products">Products <ArrowRight size={14} /></Link></div>
            {bestProducts.length ? <div className="owner-rank-list">{bestProducts.map((item, index) => <div className="owner-rank-row" key={item.id}><span className="owner-rank-index">{index + 1}</span><div><strong>{item.name}</strong><small>{item.sku} · {item.quantity} units delivered</small></div><b>{money(item.value, currency)}</b></div>)}</div> : <p className="owner-empty">Product-wise sales appear once orders have delivered items.</p>}
          </article>
          <article className="card owner-panel">
            <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">CUSTOMER PERFORMANCE</p><h2>Top customers</h2></div><Link className="dashboard-panel-link" href="/crm/customers">Customers <ArrowRight size={14} /></Link></div>
            {customerLeaders.length ? <div className="owner-rank-list">{customerLeaders.map((item, index) => <div className="owner-rank-row" key={item.id}><span className="owner-rank-index">{index + 1}</span><div><strong>{item.name}</strong><small>{item.orders} orders</small></div><b>{money(item.value, currency)}</b></div>)}</div> : <p className="owner-empty">Customer performance appears when orders are recorded in the selected period.</p>}
          </article>
          <article className="card owner-panel">
            <div className="owner-panel-heading"><div><p className="dashboard-eyebrow">STOCK EXCEPTIONS</p><h2>Recent stock issues</h2></div><Link className="dashboard-panel-link" href="/operations/inventory">Stock ledger <ArrowRight size={14} /></Link></div>
            {latestMovements.length ? <div className="owner-rank-list">{latestMovements.slice(0, 3).map((item) => <div className="owner-rank-row" key={item.id}><span className="owner-rank-index"><AlertCircle size={14} /></span><div><strong>{item.product.name}</strong><small>{item.movementType.replaceAll("_", " ")} · {dateLabel(item.createdAt)}</small></div><b>{number(item.quantity)} {item.product.unit || "units"}</b></div>)}</div> : <p className="owner-empty">No damage, loss or return movements recorded in the last 30 days.</p>}
          </article>
        </div>
      </section>

      <section className="owner-quick-actions">
        <div><p className="dashboard-eyebrow">QUICK ACTIONS</p><h2>Move business forward</h2></div>
        <div className="owner-quick-grid">
          {[
            { title: "Create order", detail: "Start a customer sale", href: "/operations/sales-orders", icon: ShoppingCart },
            { title: "Add customer", detail: "Save a customer profile", href: "/crm/customers", icon: Users },
            { title: "Record collection", detail: "Allocate a receipt", href: "/operations/customer-receipts", icon: HandCoins },
            { title: "Add purchase", detail: "Create a purchase order", href: "/operations/purchase-orders", icon: ClipboardList },
            { title: "Add product", detail: "Set prices and stock", href: "/operations/products", icon: Package },
            { title: "View reports", detail: "Explore business records", href: "/crm/reports", icon: Activity },
          ].map((action) => {
            const Icon = action.icon;
            return <Link href={action.href} className="owner-quick-link" key={action.title}><span><Icon size={17} /></span><span><strong>{action.title}</strong><small>{action.detail}</small></span><ArrowUpRight size={15} /></Link>;
          })}
        </div>
      </section>

      <div className="owner-disclaimer"><Activity size={14} /><span>Financial balances use saved invoices, posted payments, receipt allocations, and supplier bills. Gross profit and inventory valuation are estimates based on recorded cost snapshots; they are not bank-reconciled or tax statements. Selected period: {periodLabel}.</span></div>
    </div>
  );
}
