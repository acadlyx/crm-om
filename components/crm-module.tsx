"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, LoaderCircle,
  Plus, Search, Trash2, X,
} from "lucide-react";

export type CrmField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "number" | "date" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  step?: string;
  options?: { label: string; value: string }[];
};

export type CrmColumn = { key: string; label: string };

type CrmRow = Record<string, unknown> & { id: string };

type Workflow = { field: "status" | "stage"; label: string; options: { label: string; value: string }[] };

function humanize(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "â€”";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(number);
}

function display(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") return "â€”";
  if (["amount", "total", "subtotal", "taxAmount", "paidAmount", "balance", "estimatedValue", "value", "creditLimit"].includes(key)) return formatMoney(value);
  if (key.toLowerCase().includes("date") || key === "createdAt" || key === "paidAt" || key === "spe¶»§q«^