import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";

const blank = (v: unknown) => v === "" || v === null ? undefined : v;
const maybeText = z.preprocess(blank, z.string().trim().max(2000).optional());
const maybeDate = z.preprocess(blank, z.coerce.date().optional());
const hasCents = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
const hasThousandths = (value: number) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
const money = z.coerce.number().finite().min(0).max(9999999999).refine(hasCents, "Currency amounts may have at most two decimal places.");
const positiveMoney = z.coerce.number().finite().positive().max(9999999999).refine(hasCents, "Currency amounts may have at most two decimal places.");
const stockQuantity = z.coerce.number().finite().min(0).max(1000000000).refine(hasThousandths, "Stock quantities may have at most three decimal places.");
const quantity = z.coerce.number().finite().positive().max(1000000000).refine(hasThousandths, "Quantities may have at most three decimal places.");
const method = z.enum(["CASH", "BANK_TRANSFER", "CARD", "UPI", "CHEQUE", "OTHER"]);
const inventoryType = z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE", "LOSS", "SALE_RETURN", "PURCHASE_RETURN"]);
const itemInput = z.object({
  productId: z.string().uuid(),
  quantity,
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
});
const purchaseItemInput = z.object({ productId: z.string().uuid(), quantity });
const allocationInput = z.object({ invoiceId: z.string().uuid(), amount: positiveMoney });
const supplierAllocationInput = z.object({ billId: z.string().uuid(), amount: positiveMoney });

const validators = {
  products: z.object({
    sku: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(200),
    category: maybeText,
    unit: z.string().trim().min(1).max(24).optional().default("pcs"),
    description: maybeText,
    purchaseCost: money.optional().default(0),
    sellingPrice: money.optional().default(0),
    initialStock: stockQuantity.optional().default(0),
    reorderLevel: stockQuantity.optional().default(0),
  }).strict(),
  suppliers: z.object({
    name: z.string().trim().min(1).max(160),
    company: maybeText,
    email: z.preprocess(blank, z.string().trim().email().max(320).optional()),
    phone: maybeText,
    address: maybeText,
    taxId: maybeText,
    paymentTermsDays: z.coerce.number().int().min(0).max(365).optional().default(0),
  }).strict(),
  "sales-orders": z.object({
    customerId: z.string().uuid(),
    orderDate: maybeDate,
    expectedDeliveryAt: maybeDate,
    notes: maybeText,
    status: z.enum(["DRAFT", "CONFIRMED"]).optional().default("DRAFT"),
    idempotencyKey: z.string().trim().min(8).max(160),
    items: z.array(itemInput).min(1).max(100),
  }).strict(),
  "purchase-orders": z.object({
    supplierId: z.string().uuid(),
    orderDate: maybeDate,
    expectedAt: maybeDate,
    notes: maybeText,
    idempotencyKey: z.string().trim().min(8).max(160),
    items: z.array(purchaseItemInput).min(1).max(100),
  }).strict(),
  "goods-receipts": z.object({
    purchaseOrderId: z.string().uuid(),
    receivedAt: maybeDate,
    notes: maybeText,
    idempotencyKey: z.string().trim().min(8).max(160),
    items: z.array(z.object({ purchaseOrderItemId: z.string().uuid(), quantity, unitCost: money.optional() })).min(1).max(100),
  }).strict(),
  deliveries: z.object({
    orderId: z.string().uuid(),
    scheduledAt: maybeDate,
    assignedUserId: z.preprocess(blank, z.string().uuid().optional()),
    idempotencyKey: z.string().trim().min(8).max(160),
    items: z.array(z.object({ orderItemId: z.string().uuid(), quantity })).min(1).max(100),
  }).strict(),
  "customer-receipts": z.object({
    customerId: z.string().uuid(),
    amount: positiveMoney,
    method,
    reference: maybeText,
    receivedAt: maybeDate,
    notes: maybeText,
    idempotencyKey: z.string().trim().min(8).max(160),
    allocations: z.array(allocationInput).max(100).optional().default([]),
  }).strict(),
  "supplier-bills": z.object({
    supplierId: z.string().uuid(),
    purchaseOrderId: z.preprocess(blank, z.string().uuid().optional()),
    billNumber: z.string().trim().min(1).max(60),
    issueDate: maybeDate,
    dueDate: z.coerce.date(),
    total: positiveMoney,
    notes: maybeText,
  }).strict(),
  "supplier-payments": z.object({
    supplierId: z.string().uuid(),
    amount: positiveMoney,
    method,
    reference: maybeText,
    paidAt: maybeDate,
    notes: maybeText,
    idempotencyKey: z.string().trim().min(8).max(160),
    allocations: z.array(supplierAllocationInput).max(100).optional().default([]),
  }).strict(),
  inventory: z.object({
    productId: z.string().uuid(),
    movementType: inventoryType,
    quantity,
    unitCost: money.optional().default(0),
    notes: maybeText,
    idempotencyKey: z.string().trim().min(8).max(160),
  }).strict(),
  "customer-follow-ups": z.object({
    customerId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    dueAt: z.coerce.date(),
    channel: maybeText,
    notes: maybeText,
    assignedUserId: z.preprocess(blank, z.string().uuid().optional()),
    idempotencyKey: z.string().trim().min(8).max(160),
  }).strict(),
  permissions: z.object({
    role: z.enum(["STAFF", "SALES", "DELIVERY", "COLLECTIONS", "INVENTORY_MANAGER", "ACCOUNTANT"]),
    moduleKey: z.string().trim().min(1).max(48),
    actionKey: z.enum(["read", "create", "update", "delete", "manage"]),
    granted: z.boolean(),
  }).strict(),
};

