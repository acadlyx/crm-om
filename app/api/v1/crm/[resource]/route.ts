import { z } from "zod";
import { requireWorkspaceAccess, writeAuditEvent } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { db } from "@/lib/db";

const blankToUndefined = (value: unknown) => value === "" || value === null ? undefined : value;
const optionalText = z.preprocess(blankToUndefined, z.string().trim().max(2000).optional());
const optionalEmail = z.preprocess(blankToUndefined, z.string().trim().email().max(320).optional());
const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
const optionalMoney = z.preprocess(blankToUndefined, z.coerce.number().finite().min(0).max(9999999999).optional());
const positiveMoney = z.coerce.number().finite().positive().max(9999999999);
const leadStatus = z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"]);
const dealStage = z.enum(["QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);
const paymentMethod = z.enum(["CASH", "BANK_TRANSFER", "CARD", "UPI", "CHEQUE", "OTHER"]);

const validators = {
  customers: z.object({
    name: z.string().trim().min(1).max(160),
    company: optionalText,
    email: optionalEmail,
    phone: optionalText,
    notes: optionalText,
  }),
  leads: z.object({
    fullName: z.string().trim().min(1).max(160),
    company: optionalText,
    email: optionalEmail,
    phone: optionalText,
    source: optionalText,
    status: z.preprocess(blankToUndefined, leadStatus.optional()),
    estimatedValue: optionalMoney,
    notes: optionalText,
  }),
  deals: z.object({
    title: z.string().trim().min(1).max(200),
    customerId: optionalText,
    leadId: optionalText,
    value: optionalMoney,
    stage: z.preprocess(blankToUndefined, dealStage.optional()),
    expectedCloseDate: optionalDate,
    notes: optionalText,
  }),
  invoices: z.object({
    customerId: z.string().uuid(),
    issueDate: optionalDate,
    dueDate: optionalDate,
    subtotal: positiveMoney,
    taxAmount: optionalMoney,
    notes: optionalText,
  }),
  payments: z.object({
    invoiceId: z.string().uuid(),
    amount: positiveMoney,
    method: paymentMethod,
    reference: optionalText,
    paidAt: optionalDate,
    notes: optionalText,
  }),
  expenses: z.object({
    title: z.string().trim().min(1).max(200),
    category: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
    amount: positiveMoney,
    spentAt: optionalDate,
    vendor: optionalText,
    method: z.preprocess(blankToUndefined, paymentMethod.optional()),
    status: z.preprocess(blankToUndefined, z.enum(["PLANNED", "PAID"]).optional()),
    notes: optionalText,
  }),
  tasks: z.object({
    title: z.string().trim().min(1).max(200),
    description: optionalText,
    dueDate: optionalDate,
    priority: z.preprocess(blankToUndefined, z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional()),
    status: z.preprocess(blankToUndefined, z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional()),
    customerId: optionalText,
  }),
};

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const item = value as { toNumber?: () => number; toFixed?: (digits?: number) => string };
    if (typeof item.toNumber === "function" && typeof item.toFixed === "function") return item.toNumber();
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serialize(nested)]));
  }
  return value;
}

