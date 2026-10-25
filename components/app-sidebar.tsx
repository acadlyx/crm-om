"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import type { Branding } from "@/lib/branding/defaults";
import {
  Activity, Bell, BookOpen, Boxes, Building2, CheckSquare, ClipboardList,
  ContactRound, CreditCard, FileText, Gauge, HandCoins, KanbanSquare, Package, QrCode,
  Palette, ShieldCheck, ShoppingCart, Truck, Users, Wallet,
} from "lucide-react";


function SidebarLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className="sidebar-link" aria-current={isActive ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function AppSidebar({ branding, role, tenantId }: { branding: Branding; role: string; tenantId?: string | null }) {
  const isPlatformAdmin = role === "PLATFORM_ADMIN";
  const isBusinessUser = !!tenantId && [
    "PLATFORM_ADMIN", "TENANT_ADMIN", "STAFF", "SALES", "DELIVERY",
    "COLLECTIONS", "INVENTORY_MANAGER", "ACCOUNTANT",
  ].includes(role);
  const isOwner = role === "TENANT_ADMIN" || (isPlatformAdmin && !!tenantId);
  const canSales = isOwner || role === "SALES";
  const canDelivery = isOwner || role === "DELIVERY";
  const canInventory = isOwner || role === "INVENTORY_MANAGER";
  const canFinance = isOwner || role === "ACCOUNTANT";
  const canCollections = isOwner || role === "COLLECTIONS" || role === "ACCOUNTANT";
  const canSupplierPurchases = isOwner || role === "INVENTORY_MANAGER" || role === "ACCOUNTANT";
  const canFollowUp = isOwner || role === "SALES" || role === "COLLECTIONS" || role === "STAFF";

  return (
    <aside className="sidebar">
      <BrandLogo branding={branding} />
      <nav aria-label="Main navigation" className="sidebar-nav">
        <p className="sidebar-section-label">WORKSPACE</p>
        <SidebarLink href="/dashboard"><Gauge size={17} aria-hidden="true" />Overview</SidebarLink>
        {isPlatformAdmin && !tenantId && <SidebarLink href="/platform-settings/workspaces"><Building2 size={17} aria-hidden="true" />Business workspaces</SidebarLink>}

        {isBusinessUser && <>
          <p className="sidebar-section-label">CUSTOMER RELATIONSHIPS</p>
          <SidebarLink href="/crm/customers"><Users size={17} aria-hidden="true" />Customers</SidebarLink>
          {canSales && <>
            <SidebarLink href="/crm/leads"><ContactRound size={17} aria-hidden="true" />Leads</SidebarLink>
            <SidebarLink href="/crm/deals"><KanbanSquare size={17} aria-hidden="true" />Sales pipeline</SidebarLink>
          </>}

          {(canSales || canDelivery) && <>
            <p className="sidebar-section-label">SALES & FULFILMENT</p>
            {canSales && <SidebarLink href="/operations/sales-orders"><ShoppingCart size={17} aria-hidden="true" />Orders & sales</SidebarLink>}
            {canDelivery && <SidebarLink href="/operations/deliveries"><Truck size={17} aria-hidden="true" />Deliveries</SidebarLink>}
            {(canSales || canCollections || canFinance) && <SidebarLink href="/crm/invoices"><FileText size={17} aria-hidden="true" />Customer invoices</SidebarLink>}
          </>}

          {(canInventory || canSupplierPurchases) && <>
            <p className="sidebar-section-label">PRODUCTS & PURCHASING</p>
            {(canInventory || canDelivery) && <SidebarLink href="/operations/products"><Package size={17} aria-hidden="true" />Products & inventory</SidebarLink>}
            {canSupplierPurchases && <SidebarLink href="/operations/suppliers"><Building2 size={17} aria-hidden="true" />Suppliers</SidebarLink>}
            {canSupplierPurchases && <SidebarLink href="/operations/purchase-orders"><ClipboardList size={17} aria-hidden="true" />Purchase orders</SidebarLink>}
            {canInventory && <SidebarLink href="/operations/goods-receipts"><Boxes size={17} aria-hidden="true" />Goods receipts</SidebarLink>}
            {(canInventory || canFinance) && <SidebarLink href="/operations/inventory"><BookOpen size={17} aria-hidden="true" />Stock movement ledger</SidebarLink>}
          </>}

          {(canCollections || canFinance) && <>
            <p className="sidebar-section-label">MONEY & ACCOUNTS</p>
            {canCollections && <SidebarLink href="/crm/payments"><HandCoins size={17} aria-hidden="true" />Payments received</SidebarLink>}
            {canCollections && <SidebarLink href="/operations/customer-receipts"><CreditCard size={17} aria-hidden="true" />Receipts & allocations</SidebarLink>}
            {canCollections && <SidebarLink href="/operations/upi-collections"><QrCode size={17} aria-hidden="true" />UPI QR & reconciliation</SidebarLink>}
            {canFinance && <SidebarLink href="/operations/supplier-bills"><FileText size={17} aria-hidden="true" />Supplier bills</SidebarLink>}
            {canFinance && <SidebarLink href="/operations/supplier-payments"><Wallet size={17} aria-hidden="true" />Supplier payments</SidebarLink>}
            {canFinance && <SidebarLink href="/operations/ledger"><BookOpen size={17} aria-hidden="true" />Ledgers & accounts</SidebarLink>}
            {canFinance && <SidebarLink href="/crm/expenses"><Wallet size={17} aria-hidden="true" />Expenses</SidebarLink>}
            {(canCollections || canFinance || canSales) && <SidebarLink href="/crm/reports"><Activity size={17} aria-hidden="true" />Reports & intelligence</SidebarLink>}
          </>}

          {canFollowUp && <>
            <p className="sidebar-section-label">FOLLOW-UPS</p>
            <SidebarLink href="/operations/customer-follow-ups"><CheckSquare size={17} aria-hidden="true" />Customer follow-ups</SidebarLink>
            <SidebarLink href="/crm/tasks"><ClipboardList size={17} aria-hidden="true" />Tasks</SidebarLink>
          </>}

          {isOwner && <>
            <p className="sidebar-section-label">OWNER CONTROLS</p>
            <SidebarLink href="/operations/team"><Users size={17} aria-hidden="true" />Team management</SidebarLink>
            <SidebarLink href="/operations/permissions"><ShieldCheck size={17} aria-hidden="true" />Permissions</SidebarLink>
            <SidebarLink href="/settings/document-templates"><FileText size={17} aria-hidden="true" />Document templates</SidebarLink>
            <SidebarLink href="/settings/business"><Building2 size={17} aria-hidden="true" />Business settings</SidebarLink>
          </>}
        </>}

        <p className="sidebar-section-label">ACCOUNT</p>
        <SidebarLink href="/notifications"><Bell size={17} aria-hidden="true" />Notifications & activity</SidebarLink>
        {isPlatformAdmin && <SidebarLink href="/platform-settings/branding"><Palette size={17} aria-hidden="true" />Platform branding</SidebarLink>}
      </nav>
      <LogoutButton />
    </aside>
  );
}
