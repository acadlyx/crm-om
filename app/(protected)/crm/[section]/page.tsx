import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { db } from "@/lib/db";
import { CrmModule, type CrmColumn, type CrmField } from "@/components/crm-module";
import { Activity, ArrowRight, CircleDollarSign, FileWarning, HandCoins, TrendingUp, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown> & { id: string };

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}
function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(value);
}
function humanize(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function CrmSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const access = await requireWorkspaceAccess();
  if (!access.ok) redirect("/logintoprivatecrmbysyzent7456");
  const tenantId = access.tenantId;
  const permission = await requireWorkspacePermission(access, section, "read");
  if (!permission.ok) notFound();
  const updatePermission = await requireWorkspacePermission(access, section, "update");
  const deletePermission = a¶»§q«^