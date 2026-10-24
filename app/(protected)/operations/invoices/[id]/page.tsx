import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPlatformBranding } from "@/lib/branding/service";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { BrandLogo } from "@/components/brand-logo";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function amount(value: unknown, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}
function date(value: Date | string) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "â€”" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function formatCustomerAddress(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(formatCustomerAddress).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(formatCustomerAddress).filter(Boolean).join(", ");
  }
  return "";
}

export default async function InvoiceDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspaceAccess();
  if (!access.ok) redirect("/loginto¶»§q«^