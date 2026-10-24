import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireWorkspaceAccess, writeAuditEvent } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { customerCreditExposure } from "@/lib/operations/credit";
import { invoiceStatusFromBalance } from "@/lib/operations/finance";

function fail(message: string, status = 400) { return Response.json({ error: { message } }, { status }); }
function n(value: unknown) { return Number(value ?? 0); }

async function audit(tx: Prisma.TransactionClient, actorUserId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await tx.auditLog.create({
    data: { actorUserId, action, entityType, entityId, metadata: JSON.parse(JSON.stringify(metadata)) },
  });
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
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        category: z.string().trim().max(120).nullable().optional(),
        reorderLevel: z.coerce.number().finite().min(0).max(1000000000).optional(),
        sellingPrice: z.coerce.number().finite().min(0).max(9999999999).optional(),
        purchaseCost: z.coerce.number().finite().min(0).max(9999999999).optional(),
      }).strict().safeParse(body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) return fail(parsed.success ? "No editable fields were supplied." : parsed.error.issues[0]?.message || "Invalid product update.");
      const updated = await db.product.updateMany({ where: { id, tenantId }, data: parsed.data });
      if (!updated.count) return fail("Product not found in this workspace.", 404);
      await writeAuditEvent({ actorUserId: actorId, action: "PRODUCT_UPDATED", entityType: "Product", entityId: id, metadata: parsed.data });
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
        const updated = await tx.delivery.update({ where: { id }, data: {
          status: nextStatus, completedAt: new Date(), proofOfDelivery: parsed.data.proofOfDelivery ?? null,
        } });
        const orderId = delivery.orderId;
        const orderItems = await tx.salesOrderItem.findMany({ where: { orderId } });
        const complete = orderItems.length > 0 && orderItems.every((item) => n(item.deliveredQuantity) >= n(item.quantity) - 0.000001);
        const anyDelivered = orderItems.some((item) => n(item.deliveredQuantity) > 0);
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
