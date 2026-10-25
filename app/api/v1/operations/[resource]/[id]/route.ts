import { z } from "zod";
import { isSameOriginRequest } from "@/lib/security/http";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireWorkspaceAccess, writeAuditEvent } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { customerCreditExposure } from "@/lib/operations/credit";
import { invoiceStatusFromBalance } from "@/lib/operations/finance";
import { addressText, detailField, detailSection, type RecordDetail } from "@/lib/record-details/types";

function fail(message: string, status = 400) { return Response.json({ error: { message } }, { status }); }
function n(value: unknown) { return Number(value ?? 0); }

async function audit(tx: Prisma.TransactionClient, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await tx.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata: JSON.parse(JSON.stringify(metadata)) },
  });
}

function serializeOperationDetail(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeOperationDetail);
  if (value && typeof value === "object") {
    const candidate = value as { toNumber?: () => number; toFixed?: (digits?: number) => string };
    if (typeof candidate.toNumber === "function" && typeof candidate.toFixed === "function") return candidate.toNumber();
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["id", "tenantId", "tenant", "idempotencyKey", "passwordHash", "referenceId"].includes(key) && !key.endsWith("Id"))
      .map(([key, nested]) => [key, serializeOperationDetail(nested)]));
  }
  return value;
}

async function operationRecordForDetail(resource: string, id: string, tenantId: string): Promise<unknown | null> {
  switch (resource) {
    case "products":
      return db.product.findFirst({ where: { id, tenantId } });
    case "suppliers":
      return db.supplier.findFirst({
        where: { id, tenantId },
        include: {
          purchaseOrders: { where: { tenantId }, orderBy: { orderDate: "desc" }, take: 10, select: { orderNumber: true, orderDate: true, total: true, status: true } },
          bills: { where: { tenantId }, orderBy: { issueDate: "desc" }, take: 10, select: { billNumber: true, dueDate: true, total: true, status: true } },
        },
      });
    case "sales-orders":
      return db.salesOrder.findFirst({
        where: { id, tenantId },
        include: {
          customer: { select: { name: true, company: true, email: true, phone: true } },
          items: { orderBy: { createdAt: "asc" }, include: { product: { select: { name: true, sku: true, unit: true } } } },
          deliveries: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10, select: { deliveryNumber: true, status: true, scheduledAt: true, completedAt: true } },
          invoices: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10, select: { invoiceNumber: true, status: true, total: true, dueDate: true } },
        },
      });
    case "purchase-orders":
      return db.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          supplier: { select: { name: true, company: true, email: true, phone: true } },
          items: { orderBy: { createdAt: "asc" }, include: { product: { select: { name: true, sku: true, unit: true } } } },
          receipts: { where: { tenantId }, orderBy: { receivedAt: "desc" }, take: 10, select: { receiptNumber: true, status: true, receivedAt: true } },
          bills: { where: { tenantId }, orderBy: { issueDate: "desc" }, take: 10, select: { billNumber: true, status: true, total: true, dueDate: true } },
        },
      });
    case "goods-receipts":
      return db.goodsReceipt.findFirst({
        where: { id, tenantId },
        include: {
          purchaseOrder: { select: { orderNumber: true, supplier: { select: { name: true, company: true } } } },
          items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
        },
      });
    case "deliveries":
      return db.delivery.findFirst({
        where: { id, tenantId },
        include: {
          order: { select: { orderNumber: true, status: true, customer: { select: { name: true, company: true } } } },
          assignedUser: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
        },
      });
    case "customer-receipts":
      return db.customerReceipt.findFirst({
        where: { id, tenantId },
        include: {
          customer: { select: { name: true, company: true, email: true, phone: true, addresses: true } },
          allocations: { where: { invoice: { tenantId } }, include: { invoice: { select: { invoiceNumber: true, status: true, total: true, dueDate: true } } } },
        },
      });
    case "supplier-bills":
      return db.supplierBill.findFirst({
        where: { id, tenantId },
        include: {
          supplier: { select: { name: true, company: true, email: true, phone: true, address: true, taxId: true } },
          purchaseOrder: { select: { orderNumber: true, items: { include: { product: { select: { name: true, sku: true, unit: true } } } } } },
          allocations: { where: { payment: { tenantId } }, include: { payment: { select: { amount: true, method: true, reference: true, paidAt: true, status: true } } } },
        },
      });
    case "supplier-payments":
      return db.supplierPayment.findFirst({
        where: { id, tenantId },
        include: {
          supplier: { select: { name: true, company: true, email: true, phone: true, address: true, taxId: true } },
          allocations: { where: { bill: { tenantId } }, include: { bill: { select: { billNumber: true, dueDate: true, status: true, total: true } } } },
        },
      });
    case "inventory":
      return db.inventoryMovement.findFirst({
        where: { id, tenantId }, include: { product: { select: { name: true, sku: true, unit: true, stockOnHand: true } } },
      });
    case "customer-follow-ups":
      return db.customerFollowUp.findFirst({
        where: { id, tenantId },
        include: { customer: { select: { name: true, company: true, email: true, phone: true } }, assignedUser: { select: { name: true } } },
      });
    case "ledger":
      return db.ledgerEntry.findFirst({
        where: { id, tenantId },
        include: { customer: { select: { name: true, company: true } }, supplier: { select: { name: true, company: true } } },
      });
    case "permissions":
      return db.rolePermission.findFirst({ where: { id, tenantId } });
    default:
      return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  const { resource, id } = await context.params;
  const permission = await requireWorkspacePermission(access, resource, "read");
  if (!permission.ok) return fail(permission.message, permission.status);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return fail("Invalid record identifier.", 400);
  }
  try {
    const record = await operationRecordForDetail(resource, id, access.tenantId);
    if (!record) return fail("Record not found in this workspace.", 404);
    return Response.json({ data: serializeOperationDetail(record) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    console.error("Operations detail load failed:", resource, code || "UNKNOWN");
    return fail("Could not load this record's details.", 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  const { resource, id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid record identifier.");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid update payload.");
  const permission = await requireWorkspacePermission(access, resource, "update");
  if (!permission.ok) return fail(permission.message, permission.status);
  const tenantId = access.tenantId;
  const actorId = access.user.id;

  try {
    if (resource === "products") {
      const parsed = z.object({
        name: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(4000).nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        category: z.string().trim().max(120).nullable().optional(),
        reorderLevel: z.coerce.number().finite().min(0).max(1000000000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7, "Stock quantities may have at most three decimal places.").optional(),
        sellingPrice: z.coerce.number().finite().min(0).max(9999999999).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Currency amounts may have at most two decimal places.").optional(),
        purchaseCost: z.coerce.number().finite().min(0).max(9999999999).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Currency amounts may have at most two decimal places.").optional(),
      }).strict().safeParse(body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) return fail(parsed.success ? "No editable fields were supplied." : parsed.error.issues[0]?.message || "Invalid product update.");
      const result = await db.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
          where: { id, tenantId },
          select: { id: true, stockOnHand: true, purchaseCost: true },
        });
        if (!product) return "NOT_FOUND";
        if (parsed.data.status === "INACTIVE" && n(product.stockOnHand) > 0) return "STOCK_REMAINS";
        if (parsed.data.purchaseCost !== undefined
          && Math.abs(n(product.purchaseCost) - parsed.data.purchaseCost) > 0.005
          && n(product.stockOnHand) > 0) return "COST_LOCKED";
        await tx.product.update({ where: { id: product.id }, data: parsed.data });
        await tx.auditLog.create({
          data: { actorUserId: actorId, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id, metadata: parsed.data },
        });
        return "UPDATED";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === "NOT_FOUND") return fail("Product not found in this workspace.", 404);
      if (result === "STOCK_REMAINS") return fail("A product with remaining stock cannot be deactivated. Post the appropriate stock movements first.", 409);
      if (result === "COST_LOCKED") return fail("Purchase cost cannot be edited while stock remains. Receive stock at its actual cost or post an authorized valuation adjustment.", 409);
      return Response.json({ data: { id, updated: true } });
    }

    if (resource === "suppliers") {
      const parsed = z.object({
        name: z.string().trim().min(1).max(160).optional(),
        company: z.string().trim().max(160).nullable().optional(),
        email: z.union([z.string().trim().email().max(320), z.null()]).optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        address: z.string().trim().max(4000).nullable().optional(),
        taxId: z.string().trim().max(80).nullable().optional(),
        paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      }).strict().safeParse(body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) return fail(parsed.success ? "No editable fields were supplied." : parsed.error.issues[0]?.message || "Invalid supplier update.");
      const updated = await db.supplier.updateMany({ where: { id, tenantId }, data: parsed.data });
      if (!updated.count) return fail("Supplier not found in this workspace.", 404);
      await writeAuditEvent({ actorUserId: actorId, action: "SUPPLIER_UPDATED", entityType: "Supplier", entityId: id, metadata: parsed.data });
      return Response.json({ data: { id, updated: true } });
    }

    if (resource === "sales-orders" && body.action === "EDIT_DRAFT") {
      const parsed = z.object({
        customerId: z.string().uuid(),
        orderDate: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional()),
        expectedDeliveryAt: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.date().optional()),
        notes: z.string().trim().max(4000).nullable().optional(),
        items: z.array(z.object({
          productId: z.string().uuid(),
          quantity: z.coerce.number().finite().positive().max(1000000000),
          discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
          taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
        }).strict()).min(1).max(100),
      }).strict().safeParse(body);
      if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Check the revised order details.");
      const result = await db.$transaction(async (tx) => {
        const order = await tx.salesOrder.findFirst({
          where: { id, tenantId },
          include: { items: true, deliveries: true, invoices: true },
        });
        if (!order) return { kind: "NOT_FOUND" as const };
        if (order.status !== "DRAFT" || order.deliveries.length || order.invoices.length) return { kind: "POSTED" as const };
        const customer = await tx.customer.findFirst({ where: { id: parsed.data.customerId, tenantId, status: "ACTIVE" } });
        if (!customer) return { kind: "CUSTOMER_NOT_FOUND" as const };
        const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
        const products = await tx.product.findMany({ where: { tenantId, id: { in: productIds }, status: "ACTIVE" } });
        if (products.length !== productIds.length) return { kind: "PRODUCT_NOT_FOUND" as const };
        const byId = new Map(products.map((product) => [product.id, product]));
        const prepared = parsed.data.items.map((item) => {
          const product = byId.get(item.productId)!;
          const gross = Math.round((item.quantity * n(product.sellingPrice) + Number.EPSILON) * 100) / 100;
          const discountAmount = Math.round((gross * item.discountPercent / 100 + Number.EPSILON) * 100) / 100;
          const taxAmount = Math.round(((gross - discountAmount) * item.taxPercent / 100 + Number.EPSILON) * 100) / 100;
          return { product, quantity: item.quantity, gross, discountAmount, taxAmount,
            lineTotal: Math.round((gross - discountAmount + taxAmount + Number.EPSILON) * 100) / 100 };
        });
        const subtotal = Math.round((prepared.reduce((sum, item) => sum + item.gross, 0) + Number.EPSILON) * 100) / 100;
        const discountAmount = Math.round((prepared.reduce((sum, item) => sum + item.discountAmount, 0) + Number.EPSILON) * 100) / 100;
        const taxAmount = Math.round((prepared.reduce((sum, item) => sum + item.taxAmount, 0) + Number.EPSILON) * 100) / 100;
        const total = Math.round((subtotal - discountAmount + taxAmount + Number.EPSILON) * 100) / 100;
        await tx.salesOrderItem.deleteMany({ where: { orderId: order.id } });
        await tx.salesOrderItem.createMany({
          data: prepared.map((item) => ({
            orderId: order.id, productId: item.product.id, description: item.product.name,
            quantity: item.quantity, unitPrice: item.product.sellingPrice, unitCost: item.product.purchaseCost,
            discountAmount: item.discountAmount, taxAmount: item.taxAmount, lineTotal: item.lineTotal,
          })),
        });
        const updated = await tx.salesOrder.update({
          where: { id: order.id },
          data: {
            customerId: customer.id,
            ...(parsed.data.orderDate ? { orderDate: parsed.data.orderDate } : {}),
            expectedDeliveryAt: parsed.data.expectedDeliveryAt ?? null,
            notes: parsed.data.notes ?? null,
            subtotal, discountAmount, taxAmount, total,
          },
        });
        await audit(tx, actorId, "SALES_ORDER_DRAFT_EDITED", "SalesOrder", order.id, {
          oldTotal: n(order.total), newTotal: total, lineCount: prepared.length,
        });
        return { kind: "UPDATED" as const, order: updated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result.kind === "NOT_FOUND") return fail("Sales order not found in this workspace.", 404);
      if (result.kind === "POSTED") return fail("Only draft orders without deliveries or invoices can be edited.", 409);
      if (result.kind === "CUSTOMER_NOT_FOUND") return fail("Customer not found or inactive in this workspace.", 400);
      if (result.kind === "PRODUCT_NOT_FOUND") return fail("One or more products do not belong to this workspace or are inactive.", 400);
      return Response.json({ data: result.order });
    }

    if (resource === "sales-orders" && body.action === "ISSUE_INVOICE") {
      const invoicePermission = await requireWorkspacePermission(access, "invoices", "create");
      if (!invoicePermission.ok) return fail(invoicePermission.message, invoicePermission.status);
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: { tenantId, salesOrderId: id },
          select: { id: true, invoiceNumber: true, total: true, status: true },
        });
        if (existing) return { kind: "EXISTING" as const, invoice: existing };
        const order = await tx.salesOrder.findFirst({
          where: { id, tenantId },
          include: {
            customer: { select: { id: true, name: true, paymentTermsDays: true, creditLimit: true } },
            items: true,
          },
        });
        if (!order) return { kind: "NOT_FOUND" as const };
        if (!["CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED"].includes(order.status)) {
          return { kind: "INVALID_STATUS" as const };
        }
        const businessSettings = await tx.businessSettings.findUnique({
          where: { tenantId },
          select: { invoicePrefix: true, defaultPaymentTermsDays: true },
        });
        const customerTerms = order.customer.paymentTermsDays > 0
          ? order.customer.paymentTermsDays
          : businessSettings?.defaultPaymentTermsDays ?? 0;
        const creditLimit = n(order.customer.creditLimit);
        if (customerTerms > 0 && creditLimit > 0) {
          const currentExposure = await customerCreditExposure(tx, tenantId, order.customerId, order.id);
          if (currentExposure + n(order.total) > creditLimit + 0.005) {
            return { kind: "CREDIT_LIMIT_EXCEEDED" as const, creditLimit, currentExposure };
          }
        }
        const issueDate = new Date();
        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + Math.max(0, customerTerms));
        const invoicePrefix = businessSettings?.invoicePrefix?.trim() || "INV";
        const invoiceNumber = invoicePrefix + "-" + issueDate.toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomUUID().slice(0, 8).toUpperCase();
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            customerId: order.customerId,
            salesOrderId: order.id,
            invoiceNumber,
            issueDate,
            dueDate,
            subtotal: order.subtotal,
            discountAmount: order.discountAmount,
            taxAmount: order.taxAmount,
            total: order.total,
            status: "SENT",
            notes: "Issued from sales order " + order.orderNumber,
            items: {
              create: order.items.map((item) => ({
                productId: item.productId,
                description: item.description || "Product",
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount,
                taxAmount: item.taxAmount,
                lineTotal: item.lineTotal,
              })),
            },
          },
          select: { id: true, invoiceNumber: true, total: true, status: true },
        });
        await tx.ledgerEntry.create({ data: {
          tenantId, customerId: order.customerId, entryType: "SALES_INVOICE",
          referenceType: "INVOICE", referenceId: invoice.id,
          description: "Sales invoice " + invoice.invoiceNumber + " from order " + order.orderNumber,
          debit: invoice.total, credit: 0, idempotencyKey: "invoice-" + invoice.id, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "SALES_ORDER_INVOICE_ISSUED", "Invoice", invoice.id, {
          salesOrderId: order.id,
          orderNumber: order.orderNumber,
          invoiceNumber: invoice.invoiceNumber,
          total: n(invoice.total),
        });
        return { kind: "CREATED" as const, invoice };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result.kind === "NOT_FOUND") return fail("Sales order not found in this workspace.", 404);
      if (result.kind === "INVALID_STATUS") return fail("Confirm the sales order before issuing its invoice.", 409);
      if (result.kind === "CREDIT_LIMIT_EXCEEDED") return fail("Invoice not issued: this credit sale would exceed the configured customer credit limit. Current exposure " + n(result.currentExposure).toFixed(2) + ", limit " + n(result.creditLimit).toFixed(2) + ".", 409);
      return Response.json({ data: result.invoice, idempotentReplay: result.kind === "EXISTING" }, { status: result.kind === "EXISTING" ? 200 : 201 });
    }

    if (resource === "sales-orders" && (body.status === "CONFIRMED" || body.status === "CANCELLED")) {
      const parsed = z.object({ status: z.enum(["CONFIRMED", "CANCELLED"]) }).strict().safeParse(body);
      if (!parsed.success) return fail("Invalid sales-order status transition.");
      const result = await db.$transaction(async (tx) => {
        const order = await tx.salesOrder.findFirst({
          where: { id, tenantId },
          include: {
            customer: { select: { id: true, status: true, paymentTermsDays: true, creditLimit: true } },
            invoices: { select: { id: true, status: true } },
            deliveries: { select: { status: true } },
          },
        });
        if (!order) return { kind: "NOT_FOUND" as const };
        if (order.status === "CANCELLED" || order.status === "DELIVERED" || order.status === "PARTIALLY_DELIVERED") return { kind: "INVALID_STATE" as const };
        if (parsed.data.status === "CONFIRMED" && order.status !== "DRAFT") return { kind: "INVALID_STATE" as const };
        if (parsed.data.status === "CONFIRMED") {
          if (order.customer.status !== "ACTIVE") return { kind: "CUSTOMER_NOT_ACTIVE" as const };
          const businessSettings = await tx.businessSettings.findUnique({
            where: { tenantId }, select: { defaultPaymentTermsDays: true },
          });
          const termsDays = order.customer.paymentTermsDays > 0
            ? order.customer.paymentTermsDays
            : businessSettings?.defaultPaymentTermsDays ?? 0;
          const creditLimit = n(order.customer.creditLimit);
          if (termsDays > 0 && creditLimit > 0) {
            const currentExposure = await customerCreditExposure(tx, tenantId, order.customer.id, order.id);
            if (currentExposure + n(order.total) > creditLimit + 0.005) {
              return { kind: "CREDIT_LIMIT_EXCEEDED" as const, creditLimit, currentExposure };
            }
          }
        }
        if (parsed.data.status === "CANCELLED" && order.invoices.some((invoice) => invoice.status !== "CANCELLED")) return { kind: "INVOICED" as const };
        if (parsed.data.status === "CANCELLED" && order.deliveries.some((delivery) => ["DELIVERED", "PARTIALLY_DELIVERED"].includes(delivery.status))) return { kind: "HAS_DELIVERIES" as const };
        if (parsed.data.status === "CANCELLED") {
          await tx.delivery.updateMany({
            where: { orderId: id, tenantId, status: { in: ["PENDING", "DISPATCHED"] } },
            data: { status: "CANCELLED" },
          });
        }
        const updated = await tx.salesOrder.update({ where: { id: order.id }, data: { status: parsed.data.status } });
        await audit(tx, actorId, "SALES_ORDER_STATUS_CHANGED", "SalesOrder", order.id, { from: order.status, to: parsed.data.status });
        return { kind: "UPDATED" as const, order: updated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result.kind === "NOT_FOUND") return fail("Sales order not found in this workspace.", 404);
      if (result.kind === "INVOICED") return fail("An order with an issued invoice cannot be cancelled. Reverse or credit the invoice using an authorized financial workflow.", 409);
      if (result.kind === "HAS_DELIVERIES") return fail("An order with completed or partially completed deliveries cannot be cancelled. Use a return workflow.", 409);
       if (result.kind === "CUSTOMER_NOT_ACTIVE") return fail("An inactive customer cannot have a new confirmed order.", 409);
       if (result.kind === "CREDIT_LIMIT_EXCEEDED") return fail("Order not confirmed: current credit exposure " + n(result.currentExposure).toFixed(2) + " plus this order exceeds the customer credit limit of " + n(result.creditLimit).toFixed(2) + ".", 409);
       if (result.kind === "INVALID_STATE") return fail("This order cannot make that status transition.", 409);
      return Response.json({ data: result.order });
    }

    if (resource === "sales-orders") {
      const parsed = z.object({ status: z.enum(["CONFIRMED", "CANCELLED"]) }).strict().safeParse(body);
      if (!parsed.success) return fail("Choose CONFIRMED or CANCELLED.");
      const result = await db.$transaction(async (tx) => {
        const order = await tx.salesOrder.findFirst({ where: { id, tenantId }, include: { deliveries: true, invoices: true } });
        if (!order) return { status: "NOT_FOUND" as const };
        if (order.status === parsed.data.status) return { status: "UNCHANGED" as const };
        if (parsed.data.status === "CONFIRMED" && order.status !== "DRAFT") return { status: "INVALID_TRANSITION" as const };
        if (parsed.data.status === "CANCELLED") {
          if (order.status === "DELIVERED" || order.status === "PARTIALLY_DELIVERED" || order.deliveries.some((d) => d.status === "DELIVERED" || d.status === "PARTIALLY_DELIVERED") || order.invoices.some((i) => i.status !== "CANCELLED")) {
            return { status: "HAS_POSTED_ACTIVITY" as const };
          }
          await tx.delivery.updateMany({ where: { orderId: id, tenantId, status: { in: ["PENDING", "DISPATCHED"] } }, data: { status: "CANCELLED" } });
        }
        const updated = await tx.salesOrder.update({ where: { id }, data: { status: parsed.data.status } });
        await audit(tx, actorId, "SALES_ORDER_STATUS_CHANGED", "SalesOrder", id, { from: order.status, to: updated.status });
        return { status: "UPDATED" as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result.status === "NOT_FOUND") return fail("Order not found in this workspace.", 404);
      if (result.status === "INVALID_TRANSITION") return fail("Only draft orders can be confirmed through this action.", 409);
      if (result.status === "HAS_POSTED_ACTIVITY") return fail("Orders with deliveries or issued invoices cannot be cancelled. Use a return or reversal workflow.", 409);
      return Response.json({ data: { id, updated: result.status === "UPDATED", status: result.status } });
    }

    if (resource === "purchase-orders") {
      const parsed = z.object({ status: z.literal("CANCELLED") }).strict().safeParse(body);
      if (!parsed.success) return fail("Only purchase-order cancellation is supported here.");
      const result = await db.$transaction(async (tx) => {
        const order = await tx.purchaseOrder.findFirst({ where: { id, tenantId }, include: { receipts: { where: { status: "POSTED" } } } });
        if (!order) return "NOT_FOUND";
        if (order.status === "RECEIVED" || order.receipts.length) return "HAS_RECEIPTS";
        if (order.status === "CANCELLED") return "UNCHANGED";
        await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
        await audit(tx, actorId, "PURCHASE_ORDER_CANCELLED", "PurchaseOrder", id, { orderNumber: order.orderNumber });
        return "UPDATED";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === "NOT_FOUND") return fail("Purchase order not found in this workspace.", 404);
      if (result === "HAS_RECEIPTS") return fail("A purchase order with posted goods receipts cannot be cancelled. Use a documented return.", 409);
      return Response.json({ data: { id, updated: result === "UPDATED" } });
    }

    if (resource === "deliveries") {
      const parsed = z.object({
        status: z.enum(["DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "FAILED", "CANCELLED"]),
        proofOfDelivery: z.string().trim().max(2048).optional(),
        failureReason: z.string().trim().max(2000).optional(),
      }).strict().safeParse(body);
      if (!parsed.success) return fail("Choose a valid delivery status.");
      const result = await db.$transaction(async (tx) => {
        const delivery = await tx.delivery.findFirst({ where: { id, tenantId }, include: {
          items: { include: { orderItem: { include: { order: true } }, product: true } },
        } });
        if (!delivery) return "NOT_FOUND";
        if (delivery.status === "DELIVERED" || delivery.status === "PARTIALLY_DELIVERED") return "ALREADY_POSTED";
        if (delivery.status === "CANCELLED" || delivery.status === "FAILED") return "CLOSED";
        const nextStatus = parsed.data.status;
        if (nextStatus === "CANCELLED" || nextStatus === "FAILED") {
          await tx.delivery.update({ where: { id }, data: {
            status: nextStatus, failureReason: parsed.data.failureReason ?? null,
          } });
          await audit(tx, actorId, "DELIVERY_CLOSED", "Delivery", id, { status: nextStatus, reason: parsed.data.failureReason ?? null });
          return "UPDATED";
        }
        if (nextStatus === "DISPATCHED") {
          await tx.delivery.update({ where: { id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
          await audit(tx, actorId, "DELIVERY_DISPATCHED", "Delivery", id);
          return "UPDATED";
        }
        if (!delivery.items.length) return "EMPTY_DELIVERY";
        for (const item of delivery.items) {
          const orderItem = await tx.salesOrderItem.findFirst({ where: { id: item.orderItemId, order: { tenantId } } });
          if (!orderItem) throw new Error("ORDER_ITEM_NOT_FOUND");
          if (n(orderItem.deliveredQuantity) + n(item.quantity) > n(orderItem.quantity) + 0.000001) throw new Error("DELIVERY_EXCEEDS_ORDERED");
          const stock = await tx.product.updateMany({
            where: { id: item.productId, tenantId, stockOnHand: { gte: item.quantity } },
            data: { stockOnHand: { decrement: item.quantity } },
          });
          if (!stock.count) throw new Error("INSUFFICIENT_STOCK");
          const advanced = await tx.salesOrderItem.updateMany({
            where: { id: orderItem.id, deliveredQuantity: { lte: n(orderItem.quantity) - n(item.quantity) } },
            data: { deliveredQuantity: { increment: item.quantity } },
          });
          if (!advanced.count) throw new Error("DELIVERY_EXCEEDS_ORDERED");
          await tx.deliveryItem.update({
            where: { id: item.id },
            data: { unitCost: item.product.purchaseCost },
          });
          await tx.inventoryMovement.create({ data: {
            tenantId, productId: item.productId, movementType: "SALE_ISSUE", quantity: item.quantity,
            unitCost: item.product.purchaseCost, referenceType: "DELIVERY", referenceId: delivery.id,
            idempotencyKey: "delivery-" + delivery.id + "-" + orderItem.id,
            createdByUserId: actorId, notes: "Stock issued on completed delivery " + delivery.deliveryNumber,
          } });
          await tx.ledgerEntry.create({ data: {
            tenantId, entryType: "COST_OF_GOODS_SOLD", referenceType: "DELIVERY", referenceId: delivery.id,
            description: "Cost of goods delivered: " + item.product.name,
            debit: Math.round(n(item.quantity) * n(item.product.purchaseCost) * 100) / 100, credit: 0,
            idempotencyKey: "delivery-cogs-" + delivery.id + "-" + orderItem.id, createdByUserId: actorId,
          } });
        }
        const orderId = delivery.orderId;
        const orderItems = await tx.salesOrderItem.findMany({ where: { orderId } });
        const complete = orderItems.length > 0 && orderItems.every((item) => n(item.deliveredQuantity) >= n(item.quantity) - 0.000001);
        const anyDelivered = orderItems.some((item) => n(item.deliveredQuantity) > 0);
        const actualDeliveryStatus = complete ? "DELIVERED" : "PARTIALLY_DELIVERED";
        const updated = await tx.delivery.update({ where: { id }, data: {
          status: actualDeliveryStatus, completedAt: new Date(), proofOfDelivery: parsed.data.proofOfDelivery ?? null,
        } });
        await tx.salesOrder.update({ where: { id: orderId }, data: { status: complete ? "DELIVERED" : anyDelivered ? "PARTIALLY_DELIVERED" : "CONFIRMED" } });
        await audit(tx, actorId, "DELIVERY_POSTED", "Delivery", id, { status: updated.status, lineCount: delivery.items.length });
        return "UPDATED";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const messageMap: Record<string, string> = {
        NOT_FOUND: "Delivery not found in this workspace.",
        ALREADY_POSTED: "This delivery has already been posted. Stock was not changed again.",
        CLOSED: "This delivery is already closed.",
        EMPTY_DELIVERY: "A delivery without items cannot be completed.",
        INSUFFICIENT_STOCK: "Not enough stock to complete this delivery; no changes were committed.",
        DELIVERY_EXCEEDS_ORDERED: "Delivered quantity would exceed the ordered quantity; no changes were committed.",
        ORDER_ITEM_NOT_FOUND: "An order line was not found in this workspace.",
      };
      if (messageMap[result]) return fail(messageMap[result], result === "NOT_FOUND" ? 404 : 409);
      return Response.json({ data: { id, updated: result === "UPDATED" } });
    }

    if (resource === "goods-receipts") {
      const parsed = z.object({ status: z.literal("REVERSED"), reason: z.string().trim().min(3).max(1000) }).strict().safeParse(body);
      if (!parsed.success) return fail("A reason is required to reverse a posted goods receipt.");
      const result = await db.$transaction(async (tx) => {
        const receipt = await tx.goodsReceipt.findFirst({ where: { id, tenantId }, include: { items: true, purchaseOrder: true } });
        if (!receipt) return "NOT_FOUND";
        if (receipt.status === "REVERSED") return "ALREADY_REVERSED";
        if (receipt.status !== "POSTED") return "NOT_POSTED";
        for (const item of receipt.items) {
          const stock = await tx.product.updateMany({ where: { id: item.productId, tenantId, stockOnHand: { gte: item.quantity } }, data: { stockOnHand: { decrement: item.quantity } } });
          if (!stock.count) throw new Error("STOCK_ALREADY_CONSUMED");
          const poItem = await tx.purchaseOrderItem.updateMany({ where: { id: item.purchaseOrderItemId, receivedQuantity: { gte: item.quantity } }, data: { receivedQuantity: { decrement: item.quantity } } });
          if (!poItem.count) throw new Error("RECEIPT_REVERSAL_MISMATCH");
          await tx.inventoryMovement.create({ data: {
            tenantId, productId: item.productId, movementType: "PURCHASE_RETURN", quantity: item.quantity,
            unitCost: item.unitCost, referenceType: "GOODS_RECEIPT_REVERSAL", referenceId: receipt.id,
            idempotencyKey: "receipt-reversal-" + receipt.id + "-" + item.id, createdByUserId: actorId, notes: parsed.data.reason,
          } });
        }
        await tx.goodsReceipt.update({ where: { id }, data: { status: "REVERSED", notes: [receipt.notes, "Reversal: " + parsed.data.reason].filter(Boolean).join("\n") } });
        const poItems = await tx.purchaseOrderItem.findMany({ where: { orderId: receipt.purchaseOrderId } });
        const complete = poItems.every((item) => n(item.receivedQuantity) >= n(item.quantity) - 0.000001);
        const any = poItems.some((item) => n(item.receivedQuantity) > 0);
        await tx.purchaseOrder.update({ where: { id: receipt.purchaseOrderId }, data: { status: complete ? "RECEIVED" : any ? "PARTIALLY_RECEIVED" : "ORDERED" } });
        await audit(tx, actorId, "GOODS_RECEIPT_REVERSED", "GoodsReceipt", id, { reason: parsed.data.reason });
        return "UPDATED";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === "NOT_FOUND") return fail("Goods receipt not found in this workspace.", 404);
      if (result === "ALREADY_REVERSED") return fail("This goods receipt was already reversed.", 409);
      if (result === "NOT_POSTED") return fail("Only a posted goods receipt can be reversed.", 409);
      return Response.json({ data: { id, updated: result === "UPDATED" } });
    }

    if (resource === "customer-receipts") {
      const parsed = z.object({ status: z.literal("REVERSED"), reason: z.string().trim().min(3).max(1000) }).strict().safeParse(body);
      if (!parsed.success) return fail("A reason is required to reverse a customer receipt.");
      const result = await db.$transaction(async (tx) => {
        const receipt = await tx.customerReceipt.findFirst({ where: { id, tenantId }, include: { allocations: true } });
        if (!receipt) return "NOT_FOUND";
        if (receipt.status === "REVERSED") return "ALREADY_REVERSED";
        if (receipt.status !== "POSTED") return "NOT_POSTED";
        await tx.customerReceipt.update({ where: { id }, data: { status: "REVERSED", notes: [receipt.notes, "Reversal: " + parsed.data.reason].filter(Boolean).join("\n") } });
        for (const allocation of receipt.allocations) {
          const invoice = await tx.invoice.findFirst({ where: { id: allocation.invoiceId, tenantId }, include: {
            payments: { select: { amount: true, status: true } },
            receiptAllocations: { include: { receipt: { select: { status: true } } } },
          } });
          if (!invoice) continue;
          const legacyPaid = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + n(payment.amount), 0);
          const receiptsPaid = invoice.receiptAllocations.filter((entry) => entry.receipt.status === "POSTED").reduce((sum, entry) => sum + n(entry.amount), 0);
          const paid = legacyPaid + receiptsPaid;
          const status = invoiceStatusFromBalance({ total: invoice.total, paid, dueDate: invoice.dueDate, wasDraft: invoice.status === "DRAFT" });
          await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
        }
        await tx.ledgerEntry.create({ data: {
          tenantId, customerId: receipt.customerId, entryType: "CUSTOMER_RECEIPT_REVERSAL",
          referenceType: "CUSTOMER_RECEIPT", referenceId: receipt.id,
          description: "Reversal of customer receipt " + id + ": " + parsed.data.reason,
          debit: receipt.amount, credit: 0, idempotencyKey: "receipt-reversal-" + receipt.id, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "CUSTOMER_RECEIPT_REVERSED", "CustomerReceipt", id, { amount: n(receipt.amount), reason: parsed.data.reason });
        return "UPDATED";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === "NOT_FOUND") return fail("Receipt not found in this workspace.", 404);
      if (result === "ALREADY_REVERSED") return fail("This receipt was already reversed.", 409);
      if (result === "NOT_POSTED") return fail("Only a posted receipt can be reversed.", 409);
      return Response.json({ data: { id, updated: result === "UPDATED" } });
    }

    if (resource === "supplier-payments") {
      const parsed = z.object({ status: z.literal("REVERSED"), reason: z.string().trim().min(3).max(1000) }).strict().safeParse(body);
      if (!parsed.success) return fail("A reason is required to reverse a supplier payment.");
      const result = await db.$transaction(async (tx) => {
        const payment = await tx.supplierPayment.findFirst({ where: { id, tenantId }, include: { allocations: true } });
        if (!payment) return "NOT_FOUND";
        if (payment.status === "REVERSED") return "ALREADY_REVERSED";
        if (payment.status !== "POSTED") return "NOT_POSTED";
        await tx.supplierPayment.update({ where: { id }, data: { status: "REVERSED", notes: [payment.notes, "Reversal: " + parsed.data.reason].filter(Boolean).join("\n") } });
        for (const allocation of payment.allocations) {
          const bill = await tx.supplierBill.findFirst({ where: { id: allocation.billId, tenantId }, include: { allocations: { include: { payment: { select: { status: true } } } } } });
          if (!bill) continue;
          const paid = bill.allocations.filter((entry) => entry.payment.status === "POSTED").reduce((sum, entry) => sum + n(entry.amount), 0);
          const remaining = n(bill.total) - paid;
          await tx.supplierBill.update({ where: { id: bill.id }, data: { status: remaining <= 0.005 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN" } });
        }
        await tx.ledgerEntry.create({ data: {
          tenantId, supplierId: payment.supplierId, entryType: "SUPPLIER_PAYMENT_REVERSAL",
          referenceType: "SUPPLIER_PAYMENT", referenceId: payment.id,
          description: "Reversal of supplier payment " + id + ": " + parsed.data.reason,
          debit: 0, credit: payment.amount, idempotencyKey: "supplier-payment-reversal-" + payment.id, createdByUserId: actorId,
        } });
        await audit(tx, actorId, "SUPPLIER_PAYMENT_REVERSED", "SupplierPayment", id, { amount: n(payment.amount), reason: parsed.data.reason });
        return "UPDATED";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result === "NOT_FOUND") return fail("Supplier payment not found in this workspace.", 404);
      if (result === "ALREADY_REVERSED") return fail("This supplier payment was already reversed.", 409);
      if (result === "NOT_POSTED") return fail("Only a posted supplier payment can be reversed.", 409);
      return Response.json({ data: { id, updated: result === "UPDATED" } });
    }

    if (resource === "customer-follow-ups") {
      const parsed = z.object({ status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]) }).strict().safeParse(body);
      if (!parsed.success) return fail("Choose a valid follow-up status.");
      const updated = await db.customerFollowUp.updateMany({ where: { id, tenantId }, data: { status: parsed.data.status } });
      if (!updated.count) return fail("Follow-up not found in this workspace.", 404);
      await writeAuditEvent({ actorUserId: actorId, action: "FOLLOW_UP_STATUS_CHANGED", entityType: "CustomerFollowUp", entityId: id, metadata: { status: parsed.data.status } });
      return Response.json({ data: { id, updated: true } });
    }

    if (resource === "permissions") {
      if (!["TENANT_ADMIN", "PLATFORM_ADMIN"].includes(access.user.role)) return fail("Only the business owner can change team permissions.", 403);
      const parsed = z.object({ granted: z.boolean() }).strict().safeParse(body);
      if (!parsed.success) return fail("Permission requires a boolean granted value.");
      const updated = await db.rolePermission.updateMany({ where: { id, tenantId }, data: { granted: parsed.data.granted, updatedByUserId: actorId } });
      if (!updated.count) return fail("Permission entry not found in this workspace.", 404);
      await writeAuditEvent({ actorUserId: actorId, action: "ROLE_PERMISSION_UPDATED", entityType: "RolePermission", entityId: id, metadata: { granted: parsed.data.granted } });
      return Response.json({ data: { id, updated: true } });
    }

    return fail("This module does not support updates here.", 400);
  } catch (error) {
    const message = (error as Error)?.message || "";
    const mapped: Record<string, string> = {
      INSUFFICIENT_STOCK: "Insufficient stock; no changes were committed.",
      STOCK_ALREADY_CONSUMED: "Some received stock has already been consumed. Restore stock before reversing this receipt.",
      RECEIPT_REVERSAL_MISMATCH: "Receipt quantities no longer reconcile with the purchase order.",
      DELIVERY_EXCEEDS_ORDERED: "Delivered quantity would exceed the ordered quantity.",
    };
    if (mapped[message]) return fail(mapped[message], 409);
    if ((error as { code?: string }).code === "P2034") return fail("A concurrent transaction changed these records. Refresh and retry.", 409);
    console.error("Operations update failed:", resource, (error as { code?: string }).code || "UNKNOWN", message.slice(0, 180));
    return fail("Could not update this business operation. No partial transaction was committed.", 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const fail = (status: number, message: string) =>
    Response.json({ error: { message } }, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!isSameOriginRequest(request)) return fail(403, "Cross-origin changes are not allowed.");

  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.status, access.message);
  const { resource, id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail(400, "Invalid record identifier.");

  const permission = await requireWorkspacePermission(access, resource, "delete");
  if (!permission.ok) return fail(permission.status, permission.message);

  const supported = new Set([
    "products", "suppliers", "sales-orders", "purchase-orders", "goods-receipts",
    "deliveries", "customer-receipts", "supplier-bills", "supplier-payments",
    "inventory", "customer-follow-ups", "ledger", "permissions",
  ]);
  if (!supported.has(resource)) return fail(404, "Delete is not available for this record type.");

  try {
    const result = await db.$transaction(async (tx) => {
      let entityType = resource.replaceAll("-", "_").replace(/s$/, "").toUpperCase();
      if (resource === "products") {
        const row = await tx.product.findFirst({
          where: { id, tenantId: access.tenantId },
          include: { _count: { select: { orderItems: true, purchaseItems: true, receiptItems: true, deliveryItems: true, movements: true, invoiceItems: true } } },
        });
        if (!row) return { kind: "NOT_FOUND" as const };
        const related = Object.values(row._count).reduce((sum, count) => sum + count, 0);
        if (Number(row.stockOnHand) > 0 || related > 0) {
          return { kind: "IN_USE" as const, reason: "This product has stock or transaction history. Deactivate it instead; stock and movement history must be preserved." };
        }
        await tx.product.delete({ where: { id: row.id } });
      } else if (resource === "suppliers") {
        const row = await tx.supplier.findFirst({
          where: { id, tenantId: access.tenantId },
          include: { _count: { select: { purchaseOrders: true, bills: true, payments: true, ledgerEntries: true } } },
        });
        if (!row) return { kind: "NOT_FOUND" as const };
        if (Object.values(row._count).some((count) => count > 0)) {
          return { kind: "IN_USE" as const, reason: "This supplier has purchase, bill, payment or ledger history. Mark the supplier inactive instead." };
        }
        await tx.supplier.delete({ where: { id: row.id } });
      } else if (resource === "sales-orders") {
        const row = await tx.salesOrder.findFirst({
          where: { id, tenantId: access.tenantId },
          include: { _count: { select: { deliveries: true, invoices: true } } },
        });
        if (!row) return { kind: "NOT_FOUND" as const };
        if (row.status !== "DRAFT" || row._count.deliveries || row._count.invoices) {
          return { kind: "IN_USE" as const, reason: "Only draft orders with no deliveries or invoices can be deleted. Confirmed or fulfilled orders remain in audit history." };
        }
        await tx.salesOrder.delete({ where: { id: row.id } });
      } else if (resource === "purchase-orders") {
        const row = await tx.purchaseOrder.findFirst({
          where: { id, tenantId: access.tenantId },
          include: { _count: { select: { receipts: true, bills: true } } },
        });
        if (!row) return { kind: "NOT_FOUND" as const };
        if (row.status !== "DRAFT" || row._count.receipts || row._count.bills) {
          return { kind: "IN_USE" as const, reason: "Only a draft purchase order with no goods receipts or supplier bills can be deleted." };
        }
        await tx.purchaseOrder.delete({ where: { id: row.id } });
      } else if (resource === "deliveries") {
        const row = await tx.delivery.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true, status: true, dispatchedAt: true, completedAt: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        if (row.status !== "PENDING" || row.dispatchedAt || row.completedAt) {
          return { kind: "IN_USE" as const, reason: "Only an un-dispatched pending delivery can be deleted. Dispatched or completed deliveries must remain in the audit trail." };
        }
        await tx.delivery.delete({ where: { id: row.id } });
      } else if (resource === "customer-follow-ups") {
        const row = await tx.customerFollowUp.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        await tx.customerFollowUp.delete({ where: { id: row.id } });
      } else if (resource === "permissions") {
        const row = await tx.rolePermission.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        await tx.rolePermission.delete({ where: { id: row.id } });
        entityType = "ROLE_PERMISSION";
      } else {
        const messages: Record<string, string> = {
          "goods-receipts": "Goods receipts are inventory and accounting evidence. Reverse a posted receipt with a reason instead of deleting it.",
          "customer-receipts": "Customer receipts are financial history. Use the audited reversal action instead of deleting them.",
          "supplier-bills": "Supplier bills are financial history. Correct or settle them through the supplier-bill workflow instead of deleting them.",
          "supplier-payments": "Supplier payments are financial history. Use the audited reversal workflow instead of deleting them.",
          inventory: "Inventory movements are append-only audit history and cannot be deleted.",
          ledger: "Ledger entries are immutable accounting evidence and cannot be deleted.",
        };
        const rowExists = resource === "goods-receipts"
          ? await tx.goodsReceipt.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } })
          : resource === "customer-receipts"
          ? await tx.customerReceipt.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } })
          : resource === "supplier-bills"
          ? await tx.supplierBill.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } })
          : resource === "supplier-payments"
          ? await tx.supplierPayment.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } })
          : resource === "inventory"
          ? await tx.inventoryMovement.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } })
          : await tx.ledgerEntry.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } });
        if (!rowExists) return { kind: "NOT_FOUND" as const };
        return { kind: "IMMUTABLE" as const, reason: messages[resource] || "This record cannot be deleted." };
      }

      await tx.auditLog.create({
        data: {
          actorUserId: access.user.id,
          action: "DELETE",
          entityType,
          entityId: id,
          metadata: { tenantId: access.tenantId, workspaceScoped: true },
        },
      });
      return { kind: "DELETED" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "NOT_FOUND") return fail(404, "Record not found in this workspace.");
    if (result.kind === "IN_USE" || result.kind === "IMMUTABLE") return fail(409, result.reason);
    return Response.json({ data: { id, deleted: true } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2003" || code === "P2014") return fail(409, "This record is linked to existing business history and cannot be deleted.");
    if (code === "P2034") return fail(409, "Another transaction changed this record. Refresh the list and retry.");
    console.error("Operations delete failed.", resource, code || "UNKNOWN");
    return fail(500, "Could not delete the record. No intentional data change was made; refresh and retry.");
  }
}


// Authoritative, read-only detail payloads. Records and related rows stay workspace-scoped;
// internal IDs, idempotency keys, tenant metadata and user secrets are never serialized.
export async function GET(_request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return fail(access.message, access.status);
  const { resource, id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid record identifier.");
  const permission = await requireWorkspacePermission(access, resource, "read");
  if (!permission.ok) return fail(permission.message, permission.status);

  const tenantId = access.tenantId;
  let detail: RecordDetail | null = null;
  const enumText = (value: string | null | undefined) => value
    ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : null;

  try {
    switch (resource) {
      case "products": {
        const row = await db.product.findFirst({
          where: { id, tenantId },
          include: { movements: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10,
            select: { movementType: true, quantity: true, createdAt: true, notes: true } } },
        });
        if (row) detail = {
          type: "Product", title: row.name, reference: "SKU " + row.sku, status: row.status,
          sections: [
            detailSection("Product details", [
              detailField("SKU", row.sku), detailField("Category", row.category), detailField("Unit", row.unit),
              detailField("Description", row.description), detailField("Status", row.status, "status"),
              detailField("Created", row.createdAt, "datetime"), detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Inventory and pricing", [
              detailField("Stock on hand", row.stockOnHand, "quantity"), detailField("Reorder level", row.reorderLevel, "quantity"),
              detailField("Purchase cost", row.purchaseCost, "money"), detailField("Selling price", row.sellingPrice, "money"),
            ]),
            detailSection("Recent stock movements", row.movements.flatMap((entry) => [
              detailField(enumText(entry.movementType) || "Stock movement", entry.quantity, "quantity"),
              detailField("Movement date", entry.createdAt, "datetime"), detailField("Movement note", entry.notes),
            ])),
          ],
        };
        break;
      }
      case "suppliers": {
        const row = await db.supplier.findFirst({
          where: { id, tenantId },
          include: {
            purchaseOrders: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 8, select: { orderNumber: true, status: true, total: true, orderDate: true } },
            bills: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 8, select: { billNumber: true, status: true, total: true, dueDate: true } },
            payments: { where: { tenantId }, orderBy: { paidAt: "desc" }, take: 8, select: { amount: true, method: true, reference: true, status: true, paidAt: true } },
          },
        });
        if (row) detail = {
          type: "Supplier", title: row.name, reference: row.company, status: row.status,
          sections: [
            detailSection("Contact details", [
              detailField("Company", row.company), detailField("Email", row.email), detailField("Phone", row.phone),
              detailField("Address", row.address), detailField("Tax / GST ID", row.taxId),
              detailField("Status", row.status, "status"), detailField("Payment terms (days)", row.paymentTermsDays, "number"),
              detailField("Created", row.createdAt, "datetime"), detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Recent purchase orders", row.purchaseOrders.map((entry) =>
              detailField(entry.orderNumber + " · " + enumText(entry.status), entry.total, "money"))),
            detailSection("Recent supplier bills", row.bills.map((entry) =>
              detailField(entry.billNumber + " · " + enumText(entry.status), entry.total, "money"))),
            detailSection("Recent payments", row.payments.flatMap((entry) => [
              detailField([enumText(entry.method), entry.reference, enumText(entry.status)].filter(Boolean).join(" · ") || "Supplier payment", entry.amount, "money"),
              detailField("Payment date", entry.paidAt, "datetime"),
            ])),
          ],
        };
        break;
      }
      case "sales-orders": {
        const row = await db.salesOrder.findFirst({
          where: { id, tenantId },
          include: {
            customer: { select: { tenantId: true, name: true, company: true, email: true, phone: true } },
            items: { orderBy: { createdAt: "asc" }, include: { product: { select: { tenantId: true, sku: true, name: true, unit: true } } } },
            deliveries: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10, select: { deliveryNumber: true, status: true, scheduledAt: true, completedAt: true } },
            invoices: { where: { tenantId }, select: { id: true, invoiceNumber: true, status: true, total: true } },
          },
        });
        if (row) detail = {
          type: "Sales order", title: row.orderNumber, reference: row.customer.tenantId === tenantId ? row.customer.name : null, status: row.status,
          sections: [
            detailSection("Order details", [
              detailField("Status", row.status, "status"), detailField("Order date", row.orderDate, "date"),
              detailField("Expected delivery", row.expectedDeliveryAt, "datetime"),
              detailField("Subtotal", row.subtotal, "money"), detailField("Discount", row.discountAmount, "money"),
              detailField("Tax", row.taxAmount, "money"), detailField("Order total", row.total, "money"),
              detailField("Notes", row.notes), detailField("Created", row.createdAt, "datetime"),
              detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Customer", [
              detailField("Name", row.customer.tenantId === tenantId ? row.customer.name : null), detailField("Company", row.customer.tenantId === tenantId ? row.customer.company : null),
              detailField("Email", row.customer.tenantId === tenantId ? row.customer.email : null), detailField("Phone", row.customer.tenantId === tenantId ? row.customer.phone : null),
            ]),
            detailSection("Order items", row.items.flatMap((entry, index) => [
              detailField((index + 1) + ". " + (entry.product.tenantId === tenantId ? entry.product.name + " · " + entry.product.sku : "Order item"),
                Number(entry.quantity) + " " + (entry.product.tenantId === tenantId ? entry.product.unit : "units") + " · " +
                new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(entry.unitPrice)) + " per unit"),
              detailField("Line total", entry.lineTotal, "money"),
            ])),
            detailSection("Related deliveries", row.deliveries.flatMap((entry) => [
              detailField(entry.deliveryNumber, entry.status, "status"),
              detailField("Scheduled · " + entry.deliveryNumber, entry.scheduledAt, "datetime"),
              detailField("Completed · " + entry.deliveryNumber, entry.completedAt, "datetime"),
            ])),
            detailSection("Invoices", row.invoices.map((entry) =>
              detailField(entry.invoiceNumber + " · " + enumText(entry.status), entry.total, "money",
                "/operations/invoices/" + encodeURIComponent(entry.id)))),
          ],
        };
        break;
      }
      case "purchase-orders": {
        const row = await db.purchaseOrder.findFirst({
          where: { id, tenantId },
          include: {
            supplier: { select: { tenantId: true, name: true, company: true, email: true, phone: true } },
            items: { orderBy: { createdAt: "asc" }, include: { product: { select: { tenantId: true, sku: true, name: true, unit: true } } } },
            receipts: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10, select: { receiptNumber: true, status: true, receivedAt: true } },
            bills: { where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10, select: { billNumber: true, status: true, total: true, dueDate: true } },
          },
        });
        if (row) detail = {
          type: "Purchase order", title: row.orderNumber, reference: row.supplier.tenantId === tenantId ? row.supplier.name : null, status: row.status,
          sections: [
            detailSection("Order details", [
              detailField("Status", row.status, "status"), detailField("Order date", row.orderDate, "date"),
              detailField("Expected receipt", row.expectedAt, "date"), detailField("Subtotal", row.subtotal, "money"),
              detailField("Tax", row.taxAmount, "money"), detailField("Order total", row.total, "money"),
              detailField("Notes", row.notes), detailField("Created", row.createdAt, "datetime"),
              detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Supplier", [
              detailField("Name", row.supplier.tenantId === tenantId ? row.supplier.name : null), detailField("Company", row.supplier.tenantId === tenantId ? row.supplier.company : null),
              detailField("Email", row.supplier.tenantId === tenantId ? row.supplier.email : null), detailField("Phone", row.supplier.tenantId === tenantId ? row.supplier.phone : null),
            ]),
            detailSection("Purchase items", row.items.flatMap((entry, index) => [
              detailField((index + 1) + ". " + (entry.product.tenantId === tenantId ? entry.product.name + " · " + entry.product.sku : "Purchase item"),
                Number(entry.quantity) + " " + (entry.product.tenantId === tenantId ? entry.product.unit : "units") + " · unit cost " +
                new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(entry.unitCost))),
              detailField("Line total", entry.lineTotal, "money"),
              detailField("Quantity received", entry.receivedQuantity, "quantity"),
            ])),
            detailSection("Goods receipts", row.receipts.map((entry) =>
              detailField(entry.receiptNumber, entry.status, "status"))),
            detailSection("Supplier bills", row.bills.map((entry) =>
              detailField(entry.billNumber + " · " + enumText(entry.status), entry.total, "money"))),
          ],
        };
        break;
      }
      case "goods-receipts": {
        const row = await db.goodsReceipt.findFirst({
          where: { id, tenantId },
          include: {
            purchaseOrder: { select: { tenantId: true, orderNumber: true, supplier: { select: { tenantId: true, name: true } } } },
            items: { include: { product: { select: { tenantId: true, sku: true, name: true, unit: true } } } },
          },
        });
        if (row) detail = {
          type: "Goods receipt", title: row.receiptNumber, reference: row.purchaseOrder.tenantId === tenantId ? row.purchaseOrder.orderNumber : null, status: row.status,
          sections: [
            detailSection("Receipt details", [
              detailField("Status", row.status, "status"), detailField("Received at", row.receivedAt, "datetime"),
              detailField("Purchase order", row.purchaseOrder.tenantId === tenantId ? row.purchaseOrder.orderNumber : null), detailField("Supplier", row.purchaseOrder.tenantId === tenantId && row.purchaseOrder.supplier.tenantId === tenantId ? row.purchaseOrder.supplier.name : null),
              detailField("Notes", row.notes), detailField("Created", row.createdAt, "datetime"),
            ]),
            detailSection("Received items", row.items.flatMap((entry, index) => [
              detailField((index + 1) + ". " + (entry.product.tenantId === tenantId ? entry.product.name + " · " + entry.product.sku : "Received item"),
                Number(entry.quantity) + " " + (entry.product.tenantId === tenantId ? entry.product.unit : "units") + " · unit cost " +
                new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(entry.unitCost))),
              detailField("Received value", Number(entry.quantity) * Number(entry.unitCost), "money"),
            ])),
          ],
        };
        break;
      }
      case "deliveries": {
        const row = await db.delivery.findFirst({
          where: { id, tenantId },
          include: {
            order: { select: { tenantId: true, orderNumber: true, customer: { select: { tenantId: true, name: true, company: true } } } },
            assignedUser: { select: { tenantId: true, name: true, role: true } },
            items: { include: { product: { select: { tenantId: true, sku: true, name: true, unit: true } } } },
          },
        });
        if (row) detail = {
          type: "Delivery", title: row.deliveryNumber, reference: row.order.tenantId === tenantId ? row.order.orderNumber : null, status: row.status,
          sections: [
            detailSection("Delivery details", [
              detailField("Status", row.status, "status"), detailField("Scheduled", row.scheduledAt, "datetime"),
              detailField("Dispatched", row.dispatchedAt, "datetime"), detailField("Completed", row.completedAt, "datetime"),
              detailField("Assigned to", row.assignedUser?.tenantId === tenantId ? row.assignedUser.name + " · " + enumText(row.assignedUser.role) : null),
              detailField("Proof of delivery", row.proofOfDelivery), detailField("Failure reason", row.failureReason),
              detailField("Created", row.createdAt, "datetime"), detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Sales order and customer", [
              detailField("Sales order", row.order.tenantId === tenantId ? row.order.orderNumber : null),
              detailField("Customer", row.order.tenantId === tenantId && row.order.customer.tenantId === tenantId ? [row.order.customer.name, row.order.customer.company].filter(Boolean).join(" · ") : null),
            ]),
            detailSection("Delivery items", row.items.flatMap((entry, index) => [
              detailField((index + 1) + ". " + (entry.product.tenantId === tenantId ? entry.product.name + " · " + entry.product.sku : "Delivery item"),
                Number(entry.quantity) + " " + (entry.product.tenantId === tenantId ? entry.product.unit : "units")),
            ])),
          ],
        };
        break;
      }
      case "customer-receipts": {
        const row = await db.customerReceipt.findFirst({
          where: { id, tenantId },
          include: {
            customer: { select: { tenantId: true, name: true, company: true, email: true, phone: true, addresses: true } },
            allocations: { include: { invoice: { select: { id: true, tenantId: true, invoiceNumber: true, total: true } } } },
          },
        });
        if (row) detail = {
          type: "Customer receipt", title: row.receiptNumber, reference: row.customer.tenantId === tenantId ? row.customer.name : null, status: row.status,
          sections: [
            detailSection("Receipt details", [
              detailField("Status", row.status, "status"), detailField("Amount received", row.amount, "money"),
              detailField("Payment method", row.method, "status"), detailField("Transaction reference", row.reference),
              detailField("Date received", row.receivedAt, "datetime"), detailField("Notes", row.notes),
              detailField("Created", row.createdAt, "datetime"),
            ]),
            detailSection("Customer", [
              detailField("Name", row.customer.tenantId === tenantId ? row.customer.name : null), detailField("Company", row.customer.tenantId === tenantId ? row.customer.company : null),
              detailField("Email", row.customer.tenantId === tenantId ? row.customer.email : null), detailField("Phone", row.customer.tenantId === tenantId ? row.customer.phone : null),
              detailField("Address", row.customer.tenantId === tenantId ? addressText(row.customer.addresses) : null),
            ]),
            detailSection("Invoice allocations", row.allocations.filter((entry) => entry.invoice.tenantId === tenantId).map((entry) =>
              detailField(entry.invoice.invoiceNumber, entry.amount, "money",
                "/operations/invoices/" + encodeURIComponent(entry.invoice.id)))),
          ],
        };
        break;
      }
      case "supplier-bills": {
        const row = await db.supplierBill.findFirst({
          where: { id, tenantId },
          include: {
            supplier: { select: { tenantId: true, name: true, company: true, email: true, phone: true, address: true, taxId: true } },
            purchaseOrder: { select: { tenantId: true, orderNumber: true } },
            allocations: { include: { payment: { select: { tenantId: true, amount: true, method: true, reference: true, status: true, paidAt: true } } } },
          },
        });
        if (row) detail = {
          type: "Supplier bill", title: row.billNumber, reference: row.supplier.tenantId === tenantId ? row.supplier.name : null, status: row.status,
          sections: [
            detailSection("Bill details", [
              detailField("Status", row.status, "status"), detailField("Issue date", row.issueDate, "date"),
              detailField("Due date", row.dueDate, "date"), detailField("Bill total", row.total, "money"),
              detailField("Notes", row.notes), detailField("Purchase order", row.purchaseOrder?.tenantId === tenantId ? row.purchaseOrder.orderNumber : null),
              detailField("Created", row.createdAt, "datetime"), detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Supplier", [
              detailField("Name", row.supplier.tenantId === tenantId ? row.supplier.name : null), detailField("Company", row.supplier.tenantId === tenantId ? row.supplier.company : null),
              detailField("Email", row.supplier.tenantId === tenantId ? row.supplier.email : null), detailField("Phone", row.supplier.tenantId === tenantId ? row.supplier.phone : null),
              detailField("Address", row.supplier.tenantId === tenantId ? row.supplier.address : null), detailField("Tax / GST ID", row.supplier.tenantId === tenantId ? row.supplier.taxId : null),
            ]),
            detailSection("Allocated payments", row.allocations.filter((entry) => entry.payment.tenantId === tenantId).flatMap((entry) => [
              detailField([enumText(entry.payment.method), entry.payment.reference, enumText(entry.payment.status)].filter(Boolean).join(" · ") || "Payment", entry.amount, "money"),
              detailField("Payment date", entry.payment.paidAt, "datetime"),
            ])),
          ],
        };
        break;
      }
      case "supplier-payments": {
        const row = await db.supplierPayment.findFirst({
          where: { id, tenantId },
          include: {
            supplier: { select: { tenantId: true, name: true, company: true, email: true, phone: true } },
            allocations: { include: { bill: { select: { tenantId: true, billNumber: true, total: true, dueDate: true, status: true } } } },
          },
        });
        if (row) detail = {
          type: "Supplier payment", title: row.reference || "Supplier payment", reference: row.supplier.tenantId === tenantId ? row.supplier.name : null, status: row.status,
          sections: [
            detailSection("Payment details", [
              detailField("Status", row.status, "status"), detailField("Amount paid", row.amount, "money"),
              detailField("Payment method", row.method, "status"), detailField("Transaction reference", row.reference),
              detailField("Payment date", row.paidAt, "datetime"), detailField("Notes", row.notes),
              detailField("Created", row.createdAt, "datetime"),
            ]),
            detailSection("Supplier", [
              detailField("Name", row.supplier.tenantId === tenantId ? row.supplier.name : null), detailField("Company", row.supplier.tenantId === tenantId ? row.supplier.company : null),
              detailField("Email", row.supplier.tenantId === tenantId ? row.supplier.email : null), detailField("Phone", row.supplier.tenantId === tenantId ? row.supplier.phone : null),
            ]),
            detailSection("Bill allocations", row.allocations.filter((entry) => entry.bill.tenantId === tenantId).map((entry) =>
              detailField(entry.bill.billNumber + " · " + enumText(entry.bill.status), entry.amount, "money"))),
          ],
        };
        break;
      }
      case "inventory": {
        const row = await db.inventoryMovement.findFirst({
          where: { id, tenantId },
          include: { product: { select: { tenantId: true, sku: true, name: true, unit: true } } },
        });
        if (row) detail = {
          type: "Stock movement", title: row.product.tenantId === tenantId ? row.product.name : "Stock movement", reference: row.product.tenantId === tenantId ? row.product.sku : null, status: enumText(row.movementType),
          sections: [detailSection("Movement details", [
            detailField("Product", row.product.tenantId === tenantId ? row.product.name : null), detailField("SKU", row.product.tenantId === tenantId ? row.product.sku : null),
            detailField("Movement type", row.movementType, "status"), detailField("Quantity", row.quantity, "quantity"),
            detailField("Unit cost", row.unitCost, "money"), detailField("Reference type", enumText(row.referenceType)),
            detailField("Notes / reason", row.notes), detailField("Recorded", row.createdAt, "datetime"),
          ])],
        };
        break;
      }
      case "customer-follow-ups": {
        const row = await db.customerFollowUp.findFirst({
          where: { id, tenantId },
          include: {
            customer: { select: { tenantId: true, name: true, company: true, email: true, phone: true } },
            assignedUser: { select: { tenantId: true, name: true, role: true } },
          },
        });
        if (row) detail = {
          type: "Customer follow-up", title: row.title, status: row.status,
          sections: [
            detailSection("Follow-up details", [
              detailField("Status", row.status, "status"), detailField("Due date", row.dueAt, "datetime"),
              detailField("Channel", enumText(row.channel)), detailField("Notes", row.notes),
              detailField("Assigned staff member", row.assignedUser?.tenantId === tenantId ? row.assignedUser.name + " · " + enumText(row.assignedUser.role) : null),
              detailField("Created", row.createdAt, "datetime"), detailField("Last updated", row.updatedAt, "datetime"),
            ]),
            detailSection("Customer", [
              detailField("Name", row.customer.tenantId === tenantId ? row.customer.name : null), detailField("Company", row.customer.tenantId === tenantId ? row.customer.company : null),
              detailField("Email", row.customer.tenantId === tenantId ? row.customer.email : null), detailField("Phone", row.customer.tenantId === tenantId ? row.customer.phone : null),
            ]),
          ],
        };
        break;
      }
      case "ledger": {
        const row = await db.ledgerEntry.findFirst({
          where: { id, tenantId },
          include: {
            customer: { select: { tenantId: true, name: true, company: true } },
            supplier: { select: { tenantId: true, name: true, company: true } },
          },
        });
        if (row) detail = {
          type: "Ledger entry", title: row.description,
          reference: row.customer?.tenantId === tenantId ? row.customer.name : row.supplier?.tenantId === tenantId ? row.supplier.name : null, status: "Posted",
          sections: [
            detailSection("Accounting entry", [
              detailField("Description", row.description), detailField("Entry type", enumText(row.entryType)),
              detailField("Reference type", enumText(row.referenceType)), detailField("Debit", row.debit, "money"),
              detailField("Credit", row.credit, "money"), detailField("Posted at", row.postedAt, "datetime"),
              detailField("Created", row.createdAt, "datetime"),
            ]),
            detailSection("Related party", [
              detailField("Customer", row.customer?.tenantId === tenantId ? [row.customer.name, row.customer.company].filter(Boolean).join(" · ") : null),
              detailField("Supplier", row.supplier?.tenantId === tenantId ? [row.supplier.name, row.supplier.company].filter(Boolean).join(" · ") : null),
            ]),
          ],
        };
        break;
      }
      default:
        return fail("Full details are not supported for this record type.", 404);
    }

    if (!detail) return fail("Record not found in this workspace.", 404);
    const settings = await db.businessSettings.findUnique({ where: { tenantId }, select: { currency: true } });
    detail.currency = settings?.currency || "INR";
    return Response.json({ data: detail }, {
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("Operations detail read failed.", resource, (error as { code?: string })?.code || "UNKNOWN");
    return fail("Could not load this record's details.", 500);
  }
}