async function getRows(resource: string, tenantId: string) {
  switch (resource) {
    case "customers":
      return db.customer.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    case "leads":
      return db.lead.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
    case "deals":
      return db.deal.findMany({
        where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100,
        include: { customer: { select: { id: true, name: true, company: true } }, lead: { select: { id: true, fullName: true, company: true } } },
      });
    case "invoices":
      return db.invoice.findMany({
        where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100,
        include: { customer: { select: { id: true, name: true, company: true } }, payments: { select: { amount: true, status: true } }, receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } } },
      });
    case "payments":
      return db.payment.findMany({
        where: { tenantId }, orderBy: { paidAt: "desc" }, take: 100,
        include: { invoice: { select: { invoiceNumber: true, customer: { select: { name: true, company: true } } } } },
      });
    case "expenses":
      return db.expense.findMany({ where: { tenantId }, orderBy: { spentAt: "desc" }, take: 100 });
    case "tasks":
      return db.task.findMany({
        where: { tenantId }, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }], take: 100,
        include: { customer: { select: { name: true } } },
      });
    default:
      return null;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ resource: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) {
    return Response.json({ error: { message: access.message } }, { status: access.status });
  }
  const { resource } = await context.params;
  const permission = await requireWorkspacePermission(access, resource, "read");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  try {
    const rows = await getRows(resource, access.tenantId);
    if (!rows) return Response.json({ error: { message: "Unknown CRM module." } }, { status: 404 });
    return Response.json({ data: serialize(rows) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error as { code?: string };
    console.error("CRM list failed:", resource, known?.code || "UNKNOWN");
    return Response.json({ error: { message: "Could not load these records." } }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) {
    return Response.json({ error: { message: access.message } }, { status: access.status });
  }
  const { resource } = await context.params;
  const permission = await requireWorkspacePermission(access, resource, "create");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  const validator = validators[resource as keyof typeof validators];
  if (!validator) return Response.json({ error: { message: "Unknown CRM module." } }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = validator.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: { message: parsed.error.issues[0]?.message || "Check the entered details." } }, { status: 400 });
  }
  // The selected Zod validator narrows and validates the resource-specific input at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = parsed.data as Record<string, any>;
  const tenantId = access.tenantId;

  try {
    let created: { id: string } | null = null;
    let auditRecorded = false;
    switch (resource) {
      case "customers":
        created = await db.customer.create({
          data: { tenantId, name: data.name, company: data.company ?? null, email: data.email?.toLowerCase() ?? null, phone: data.phone ?? null, notes: data.notes ?? null },
          select: { id: true },
        });
        break;
      case "leads":
        created = await db.lead.create({
          data: { tenantId, fullName: data.fullName, company: data.company ?? null, email: data.email?.toLowerCase() ?? null, phone: data.phone ?? null, source: data.source ?? null, status: data.status ?? "NEW", estimatedValue: data.estimatedValue ?? 0, notes: data.notes ?? null },
          select: { id: true },
        });
        break;
      case "deals": {
        if (data.customerId) {
          const customer = await db.customer.findFirst({ where: { id: data.customerId, tenantId }, select: { id: true } });
          if (!customer) return Response.json({ error: { message: "Select a customer from your own workspace." } }, { status: 400 });
        }
        if (data.leadId) {
          const lead = await db.lead.findFirst({ where: { id: data.leadId, tenantId }, select: { id: true } });
          if (!lead) return Response.json({ error: { message: "Select a lead from your own workspace." } }, { status: 400 });
        }
        created = await db.deal.create({
          data: { tenantId, title: data.title, customerId: data.customerId ?? null, leadId: data.leadId ?? null, value: data.value ?? 0, stage: data.stage ?? "QUALIFICATION", expectedCloseDate: data.expectedCloseDate ?? null, notes: data.notes ?? null },
          select: { id: true },
        });
        break;
      }
      case "invoices": {
        const issueDate = data.issueDate ?? new Date();
        const dueDate = data.dueDate ?? new Date(issueDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        const subtotal = Number(data.subtotal);
        const taxAmount = Number(data.taxAmount ?? 0);
        const total = Math.round((subtotal + taxAmount + Number.EPSILON) * 100) / 100;
        const invoiceNumber = "INV-" + issueDate.toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
        const result = await db.$transaction(async (tx) => {
          const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId }, select: { id: true } });
          if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
          const invoice = await tx.invoice.create({
            data: { tenantId, customerId: data.customerId, invoiceNumber, issueDate, dueDate, subtotal, taxAmount, total, status: "SENT", notes: data.notes ?? null },
            select: { id: true },
          });
          await tx.ledgerEntry.create({ data: {
            tenantId, customerId: customer.id, entryType: "SALES_INVOICE", referenceType: "INVOICE", referenceId: invoice.id,
            description: "Sales invoice " + invoiceNumber, debit: total, credit: 0, idempotencyKey: "invoice-" + invoice.id, createdByUserId: access.user.id,
          } });
          await tx.auditLog.create({ data: { actorUserId: access.user.id, action: "CREATE", entityType: "INVOICE", entityId: invoice.id, metadata: { invoiceNumber, total } } });
          return invoice;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        created = result;
        auditRecorded = true;
        break;
      }
      case "payments": {
        created = await db.$transaction(async (tx) => {
          const invoice = await tx.invoice.findFirst({
            where: { id: data.invoiceId, tenantId, status: { not: "CANCELLED" } },
            include: {
              payments: { select: { amount: true, status: true } },
              receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } },
            },
          });
          if (!invoice) throw new Error("INVOICE_NOT_FOUND");
          const legacyReceived = invoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + Number(payment.amount), 0);
          const allocatedReceived = invoice.receiptAllocations.filter((allocation) => allocation.receipt.status === "POSTED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
          const received = legacyReceived + allocatedReceived;
          const balance = Math.max(0, Number(invoice.total) - received);
          const amount = Number(data.amount);
          if (amount > balance + 0.005) throw new Error("PAYMENT_EXCEEDS_BALANCE");
          const payment = await tx.payment.create({
            data: { tenantId, invoiceId: invoice.id, amount, method: data.method, reference: data.reference ?? null, paidAt: data.paidAt ?? new Date(), notes: data.notes ?? null, status: "POSTED" },
            select: { id: true },
          });
          const paidAfter = received + amount;
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: paidAfter + 0.005 >= Number(invoice.total) ? "PAID" : "PARTIALLY_PAID" },
          });
          await tx.ledgerEntry.create({ data: {
            tenantId, customerId: invoice.customerId, entryType: "CUSTOMER_PAYMENT",
            referenceType: "PAYMENT", referenceId: payment.id, description: "Payment against invoice " + invoice.invoiceNumber,
            debit: 0, credit: amount, idempotencyKey: "payment-" + payment.id, createdByUserId: access.user.id,
          } });
          await tx.auditLog.create({ data: { actorUserId: access.user.id, action: "CUSTOMER_PAYMENT_POSTED", entityType: "Payment", entityId: payment.id, metadata: { invoiceId: invoice.id, amount } } });
          return payment;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        auditRecorded = true;
        break;
      }
      case "expenses": {
        created = await db.$transaction(async (tx) => {
          const expense = await tx.expense.create({
            data: { tenantId, title: data.title, category: data.category || "General", amount: data.amount, spentAt: data.spentAt ?? new Date(), vendor: data.vendor ?? null, method: data.method ?? "OTHER", status: data.status ?? "PAID", notes: data.notes ?? null },
            select: { id: true },
          });
          await tx.auditLog.create({ data: { actorUserId: access.user.id, action: "CREATE", entityType: "EXPENSE", entityId: expense.id, metadata: { amount: data.amount, category: data.category || "General" } } });
          return expense;
        });
        auditRecorded = true;
        break;
      }
      case "tasks": {
        if (data.customerId) {
          const customer = await db.customer.findFirst({ where: { id: data.customerId, tenantId }, select: { id: true } });
          if (!customer) return Response.json({ error: { message: "Select a customer from your own workspace." } }, { status: 400 });
        }
        created = await db.task.create({
          data: { tenantId, title: data.title, description: data.description ?? null, dueDate: data.dueDate ?? null, priority: data.priority ?? "MEDIUM", status: data.status ?? "TODO", customerId: data.customerId ?? null },
          select: { id: true },
        });
        break;
      }
    }

    if (created && !auditRecorded) {
      await writeAuditEvent({
        actorUserId: access.user.id,
        action: "CREATE",
        entityType: resource.slice(0, -1).toUpperCase(),
        entityId: created.id,
      });
    }
    return Response.json({ data: { id: created?.id } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "CUSTOMER_NOT_FOUND") return Response.json({ error: { message: "Select a customer from your own workspace." } }, { status: 400 });
    if (message === "INVOICE_NOT_FOUND") {
      return Response.json({ error: { message: "That invoice was not found in this workspace or cannot receive payments." } }, { status: 404 });
    }
    if (message === "PAYMENT_EXCEEDS_BALANCE") {
      return Response.json({ error: { message: "Payment is greater than the remaining invoice balance. Refresh the page and try again." } }, { status: 400 });
    }
    const known = error as { code?: string };
    console.error("CRM create failed:", resource, known?.code || "UNKNOWN");
    return Response.json({ error: { message: "Could not save this record. Check the details and try again." } }, { status: 500 });
  }
}
