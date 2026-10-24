import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import type { Branding } from "@/lib/branding/defaults";
import {
  Activity, Bell, Building2, CheckSquare, CircleDollarSign, ContactRound,
  FileText, Gauge, HandCoins, KanbanSquare, Palette, Users, Wallet,
} from "lucide-react";

export function AppSidebar({ branding, role }: { branding: Branding; role: string }) {
  const isPlatformAdmin = role === "PLATFORM_ADMIN";
  const isBusinessUser = role === "TENANT_ADMIN" || role === "STAFF";

  return (
    <aside className="sidebar">
      <BrandLogo branding={branding} />
      <nav aria-label="Main navigation" className="sidebar-nav">
        <p className="sidebar-section-label">WORKSPACE</p>
        <Link className="sidebar-link" href="/dashboard"><Gauge size={17} aria-hidden="true" />Dashboard</Link>
        {isPlatformAdmin && <Link className="sidebar-link" href="/platform-settings/workspaces"><Building2 size={17} aria-hidden="true" />Business workspaces</Link>}
        {isBusinessUser && <>
          <p className="sidebar-section-label">CUSTOMER RELATIONSHIPS</p>
          <Link className="sidebar-link" href="/crm/leads"><ContactRound size={17} aria-hidden="true" />Leads</Link>
          <Link className="sidebar-link" href="/crm/customers"><Users size={17} aria-hidden="true" />Customers</Link>
          <Link className="sidebar-link" href="/crm/deals"><KanbanSquare size={17} aria-hidden="true" />Sales pipeline</Link>
          <p className="sidebar-section-label">MONEY & OPERATIONS</p>
          <Link className="sidebar-link" href="/crm/invoices"><FileText size={17} aria-hidden="true" />Invoices</Link>
          <Link className="sidebar-link" href="/crm/payments"><HandCoins size={17} aria-hidden="true" />Payments received</Link>
          <Link className="sidebar-link" href="/crm/expenses"><Wallet size={17} aria-hidden="true" />Expenses</Link>
          <Link className="sidebar-link" href="/crm/tasks"><CheckSquare size={17} aria-hidden="true" />Tasks & follow-ups</Link>
          <Link className="sidebar-link" href="/crm/reports"><Activity size={17} aria-hidden="true" />Reports</Link>
          {role === "TENANT_ADMIN" && <Link className="sidebar-link" href="/settings/business"><Building2 size={17} aria-hidden="true" />Business settings</Link>}
        </>}
        <p className="sidebar-section-label">ACCOUNT</p>
        <Link className="sidebar-link" href="/notifications"><Bell size={17} aria-hidden="true" />Notifications</Link>
        {isPlatformAdmin && <Link className="sidebar-link" href="/platform-settings/branding"><Palette size={17} aria-hidden="true" />Platform branding</Link>}
      </nav>
    </aside>
  );
}
