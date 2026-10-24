import { z } from "zod";
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
      const parsed = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).safeParse(body);
      if (!parsed.success) return Response.json({ error: { message: "Choose a valid customer status." } }, { status: 400 });
      updated = await db.customer.updateMany({ where: { id, tenantId: access.tenantId }, data: { status: parsed.data.status } });
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
      action: "UPDATE_STATUS",
      entityType: resource.slice(0, -1).toUpperCase(),
      entityId: id,
    });
    return Response.json({ data: { id, updated: true } });
  } catch (error) {
    const known = error as { code?: string };
    console.error("CRM update failed:", resource, known?.code || "UNKNOWN");
    return Response.json({ error: { message: "Could not update this record." } }, { status: 500 });
  }
}
