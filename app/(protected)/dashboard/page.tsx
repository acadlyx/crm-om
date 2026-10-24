import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  FileWarning,
  HandCoins,
  Palette,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getPlatformBranding } from "@/lib/branding/service";
import { db } from "@/lib/db";
import { OwnerDashboard } from "@/components/owner-dashboard";

export const dynamic = "force-dynamic";

function humanize(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) redirect("/logintoprivatecrmbysyzent7456");

  const isPlatformAdmin = session.user.role === "PLATFORM_ADMIN";
  const tenantId = session.user.t¶»§q«^