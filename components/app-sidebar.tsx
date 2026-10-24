import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import type { Branding } from "@/lib/branding/defaults";
import {
  Activity, Bell, BookOpen, Boxes, Building2, CheckSquare, ClipboardList,
  ContactRound, CreditCard, FileText, Gauge, HandCoins, KanbanSquare, Package,
  Palette, ShieldCheck, ShoppingCart, Truck, Users, Wallet,
} from "lucide-react";

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
        <Link className="sidebar-link" href="/dashboard"><Gauge size={17} aria-hidden="true" />Overview</Link>
        {isPlatformAdmin && !tenantId && <Link className="sidebar-link" href="/platform-settings/workspaces"><Building2 size={17} aria-hidden="true" />Business workspaces</Link>}

        {isBusinessUser && <>
          <p className="sidebar-section-label">CUSTOMER RELATIONSHIPS</p>
          <Link className="sidebar-link" href="/crm/customers"><Users size={17} aria-hidden="true" />Customers</Link>
          {canSales && <>
            <Link className="sidebar-link" href="/crm/leads"><ContactRound size={17} aria-hidden="true" />Leads</Link>
            <Link className="sidebar-link" href="/crm/deals"><KanbanSquare size={17} aria-hidden="true" />Sales pipeline</Link>
          </>}

          {(canSales || canDelivery) && <>
            <p className="sidebar-section-label">SALES & FULFILMENT</p>
            {canSales && <Link className="sidebar-link" href="/operations/sales-orders"><ShoppingCart size={17} aria-hidden="true" />Orders & sales</Link>}
            {canDelivery && <Link className="sidebar-link" href="/operations/deliveries"><Truck size={17} aria-hidden="true" />Deliveries</Link>}
            {canSales && <Link className="sidebar-link" href="/crm/invoices"><FileText size={17} aria-hidden="true" />Customer invoices</Link>}
          </>}

          {(canInventory || canSupplierPurchases) && <>
            <p className="sidebar-section-label">PRODUCTS & PURCHASING</p>
            {(canInventory || canDelivery) && <Link className="sidebar-link" href="/operations/products"><Package size={17} aria-hidden="true" />Products & inventory</Link>}
            {canSupplierPurchases && <Link className="sidebar-link" href="/operations/suppliers"><Building2 size={17} aria-hidden="true" />Suppliers</Link>}
            {canSupplierPurchases && <Link className="sidebar-link" href="/operations/purchase-orders"><ClipboardList size={17} aria-hidden="true" />Purchase orders</Link>}
            {canInventory && <Link className="sidebar-link" href="/operations/goods-receipts"><Boxes size={17} aria-hidden="true" />Goods receipts</Link>}
            {(canInventory || canFinance) && <Link className="sidebar-link" href="/operations/inventory"><BookOpen size={17} aria-hidden="true" />Stock movement ledger</Link>}
          </>}

          {(canCollections || canFinance) && <>
            <p className="sidebar-section-label">MONEY & ACCOUNTS</p>
            {canCollections && <Link className="sidebar-link" href="/crm/payments"><HandCoins size={17} aria-hidden="true" />Payments received</Link>}
            {canCollections && <Link className="sidebar-link" href="/operations/customer-receipts"><CreditCard size={17} aria-hidden="true" />Receipts & allocations</Link>}
            {canFinance && <Link className="sidebar-link" href="/operations/supplier-bills"><FileText size={17} aria-hidden="true" />Supplier bills</Link>}
            {canFinance && <Link className="sidebar-link" href="/operations/supplier-payments"><Wallet size={17} aria-hidden="true" />Supplier payments</Link>}
            {canFinance && <Link className="sidebar-link" href="/operations/ledger"><BookOpen size={17} aria-hidden="true" />Ledgers & accounts</Link>}
            {canFinance && <Link className="sidebar-link" href="/crm/expenses"><Wallet size={17} aria-hidden="true" />Expenses</Link>}
            {(canCollections || canFinance || canSales) && <Link className="sidebar-link" href="/crm/reports"><Activity size={17} aria-hidden="true" />Reports & intelligence</Link>}
          </>}

          {canFollowUp && <>
            <p className="sidebar-section-label">FOLLOW-UPS</p>
            <Link className="sidebar-link" href="/operations/customer-follow-ups"><CheckSquare size={17} aria-hidden="true" />Customer follow-ups</Link>
            <Link className="sidebar-link" href="/crm/tasks"><ClipboardList size={17} aria-hidden="true" />Tasks</Link>
          </>}

          {isOwner && <>
            <p className="sidebar-section-label">OWNER CONTROLS</p>
            <Link className="sidebar-link" href="/operations/permissions"><ShieldCheck size={17} aria-hidden="true" />Team & permissions</Link>
            <Link className="sidebar-link" href="/settings/business"><Building2 size={17} aria-hidden="true" />Business settings</Link>
          </>}
        </>}

        <p className="sidebar-section-label">ACCOUNT</p>
        <Link className="sidebar-link" href="/notifications"><Bell size={17} aria-hidden="true" />Notifications & activity</Link>
        {isPlatformAdmin && <Link className="sidebar-link" href="/platform-settings/branding"><Palette size={17} aria-hidden="true" />Platform branding</Link>}
        {isPlatformAdmin && !tenantId && <Link className="sidebar-link" href="/platform-settings/workspaces"><Building2 size={17} aria-hidden="true" />Business workspaces</Link>}
      </nav>
      <LogoutButton />
    </aside>
  );
}
