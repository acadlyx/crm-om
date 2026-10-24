"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import type { Branding } from "@/lib/branding/defaults";
import {
  Activity, Bell, BookOpen, Boxes, Building2, CheckSquare, ClipboardList,
  ContactRound, CreditCard, FileText, Gauge, HandCoins, KanbanSquare, Package, QrCode,
  Palette, ShieldCheck, ShoppingCart, Truck, Users, Wallet, Menu, X,
} from "lucide-react";

export function AppSidebar({ branding, role, tenantId }: { branding: Branding; role: string; tenantId?: string | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const isPlatformAdmin = role === "PLATFORM_ADMIN";
  const isBusinessUser = !!tenantId && [
    "PLATFORM_ADMIN", "TENANT_ADMIN", "STAFF", "SALES", "DELIVERY",
    "COLLECTIONS", "INVENTORY_MANAGER", "ACCOUNTANT",
  ].includes(role);
  const isOwner = role === "TENANT_ADMIN" || (isPlatformAdmin && !!tenantId);
  const canSales = isOwner || role === "SALES";
  const canDelivery = isOwner || role === "DELIVERY";
  const canInventory = isOwner || role === "INVENTORY_MANAGER";
  cons¶»§q«^