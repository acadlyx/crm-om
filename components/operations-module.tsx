"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CheckCircle2, LoaderCircle,
  Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- One API component renders several resource-specific Prisma payloads; every write is validated server-side.
type Row = Record<string, any> & { id: string };
type Catalogs = {
  customers: Row[]; invoices: Row[]; products: Row[]; suppliers: Row[];
  salesOrders: Row[]; purchaseOrders: Row[]; supplierBills: Row[]; team: Row[];
};
type Column = { key: string; label: string };

const defaultCatalogs: Catalogs = {
  customers: [], invoices: [], products: [], suppliers: [], salesOrders: [], purchaseOrders: [], supplierBills: [], team: [],
};

const moduleConfig: Record<string, { title: string; columns: Column[]; empty: string; writable: boolean }> = {
  products: { title: "Products & inventory", columns: [
    { key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "category", label: "Category" }, { key: "unit", label: "Unit" },
    { key: "description", label: "Description" }, { key: "stockOnHand", label: "On hand" }, { key: "reorderLevel", label: "Reorder at" },
    { key: "purchaseCost", label: "Purchase cost" }, { key: "sellingPrice", label: "Selling price" }, { key: "status", label: "Status" },
    { key: "createdAt", label: "Created" }, { key: "updatedAt", lab¶»§q«^