function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function serialise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === "object") {
    const v = value as { toNumber?: () => number; toFixed?: (digits?: number) => string };
    if (typeof v.toNumber === "function" && typeof v.toFixed === "function") return v.toNumber();
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serialise(nested)]));
  }
  return value;
}
function fail(message: string, status = 400) { return Response.json({ error: { message } }, { status }); }
function number(value: unknown) { return Number(value ?? 0); }

async function rowsFor(resource: string, tenantId: string) {
  switch (resource) {
    case "products":
      return db.product.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 300 });
    case "suppliers":
      return db.supplier.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 300 });
    case "sales-orders":
      return db.salesOrder.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 300, include: {
        customer: { select: { id: true, name: true, company: true } },
        items: { include: { product: { select: { id: true, sku: true, name: true } } } },
        deliveries: { select: { id: true, deliveryNumber: true, status: true } },
        invoices: { select: { id: true, invoiceNumber: true, status: true, total: true } },
      } });
    case "purchase-orders":
      return db.purchaseOrder.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 300, include: {
        supplier: { select: { id: true, name: true, company: true } },
        items: { include: { product: { select: { id: true, sku: true, name: true } } } },
        receipts: { select: { id: true, receiptNumber: true, status: true, receivedAt: true } },
      } });
    case "goods-receipts":
      return db.goodsReceipt.findMany({ where: { tenantId }, orderBy: { receivedAt: "desc" }, take: 300, include: {
        purchaseOrder: { select: { orderNumber: true, supplier: { select: { name: true } } } },
        items: { include: { product: { select: { sku: true, name: true } } } },
      } });
    case "deliveries":
      return db.delivery.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 300, include: {
        order: { select: { orderNumber: true, customer: { select: { name: true } } } },
        assignedUser: { select: { name: true, email: true } },
        items: { include: { product: { select: { sku: true, name: true } } } },
      } });
    case "customer-receipts":
      return db.customerReceipt.findMany({ where: { tenantId }, orderBy: { receivedAt: "desc" }, take: 300, include: {
        customer: { select: { name: true } },
        allocations: { include: { invoice: { select: { invoiceNumber: true } } } },
      } });
    case "supplier-bills":
      return db.supplierBill.findMany({ where: { tenantId }, orderBy: { dueDate: "asc" }, take: 300, include: {
        supplier: { select: { name: true } },
        allocations: { include: { payment: { select: { amount: true, status: true } } } },
      } });
    case "supplier-payments":
      return db.supplierPayment.findMany({ where: { tenantId }, orderBy: { paidAt: "desc" }, take: 300, include: {
        supplier: { select: { name: true } },
        allocations: { include: { bill: { select: { billNumber: true } } } },
      } });
    case "inventory":
      return db.inventoryMovement.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 300, include: {
        product: { select: { sku: true, name: true } },
      } });
    case "customer-follow-ups":
      return db.customerFollowUp.findMany({ where: { tenantId }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 300, include: {
        customer: { select: { name: true } },
      } });
    case "ledger":
      return db.ledgerEntry.findMany({ where: { tenantId }, orderBy: { postedAt: "desc" }, take: 300, include: {
        customer: { select: { name: true } }, supplier: { select: { name: true } },
      } });
    case "permissions":
      return db.rolePermission.findMany({ where: { tenantId }, orderBy: [{ role: "asc" }, { moduleKey: "asc" }, { actionKey: "asc" }], take: 500 });
    default: return null;
  }
}

