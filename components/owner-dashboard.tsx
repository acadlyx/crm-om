import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes,
  CalendarClock, CheckCircle2, ClipboardList, CreditCard, FileText, HandCoins,
  Package, ShoppingCart, Truck, Users, Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { sumPostedAmounts, sumPostedAllocations } from "@/lib/operations/finance";

type PeriodKey = "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "LAST_30_DAYS" | "THIS_MONTH" | "FY" | "CUSTOM";
type SearchParams = Record<string, string | string[] | undefined>;

function pickParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function midnight(date: Date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function endOfDay(date: Date) { const d = midnight(date); d.setDate(d.getDate() + 1); d.setMilliseconds(d.getMilliseconds() - 1); return d; }
function parseDate(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(value + "T00:00:00");
  return Number.isNaN(date.valueOf()) ? fallback : date;
}
function periodRange(params: SearchParams, financialYearStartMonth: number) {
  const now = new Date();
  const today = midnight(now);
  const requested = pickParam(params.period) as PeriodKey | undefined;
  const period: PeriodKey = ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "THIS_MONTH", "FY", "CUSTOM"].includes¶»§q«^