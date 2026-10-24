"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, UserMinus, Users, X } from "lucide-react";
import { PasswordInput } from "@/components/password-input";

type TeamRole = "STAFF" | "SALES" | "DELIVERY" | "COLLECTIONS" | "INVENTORY_MANAGER" | "ACCOUNTANT";
type TeamMember = { id: string; name: string; email: string; role: TeamRole; isActive: boolean; createdAt: string };
const roles: Array<{ value: TeamRole; label: string; description: string }> = [
  { value: "SALES", label: "Sales", description: "Customers, leads, sales orders and follow-ups." },
  { value: "DELIVERY", label: "Delivery", description: "Assigned deliveries, dispatch and fulfilment updates." },
  { value: "COLLECTIONS", label: "Collections", description: "Customer follow-ups and authorized receipts." },
  { value: "INVENTORY_MANAGER", label: "Inventory manager", description: "Products, stock movements, purchase orders and receipts." },
  { value: "ACCOUNTANT", label: "Accountant", description: "Invoices, payments, bills, ledgers and reports." },
  { value: "STAFF", label: "Staff", description: "Read access to selected customer records and basic tasks." },
];
function niceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "â€”" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "¶»§q«^