function nextNumber(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const timestamp = Date.now().toString(36).toUpperCase();
  return prefix + "-" + date + "-" + timestamp + "-" + crypto.randomUUID().slice(0, 4).toUpperCase();
}

async function audit(tx: Prisma.TransactionClient, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await tx.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata: JSON.parse(JSON.stringify(metadata)) },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ resource: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  const { resource } = await context.params;
  const allowed = await requireWorkspacePermission(access, resource, "read");
  if (!allowed.ok) return fail(allowed.message, allowed.status);
  try {
    const rows = await rowsFor(resource, access.tenantId);
    if (rows === null) return fail("Unknown operations module.", 404);
    return Response.json({ data: serialise(rows) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    console.error("Operations list failed:", resource, code || "UNKNOWN");
    return fail("Could not load this module. Check that the business operations migration is applied.", 503);
  }
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  const { resource } = await context.params;
  const allowed = await requireWorkspacePermission(access, resource, "create");
  if (!allowed.ok) return fail(allowed.message, allowed.status);
  const validator = validators[resource as keyof typeof validators];
  if (!validator) return fail("Unknown operations module.", 404);
  const parsed = validator.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Please check the submitted fields.");
  const tenantId = access.tenantId;
  const actorId = access.user.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `validator` is selected by `resource`; Zod has already validated this resource-specific object.
  const data = parsed.data as Record<string, any>;

  try {
    if (resource === "products") {
      const existing = await db.product.findUnique({ where: { tenantId_sku: { tenantId, sku: data.sku.trim().toUpperCase() } } });
      if (existing) return fail("A product with this SKU already exists in your workspace.", 409);
      const product = await db.$transaction(async (tx) => {
        const created = await tx.product.create({ data: {
          tenantId, sku: data.sku.trim().toUpperCase(), name: data.name, category: data.category ?? null,
          unit: data.unit, description: data.description ?? null, purchaseCost: data.purchaseCost,
          sellingPrice: data.sellingPrice, stockOnHand: data.initialStock, reorderLevel: data.reorderLevel,
        } });
        if (data.initialStock > 0) {
          await tx.inventoryMovement.create({ data: {
            tenantId, productId: created.id, movementType: "OPENING_STOCK",
            quantity: data.initialStock, unitCost: data.purchaseCost, referenceType: "PRODUCT",
            referenceId: created.id, createdByUserId: actorId, notes: "Initial stock at product creation.",
          } });
        }
        await audit(tx, actorId, "PRODUCT_CREATED", "Product", created.id, { sku: created.sku, initialStock: data.initialStock });
        return created;
      });
      return Response.json({ data: serialise(product) }, { status: 201 });
    }

    if (resource === "suppliers") {
      const supplier = await db.supplier.create({ data: {
        tenantId, name: data.name, company: data.company ?? null, email: data.email?.toLowerCase() ?? null,
        phone: data.phone ?? null, address: data.address ?? null, taxId: data.taxId ?? null, paymentTermsDays: data.paymentTermsDays,
      } });
      await db.auditLog.create({ data: { actorUserId: actorId, action: "SUPPLIER_CREATED", entityType: "Supplier", entityId: supplier.id } });
      return Response.json({ data: serialise(supplier) }, { status: 201 });
    }

    if (resource === "sales-orders") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.salesOrder.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, order: existing };
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId, status: "ACTIVE" } });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        const salesItems = data.items as Array<{ productId: string; quantity: number; discountPercent: number; taxPercent: number }>;
        const productIds: string[] = Array.from(new Set<string>(salesItems.map((item) => item.productId)));
        const products = await tx.product.findMany({ where: { tenantId, id: { in: productIds }, status: "ACTIVE" } });
        if (products.length !== productIds.length) throw new Error("PRODUCT_NOT_FOUND");
        const byId = new Map(products.map((product) => [product.id, product]));
        const prepared: Array<{ product: (typeof products)[number]; quantity: number; gross: number; discount: number; tax: number; total: number }> = salesItems.map((item) => {
          const product = byId.get(item.productId)!;
          const gross = round2(item.quantity * number(product.sellingPrice));
          const discount = round2(gross * item.discountPercent / 100);
          const tax = round2((gross - discount) * item.taxPercent / 100);
          return { product, quantity: item.quantity, gross, discount, tax, total: round2(gross - discount + tax) };
        });
        const subtotal = round2(prepared.reduce((sum, item) => sum + item.gross, 0));
        const discountAmount = round2(prepared.reduce((sum, item) => sum + item.discount, 0));
        const taxAmount = round2(prepared.reduce((sum, item) => sum + item.tax, 0));
        const total = round2(subtotal - discountAmount + taxAmount);
        const order = await tx.salesOrder.create({ data: {
          tenantId, customerId: customer.id, orderNumber: nextNumber("SO"),
          status: data.status, orderDate: data.orderDate ?? new Date(), expectedDeliveryAt: data.expectedDeliveryAt ?? null,
          subtotal, discountAmount, taxAmount, total, notes: data.notes ?? null, idempotencyKey: data.idempotencyKey, createdByUserId: actorId,
          items: { create: prepared.map((item) => ({
            productId: item.product.id, description: item.product.name, quantity: item.quantity,
            unitPrice: item.product.sellingPrice, unitCost: item.product.purchaseCost, discountAmount: item.discount,
            taxAmount: item.tax, lineTotal: item.total,
          })) },
        }, include: { items: true, customer: { select: { name: true } } } });
        await audit(tx, actorId, "SALES_ORDER_CREATED", "SalesOrder", order.id, { orderNumber: order.orderNumber, total, status: order.status });
        return { existing: false, order };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.order), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "purchase-orders") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.purchaseOrder.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, order: existing };
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, tenantId, status: "ACTIVE" } });
        if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
        const purchaseItems = data.items as Array<{ productId: string; quantity: number }>;
        const productIds: string[] = Array.from(new Set<string>(purchaseItems.map((item) => item.productId)));
        const products = await tx.product.findMany({ where: { tenantId, id: { in: productIds }, status: "ACTIVE" } });
        if (products.length !== productIds.length) throw new Error("PRODUCT_NOT_FOUND");
        const byId = new Map(products.map((product) => [product.id, product]));
        const prepared: Array<{ product: (typeof products)[number]; quantity: number; total: number }> = purchaseItems.map((item) => {
          const product = byId.get(item.productId)!;
          return { product, quantity: item.quantity, total: round2(item.quantity * number(product.purchaseCost)) };
        });
        const subtotal = round2(prepared.reduce((sum, item) => sum + item.total, 0));
        const order = await tx.purchaseOrder.create({ data: {
          tenantId, supplierId: supplier.id, orderNumber: nextNumber("PO"),
          orderDate: data.orderDate ?? new Date(), expectedAt: data.expectedAt ?? null,
          subtotal, taxAmount: 0, total: subtotal, notes: data.notes ?? null, idempotencyKey: data.idempotencyKey, createdByUserId: actorId,
          status: "ORDERED",
          items: { create: prepared.map((item) => ({
            productId: item.product.id, quantity: item.quantity, unitCost: item.product.purchaseCost, lineTotal: item.total,
          })) },
        }, include: { items: true, supplier: { select: { name: true } } } });
        await audit(tx, actorId, "PURCHASE_ORDER_CREATED", "PurchaseOrder", order.id, { orderNumber: order.orderNumber, total: subtotal });
        return { existing: false, order };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.order), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "goods-receipts") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.goodsReceipt.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, receipt: existing };
        const order = await tx.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, tenantId }, include: { items: true } });
        if (!order || ["CANCELLED", "RECEIVED"].includes(order.status)) throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");
        const poItems = new Map(order.items.map((item) => [item.id, item]));
        const receiptLines: Array<{item: typeof order.items[number]; quantity: number; unitCost: number}> = [];
        for (const line of data.items) {
          const item = poItems.get(line.purchaseOrderItemId);
          if (!item) throw new Error("PO_ITEM_NOT_FOUND");
          const receivedAfter = number(item.receivedQuantity) + line.quantity;
          if (receivedAfter > number(item.quantity) + 0.000001) throw new Error("RECEIPT_EXCEEDS_ORDERED");
          receiptLines.push({ item, quantity: line.quantity, unitCost: line.unitCost ?? number(item.unitCost) });
        }
        const receipt = await tx.goodsReceipt.create({ data: {
          tenantId, purchaseOrderId: order.id, receiptNumber: nextNumber("GR"),
          receivedAt: data.receivedAt ?? new Date(), notes: data.notes ?? null, idempotencyKey: data.idempotencyKey,
          createdByUserId: actorId, status: "POSTED",
          items: { create: receiptLines.map((line) => ({
            purchaseOrderItemId: line.item.id, productId: line.item.productId, quantity: line.quantity, unitCost: line.unitCost,
          })) },
        }, include: { items: true } });
        const businessSettings = await tx.businessSettings.findUnique({
          where: { tenantId }, select: { inventoryCostingMethod: true },
        });
        for (const line of receiptLines) {
          const update = await tx.purchaseOrderItem.updateMany({
            where: { id: line.item.id, receivedQuantity: { lte: number(line.item.quantity) - line.quantity } },
            data: { receivedQuantity: { increment: line.quantity } },
          });
          if (!update.count) throw new Error("RECEIPT_EXCEEDS_ORDERED");
          const product = await tx.product.findFirst({
            where: { id: line.item.productId, tenantId },
            select: { stockOnHand: true, purchaseCost: true },
          });
          if (!product) throw new Error("PRODUCT_NOT_FOUND");
          const oldStock = number(product.stockOnHand);
          const newStock = oldStock + line.quantity;
          const weightedAverageCost = newStock > 0
            ? round2((oldStock * number(product.purchaseCost) + line.quantity * line.unitCost) / newStock)
            : line.unitCost;
          const configuredMethod = businessSettings?.inventoryCostingMethod || "WEIGHTED_AVERAGE";
          const newUnitCost = configuredMethod === "WEIGHTED_AVERAGE" ? weightedAverageCost : line.unitCost;
          await tx.product.update({
            where: { id: line.item.productId },
            data: { stockOnHand: { increment: line.quantity }, purchaseCost: newUnitCost },
          });
          await tx.inventoryMovement.create({ data: {
            tenantId, productId: line.item.productId, movementType: "PURCHASE_RECEIPT",
            quantity: line.quantity, unitCost: line.unitCost, referenceType: "GOODS_RECEIPT",
            referenceId: receipt.id, idempotencyKey: "receipt-" + receipt.id + "-" + line.item.id,
            createdByUserId: actorId, notes: "Stock received against purchase order " + order.orderNumber,
          } });
        }
        const updatedItems = await tx.purchaseOrderItem.findMany({ where: { orderId: order.id } });
        const complete = updatedItems.every((item) => number(item.receivedQuantity) >= number(item.quantity) - 0.000001);
        const anyReceived = updatedItems.some((item) => number(item.receivedQuantity) > 0);
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED" } });
        await audit(tx, actorId, "GOODS_RECEIPT_POSTED", "GoodsReceipt", receipt.id, { orderNumber: order.orderNumber, lineCount: receiptLines.length });
        return { existing: false, receipt };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.receipt), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "deliveries") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.delivery.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, delivery: existing };
        const order = await tx.salesOrder.findFirst({ where: { id: data.orderId, tenantId, status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } }, include: { items: { include: { deliveryItems: { include: { delivery: { select: { status: true } } } } } } } });
        if (!order) throw new Error("ORDER_NOT_DELIVERABLE");
        if (data.assignedUserId) {
          const assignee = await tx.user.findFirst({ where: { id: data.assignedUserId, tenantId, isActive: true }, select: { id: true } });
          if (!assignee) throw new Error("ASSIGNEE_NOT_FOUND");
        }
        const orderItems = new Map(order.items.map((item) => [item.id, item]));
        for (const line of data.items) {
          const item = orderItems.get(line.orderItemId);
          if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
          const pending = item.deliveryItems.filter((entry) => !["DELIVERED", "CANCELLED", "FAILED"].includes(entry.delivery.status)).reduce((sum, entry) => sum + number(entry.quantity), 0);
          if (number(item.deliveredQuantity) + pending + line.quantity > number(item.quantity) + 0.000001) throw new Error("DELIVERY_EXCEEDS_ORDERED");
        }
        const delivery = await tx.delivery.create({ data: {
          tenantId, orderId: order.id, deliveryNumber: nextNumber("DO"),
          scheduledAt: data.scheduledAt ?? null, assignedUserId: data.assignedUserId ?? null,
          idempotencyKey: data.idempotencyKey, createdByUserId: actorId, status: "PENDING",
          items: { create: data.items.map((line: {orderItemId: string;quantity: number}) => {
            const orderItem = orderItems.get(line.orderItemId)!;
            return { orderItemId: orderItem.id, productId: orderItem.productId, quantity: line.quantity };
          }) },
        }, include: { items: true } });
        await audit(tx, actorId, "DELIVERY_CREATED", "Delivery", delivery.id, { orderNumber: order.orderNumber });
        return { existing: false, delivery };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.delivery), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "customer-receipts") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.customerReceipt.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, receipt: existing };
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId } });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        const allocationTotal = round2(data.allocations.reduce((sum: number, allocation: {amount: number}) => sum + allocation.amount, 0));
        if (allocationTotal > data.amount + 0.005) throw new Error("ALLOCATIONS_EXCEED_RECEIPT");
        const duplicateInvoices = new Set(data.allocations.map((item: {invoiceId: string}) => item.invoiceId));
        if (duplicateInvoices.size !== data.allocations.length) throw new Error("DUPLICATE_ALLOCATION");
        for (const allocation of data.allocations) {
          const invoice = await tx.invoice.findFirst({
            where: { id: allocation.invoiceId, tenantId, customerId: customer.id, status: { not: "CANCELLED" } },
            include: { payments: { select: { amount: true, status: true } }, receiptAllocations: { include: { receipt: { select: { amount: true, status: true } } } } },
          });
          if (!invoice) throw new Error("INVOICE_NOT_FOUND");
          const legacyPaid = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + number(payment.amount), 0);
          const receiptsPaid = invoice.receiptAllocations.filter((entry) => entry.receipt.status === "POSTED").reduce((sum, entry) => sum + number(entry.amount), 0);
          const balance = Math.max(0, number(invoice.total) - legacyPaid - receiptsPaid);
          if (allocation.amount > balance + 0.005) throw new Error("ALLOCATION_EXCEEDS_BALANCE");
        }
        const receipt = await tx.customerReceipt.create({ data: {
          tenantId, customerId: customer.id, receiptNumber: nextNumber("CR"),
          amount: data.amount, method: data.method, reference: data.reference ?? null, receivedAt: data.receivedAt ?? new Date(),
          status: "POSTED", notes: data.notes ?? null, idempotencyKey: data.idempotencyKey, createdByUserId: actorId,
          allocations: { create: data.allocations.map((entry: {invoiceId: string;amount: number}) => ({ invoiceId: entry.invoiceId, amount: entry.amount })) },
        }, include: { allocations: true } });
        for (const allocation of data.allocations) {
          const invoice = await tx.invoice.findFirst({
            where: { id: allocation.invoiceId, tenantId, customerId: customer.id, status: { not: "CANCELLED" } },
            include: { payments: { select: { amount: true, status: true } }, receiptAllocations: { include: { receipt: { select: { status: true } } } } },
          });
          if (!invoice) throw new Error("INVOICE_NOT_FOUND");
          const legacyPaid = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + number(payment.amount), 0);
          const receiptsPaid = invoice.receiptAllocations.filter((entry) => entry.receipt.status === "POSTED").reduce((sum, entry) => sum + number(entry.amount), 0);
          const paidAfter = legacyPaid + receiptsPaid;
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: paidAfter + 0.005 >= number(invoice.total) ? "PAID" : "PARTIALLY_PAID" } });
        }
        await tx.ledgerEntry.create({ data: {
          tenantId, customerId: customer.id, entryType: "CUSTOMER_RECEIPT",
          referenceType: "CUSTOMER_RECEIPT", referenceId: receipt.id,
          description: "Customer receipt " + receipt.receiptNumber,
          debit: 0, credit: receipt.amount, idempotencyKey: "receipt-" + receipt.id, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "CUSTOMER_RECEIPT_POSTED", "CustomerReceipt", receipt.id, { amount: data.amount, allocationTotal });
        return { existing: false, receipt };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.receipt), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "supplier-bills") {
      const result = await db.$transaction(async (tx) => {
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, tenantId } });
        if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
        if (data.purchaseOrderId) {
          const order = await tx.purchaseOrder.findFirst({ where: { id: data.purchaseOrderId, tenantId, supplierId: supplier.id } });
          if (!order) throw new Error("PURCHASE_ORDER_SUPPLIER_MISMATCH");
        }
        const bill = await tx.supplierBill.create({ data: {
          tenantId, supplierId: supplier.id, purchaseOrderId: data.purchaseOrderId ?? null, billNumber: data.billNumber,
          issueDate: data.issueDate ?? new Date(), dueDate: data.dueDate, total: data.total, notes: data.notes ?? null, createdByUserId: actorId,
        } });
        await tx.ledgerEntry.create({ data: {
          tenantId, supplierId: supplier.id, entryType: "SUPPLIER_BILL",
          referenceType: "SUPPLIER_BILL", referenceId: bill.id,
          description: "Supplier bill " + bill.billNumber,
          debit: 0, credit: bill.total, idempotencyKey: "supplier-bill-" + bill.id, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "SUPPLIER_BILL_CREATED", "SupplierBill", bill.id, { billNumber: bill.billNumber, total: data.total });
        return bill;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result) }, { status: 201 });
    }

    if (resource === "supplier-payments") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.supplierPayment.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, payment: existing };
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, tenantId } });
        if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
        const allocated = round2(data.allocations.reduce((sum: number, entry: {amount: number}) => sum + entry.amount, 0));
        if (allocated > data.amount + 0.005) throw new Error("ALLOCATIONS_EXCEED_PAYMENT");
        const billIds = [...new Set(data.allocations.map((entry: {billId: string}) => entry.billId))];
        if (billIds.length !== data.allocations.length) throw new Error("DUPLICATE_ALLOCATION");
        for (const allocation of data.allocations) {
          const bill = await tx.supplierBill.findFirst({ where: { id: allocation.billId, tenantId, supplierId: supplier.id } });
          if (!bill) throw new Error("BILL_NOT_FOUND");
          const entries = await tx.supplierPaymentAllocation.findMany({ where: { billId: bill.id, payment: { status: "POSTED" } }, select: { amount: true } });
          const paid = entries.reduce((sum, entry) => sum + number(entry.amount), 0);
          if (allocation.amount > number(bill.total) - paid + 0.005) throw new Error("ALLOCATION_EXCEEDS_BALANCE");
        }
        const payment = await tx.supplierPayment.create({ data: {
          tenantId, supplierId: supplier.id, amount: data.amount, method: data.method,
          reference: data.reference ?? null, paidAt: data.paidAt ?? new Date(), notes: data.notes ?? null,
          status: "POSTED", idempotencyKey: data.idempotencyKey, createdByUserId: actorId,
          allocations: { create: data.allocations.map((entry: {billId: string;amount: number}) => ({ billId: entry.billId, amount: entry.amount })) },
        } });
        for (const allocation of data.allocations) {
          const bill = await tx.supplierBill.findFirst({
            where: { id: allocation.billId, tenantId, supplierId: supplier.id },
            include: { allocations: { include: { payment: { select: { status: true } } } } },
          });
          if (!bill) throw new Error("BILL_NOT_FOUND");
          const paidAfter = bill.allocations.filter((entry) => entry.payment.status === "POSTED").reduce((sum, entry) => sum + number(entry.amount), 0);
          await tx.supplierBill.update({ where: { id: bill.id }, data: { status: paidAfter + 0.005 >= number(bill.total) ? "PAID" : "PARTIALLY_PAID" } });
        }
        await tx.ledgerEntry.create({ data: {
          tenantId, supplierId: supplier.id, entryType: "SUPPLIER_PAYMENT",
          referenceType: "SUPPLIER_PAYMENT", referenceId: payment.id,
          description: "Supplier payment " + payment.id,
          debit: payment.amount, credit: 0, idempotencyKey: "supplier-payment-" + payment.id, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "SUPPLIER_PAYMENT_POSTED", "SupplierPayment", payment.id, { amount: data.amount, allocated });
        return { existing: false, payment };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.payment), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "inventory") {
      const result = await db.$transaction(async (tx) => {
        const duplicate = await tx.inventoryMovement.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (duplicate) return { existing: true, movement: duplicate };
        const product = await tx.product.findFirst({ where: { id: data.productId, tenantId } });
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        const isIncrease = data.movementType === "ADJUSTMENT_IN" || data.movementType === "SALE_RETURN";
        const update = await tx.product.updateMany({
          where: { id: product.id, tenantId, ...(isIncrease ? {} : { stockOnHand: { gte: data.quantity } }) },
          data: { stockOnHand: isIncrease ? { increment: data.quantity } : { decrement: data.quantity } },
        });
        if (!update.count) throw new Error("INSUFFICIENT_STOCK");
        const movement = await tx.inventoryMovement.create({ data: {
          tenantId, productId: product.id, movementType: data.movementType, quantity: data.quantity,
          unitCost: data.unitCost, referenceType: "MANUAL_ADJUSTMENT", referenceId: product.id,
          idempotencyKey: data.idempotencyKey, notes: data.notes ?? null, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "INVENTORY_ADJUSTMENT_POSTED", "InventoryMovement", movement.id, { sku: product.sku, movementType: data.movementType, quantity: data.quantity });
        return { existing: false, movement };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.movement), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "customer-follow-ups") {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.customerFollowUp.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return { existing: true, followUp: existing };
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId } });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        if (data.assignedUserId) {
          const assignee = await tx.user.findFirst({ where: { id: data.assignedUserId, tenantId, isActive: true }, select: { id: true } });
          if (!assignee) throw new Error("ASSIGNEE_NOT_FOUND");
        }
        const followUp = await tx.customerFollowUp.create({
          data: {
            tenantId, customerId: customer.id, title: data.title, dueAt: data.dueAt,
            channel: data.channel ?? null, notes: data.notes ?? null, assignedUserId: data.assignedUserId ?? null,
            idempotencyKey: data.idempotencyKey, createdByUserId: actorId,
          },
        });
        await audit(tx, actorId, "FOLLOW_UP_CREATED", "CustomerFollowUp", followUp.id, { customerId: customer.id });
        return { existing: false, followUp };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ data: serialise(result.followUp), idempotentReplay: result.existing }, { status: result.existing ? 200 : 201 });
    }

    if (resource === "permissions") {
      if (!["TENANT_ADMIN", "PLATFORM_ADMIN"].includes(access.user.role)) return fail("Only the business owner can change team permissions.", 403);
      const permissionSchema = z.object({
        role: z.enum(["STAFF", "SALES", "DELIVERY", "COLLECTIONS", "INVENTORY_MANAGER", "ACCOUNTANT"]),
        moduleKey: z.string().trim().min(1).max(48),
        actionKey: z.enum(["read", "create", "update", "delete", "manage"]),
        granted: z.boolean(),
      }).strict();
      const permission = permissionSchema.safeParse(data);
      if (!permission.success) return fail(permission.error.issues[0]?.message || "Invalid permission.");
      const saved = await db.rolePermission.upsert({
        where: { tenantId_role_moduleKey_actionKey: {
          tenantId, role: permission.data.role, moduleKey: permission.data.moduleKey, actionKey: permission.data.actionKey,
        } },
        create: { tenantId, ...permission.data, updatedByUserId: actorId },
        update: { granted: permission.data.granted, updatedByUserId: actorId },
      });
      await db.auditLog.create({ data: { actorUserId: actorId, action: "ROLE_PERMISSION_UPDATED", entityType: "RolePermission", entityId: saved.id, metadata: { role: saved.role, moduleKey: saved.moduleKey, actionKey: saved.actionKey, granted: saved.granted } } });
      return Response.json({ data: serialise(saved) }, { status: 200 });
    }

    return fail("Unknown operations module.", 404);
  } catch (error) {
    const message = (error as Error)?.message || "";
    const statusMap: Record<string, [number, string]> = {
      CUSTOMER_NOT_FOUND: [404, "Customer not found in this workspace."],
      PRODUCT_NOT_FOUND: [400, "One or more products do not belong to this workspace or are inactive."],
      SUPPLIER_NOT_FOUND: [404, "Supplier not found in this workspace."],
      PURCHASE_ORDER_NOT_RECEIVABLE: [409, "This purchase order cannot receive additional stock."],
      PO_ITEM_NOT_FOUND: [400, "A receipt item does not belong to the selected purchase order."],
      RECEIPT_EXCEEDS_ORDERED: [409, "Received quantity would exceed the ordered quantity."],
      ORDER_NOT_DELIVERABLE: [409, "Only confirmed or partially delivered orders can be dispatched."],
      ASSIGNEE_NOT_FOUND: [400, "Choose an active team member from this workspace."],
      ORDER_ITEM_NOT_FOUND: [400, "A delivery item does not belong to the selected order."],
      DELIVERY_EXCEEDS_ORDERED: [409, "Delivered plus pending quantity would exceed the order quantity."],
      INVOICE_NOT_FOUND: [404, "An allocated invoice was not found for this customer."],
      ALLOCATIONS_EXCEED_RECEIPT: [400, "Invoice allocations cannot exceed the actual receipt amount."],
      DUPLICATE_ALLOCATION: [400, "Use a single allocation per invoice or bill."],
      ALLOCATION_EXCEEDS_BALANCE: [409, "An allocation exceeds the outstanding invoice or bill balance."],
      ALLOCATIONS_EXCEED_PAYMENT: [400, "Bill allocations cannot exceed the supplier payment amount."],
      BILL_NOT_FOUND: [404, "Supplier bill not found for this supplier."],
      PURCHASE_ORDER_SUPPLIER_MISMATCH: [400, "Purchase order must belong to the selected supplier and workspace."],
      INSUFFICIENT_STOCK: [409, "Insufficient stock for this inventory adjustment."],
    };
    if (statusMap[message]) return fail(statusMap[message][1], statusMap[message][0]);
    if ((error as { code?: string }).code === "P2002") return fail("A duplicate record or idempotency key was submitted.", 409);
    if ((error as { code?: string }).code === "P2034") return fail("This transaction conflicted with another update. Refresh and retry the same operation with the same idempotency key.", 409);
    console.error("Operations write failed:", resource, (error as {code?: string}).code || "UNKNOWN", message.slice(0, 180));
    return fail("Could not save this business operation. No partial transaction was committed.", 500);
  }
}
