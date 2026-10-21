import { getPlatformBranding } from "@/lib/branding/service";
export const dynamic = "force-dynamic";
export default async function DashboardPage() {
 const brand=await getPlatformBranding();
 return <><p className="muted" style={{marginTop:0}}>Workspace</p><h1 style={{fontSize:30,marginTop:4}}>Dashboard</h1><section className="card"><h2 style={{marginTop:0}}>Welcome to {brand.productName}</h2><p className="muted">Tenant business identity is managed separately in Business settings.</p></section></>;
}
