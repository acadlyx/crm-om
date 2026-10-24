import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { isSameOriginRequest } from "@/lib/security/http";
import { outstandingBalance } from "@/lib/operations/finance";
import { isMissingUpiCollectionTable, UPI_SCHEMA_NOT_READY_MESSAGE } from "@/lib/operations/upi-schema-error";

export const dynamic = "force-dynamic";

const upiIdSchema = z.string().trim().min(5).max(256)
  .regex(/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/, "Enter a valid UPI ID such as name@bank");
const amountSchema = z.coerce.number().finite().positive().max(9999999999)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Amount must have at most two decimal places.");
const createSchema = z.object({
  upiId: upiIdSchema,
  amount: amountSchema,
  customerId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  payerName: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(160),
}).strict().refine((value) => Boolean(value.customerId || value.invoiceId), {
  message: "Choose a customer or invoice so the collection can be reconciled to the right workspace record.",
});

function jsonError(status: number, message: string) {
  return Response.j¶»§q«^