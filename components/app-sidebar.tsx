import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import type { Branding } from "@/lib/branding/defaults";

export function AppSidebar({ branding, role }: { branding: Branding; role: string }) {
  return <aside className="sidebar">
    <BrandLogo branding={branding}/>
    <nav aria-label="Main navigation" style={{display:"grid",gap:12,marginTop:36}}>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/notifications">Notifications</Link>
      {role === "TENANT_ADMIN" && <Link href="/settings/business">Business identity</Link>}
      {role === "PLATFORM_ADMIN" && <Link href="/platform-settings/branding">Platform Settings · Branding</Link>}
    </nav>
  </aside>;
}
