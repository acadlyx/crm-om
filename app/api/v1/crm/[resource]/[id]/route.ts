import { z } from "zod";
import { isSameOriginRequest } from "@/lib/security/http";
import { Prisma } from "@/generated/prisma/client";
import { invoiceStatusFromBalance } from "@/lib/operations/finance";
import { requireWorkspaceAccess, writeAuditEvent } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { db } from "@/lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) return Response.json({ error: { message: access.message } }, { status: access.status });
  const { resource, id } = await context.params;
  const permission = await requireWorkspacePermission(access, resource, "update");
  if (!permission.ok) return Response.json({ error: { message: permission.message } }, { status: permission.status });
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: { message: "Invalid record identifier." } }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: { message: "Invalid update." } }, { status: 400 });

  try {
    let updated: { count: number } | null = null;
    if (resource === "payments") {
      if (access.user.role !== "TENANT_ADMIN" && access.user.role !== "PLATFORM_ADMIN") {
        return Response.json({ error: { message: "Only the business owner can reverse a posted payment." } }, { status: 403 });
      }
      const parsed = z.object({ status: z.literal("REVERSED"), reason: z.string().trim().min(3).max(1000) }).strict().safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: "A reversal reason of at least 3 characters is required." } }, { status: 400 });
      const result = await db.$transaction(async (tx) => {
        const payment = await tx.payment.findFirst({
          where: { id, tenantId: access.tenantId },
          include: {
            invoice: {
              select: {
                id: true, customerId: true, total: true, dueDate: true, status: true,
                payments: { select: { id: true, amount: true, status: true } },
                receiptAllocations: { select: { amount: true, receipt: { select: { status: true } } } },
              },
            },
          },
        });
        if (!payment) return { kind: "NOT_FOUND" as const };
        if (payment.status === "REVERSED") return { kind: "ALREADY_REVERSED" as const };
        if (payment.status !== "POSTED") return { kind: "NOT_POSTED" as const };

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "REVERSED", notes: [payment.notes, "Reversal: " + parsed.data.reason].filter(Boolean).join("\n") },
        });

        const legacyPaid = payment.invoice.payments
          .filter((entry) => entry.status === "POSTED" && entry.id !== payment.id)
          .reduce((sum, entry) => sum + Number(entry.amount), 0);
        const allocatedPaid = payment.invoice.receiptAllocations
          .filter((entry) => entry.receipt.status === "POSTED")
          .reduce((sum, entry) => sum + Number(entry.amount), 0);
        const paidAfter = legacyPaid + allocatedPaid;
        const nextStatus = invoiceStatusFromBalance({
          total: payment.invoice.total,
          paid: paidAfter,
          dueDate: payment.invoice.dueDate,
          wasDraft: payment.invoice.status === "DRAFT",
        });
        await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: nextStatus } });
        await tx.ledgerEntry.create({
          data: {
            tenantId: access.tenantId, customerId: payment.invoice.customerId,
            entryType: "CUSTOMER_PAYMENT_REVERSAL", referenceType: "PAYMENT", referenceId: payment.id,
            description: "Reversal of payment against invoice " + payment.invoiceId,
            debit: payment.amount, credit: 0, idempotencyKey: "payment-reversal-" + payment.id,
            createdByUserId: access.user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: access.user.id, action: "CUSTOMER_PAYMENT_REVERSED",
            entityType: "Payment", entityId: payment.id,
            metadata: { invoiceId: payment.invoiceId, amount: Number(payment.amount), reason: parsed.data.reason },
          },
        });
        return { kind: "REVERSED" as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (result.kind === "NOT_FOUND") return Response.json({ error: { message: "Payment not found in this workspace." } }, { status: 404 });
      if (result.kind === "ALREADY_REVERSED") return Response.json({ error: { message: "This payment was already reversed." } }, { status: 409 });
      if (result.kind === "NOT_POSTED") return Response.json({ error: { message: "Only a posted payment can be reversed." } }, { status: 409 });
      return Response.json({ data: { id, status: "REVERSED" } });
    }

    if (resource === "leads" && body.status === "CONVERTED") {
      const conversion = await db.$transaction(async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id, tenantId: access.tenantId },
          select: { id: true, fullName: true, company: true, email: true, phone: true, status: true },
        });
        if (!lead) return null;
        if (lead.status === "CONVERTED") return { customerId: null, alreadyConverted: true };
        const matchingCustomer = lead.email
          ? await tx.customer.findFirst({ where: { tenantId: access.tenantId, email: lead.email }, select: { id: true } })
          : null;
        const customer = matchingCustomer || await tx.customer.create({
          data: {
            tenantId: access.tenantId,
            name: lead.fullName,
            company: lead.company,
            email: lead.email,
            phone: lead.phone,
            notes: "Converted from a CRM lead.",
          },
          select: { id: true },
        });
        await tx.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED" } });
        return { customerId: customer.id, alreadyConverted: false };
      });
      if (!conversion) return Response.json({ error: { message: "Lead not found in this workspace." } }, { status: 404 });
      await writeAuditEvent({
        actorUserId: access.user.id,
        action: "CONVERT_LEAD",
        entityType: "LEAD",
        entityId: id,
        metadata: { customerId: conversion.customerId },
      });
      return Response.json({ data: { id, updated: true, ...conversion } });
    }

    if (resource === "customers") {
      const parsed = z.object({
        name: z.string().trim().min(1).max(160).optional(),
        company: z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().trim().max(200).optional()),
        email: z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().trim().email().max(320).optional()),
        phone: z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().trim().max(40).optional()),
        address: z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().trim().max(1000).optional()),
        creditLimit: z.coerce.number().finite().min(0).max(9999999999).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Credit limits may have at most two decimal places.").optional(),
        paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
        notes: z.preprocess((value) => value === "" || value === null ? undefined : value, z.string().trim().max(2000).optional()),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      }).strict().safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: parsed.error.issues[0]?.message || "Check customer details." } }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if ("name" in body) patch.name = parsed.data.name;
      if ("company" in body) patch.company = parsed.data.company ?? null;
      if ("email" in body) patch.email = parsed.data.email?.toLowerCase() ?? null;
      if ("phone" in body) patch.phone = parsed.data.phone ?? null;
      if ("address" in body) patch.addresses = parsed.data.address ? [parsed.data.address] : [];
      if ("creditLimit" in body) patch.creditLimit = parsed.data.creditLimit ?? 0;
      if ("paymentTermsDays" in body) patch.paymentTermsDays = parsed.data.paymentTermsDays ?? 0;
      if ("notes" in body) patch.notes = parsed.data.notes ?? null;
      if ("status" in body) patch.status = parsed.data.status;
      if (Object.keys(patch).length === 0) return Response.json({ error: { message: "Supply at least one editable customer field." } }, { status: 400 });
      updated = await db.customer.updateMany({ where: { id, tenantId: access.tenantId }, data: patch as never });
    } else if (resource === "leads") {
      const parsed = z.object({ status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"]) }).safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: "Choose a valid lead status." } }, { status: 400 });
      updated = await db.lead.updateMany({ where: { id, tenantId: access.tenantId }, data: { status: parsed.data.status } });
    } else if (resource === "deals") {
      const parsed = z.object({ stage: z.enum(["QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]) }).safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: "Choose a valid deal stage." } }, { status: 400 });
      updated = await db.deal.updateMany({
        where: { id, tenantId: access.tenantId },
        data: { stage: parsed.data.stage, closedAt: parsed.data.stage === "WON" || parsed.data.stage === "LOST" ? new Date() : null },
      });
    } else if (resource === "tasks") {
      const parsed = z.object({ status: z.enum(["TODO", "IN_PROGRESS", "DONE"]) }).safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: "Choose a valid task status." } }, { status: 400 });
      updated = await db.task.updateMany({ where: { id, tenantId: access.tenantId }, data: { status: parsed.data.status } });
    } else if (resource === "expenses") {
      const parsed = z.object({ status: z.enum(["PLANNED", "PAID"]) }).safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: "Choose a valid expense status." } }, { status: 400 });
      updated = await db.expense.updateMany({ where: { id, tenantId: access.tenantId }, data: { status: parsed.data.status } });
    } else {
      return Response.json({ error: { message: "This record type cannot be updated here." } }, { status: 400 });
    }

    if (!updated?.count) return Response.json({ error: { message: "Record not found in this workspace." } }, { status: 404 });
    await writeAuditEvent({
      actorUserId: access.user.id,
      action: resource === "customers" && !("status" in body) ? "UPDATE_PROFILE" : "UPDATE_STATUS",
      entityType: resource.slice(0, -1).toUpperCase(),
      entityId: id,
      metadata: resource === "customers" ? { fields: Object.keys(body).sort() } : undefined,
    });
    return Response.json({ data: { id, updated: true } });
  } catch (error) {
    const known = error as { code?: string };
    console.error("CRM update failed:", resource, known?.code || "UNKNOWN");
    return Response.json({ error: { message: "Could not update this record." } }, { status: 500 });
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

  const supported = new Set(["leads", "deals", "customers", "invoices", "payments", "expenses", "tasks"]);
  if (!supported.has(resource)) return fail(404, "Delete is not available for this record type.");

  try {
    const result = await db.$transaction(async (tx) => {
      let entityType = resource.slice(0, -1).toUpperCase();
      if (resource === "leads") {
        const row = await tx.lead.findFirst({ where: { id, tenantId: access.tenantId }, include: { deals: { select: { id: true } } } });
        if (!row) return { kind: "NOT_FOUND" as const };
        if (row.status === "CONVERTED" || row.deals.length) return { kind: "IN_USE" as const, reason: "This lead has been converted or linked to a deal. Keep the history and update its status instead." };
        await tx.lead.delete({ where: { id: row.id } });
        entityType = "LEAD";
      } else if (resource === "deals") {
        const row = await tx.deal.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true, title: true, stage: true, value: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        await tx.deal.delete({ where: { id: row.id } });
        entityType = "DEAL";
      } else if (resource === "customers") {
        const row = await tx.customer.findFirst({
          where: { id, tenantId: access.tenantId },
          include: { _count: { select: { invoices: true, orders: true, receipts: true, deals: true, tasks: true, followUps: true, ledgerEntries: true, upiCollections: true } } },
        });
        if (!row) return { kind: "NOT_FOUND" as const };
        const related = Object.values(row._count).reduce((sum, count) => sum + count, 0);
        if (related) return { kind: "IN_USE" as const, reason: "This customer has linked invoices, orders, receipts, tasks, ledger entries, or payment requests. Mark the customer inactive instead to preserve history." };
        await tx.customer.delete({ where: { id: row.id } });
        entityType = "CUSTOMER";
      } else if (resource === "invoices") {
        const row = await tx.invoice.findFirst({
          where: { id, tenantId: access.tenantId },
          include: { payments: { select: { id: true } }, receiptAllocations: { select: { id: true } } },
        });
        if (!row) return { kind: "NOT_FOUND" as const };
        const ledger = await tx.ledgerEntry.findFirst({ where: { tenantId: access.tenantId, referenceType: "INVOICE", referenceId: row.id }, select: { id: true } });
        if (row.status !== "DRAFT" || row.payments.length || row.receiptAllocations.length || ledger) {
          return { kind: "IN_USE" as const, reason: "Invoices that have been issued, paid, allocated or posted to a ledger are retained for audit. Cancel or correct them through the approved financial workflow." };
        }
        await tx.invoice.delete({ where: { id: row.id } });
        entityType = "INVOICE";
      } else if (resource === "payments") {
        const row = await tx.payment.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        return { kind: "IN_USE" as const, reason: "Payment history is immutable. Use the audited Reverse payment action instead of deleting it." };
      } else if (resource === "expenses") {
        const row = await tx.expense.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true, status: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        if (row.status !== "PLANNED") return { kind: "IN_USE" as const, reason: "Paid expenses are financial history and cannot be deleted. Keep the record for audit." };
        await tx.expense.delete({ where: { id: row.id } });
        entityType = "EXPENSE";
      } else if (resource === "tasks") {
        const row = await tx.task.findFirst({ where: { id, tenantId: access.tenantId }, select: { id: true } });
        if (!row) return { kind: "NOT_FOUND" as const };
        await tx.task.delete({ where: { id: row.id } });
        entityType = "TASK";
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
    if (result.kind === "IN_USE") return fail(409, result.reason);
    return Response.json({ data: { id, deleted: true } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2003" || code === "P2014") return fail(409, "This record is linked to existing business history and cannot be deleted.");
    if (code === "P2034") return fail(409, "Another transaction changed this record. Refresh the list and retry.");
    console.error("CRM delete failed.", resource, code || "UNKNOWN");
    return fail(500, "Could not delete the record. No intentional data change was made; refresh and retry.");
  }
}
