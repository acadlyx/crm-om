import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPlatformBranding } from "@/lib/branding/service";
import { BrandingForm } from "@/components/branding-form";
export const dynamic = "force-dynamic";
export default async function BrandingPage() {
 const session=await getServerSession(authOptions);
 if(!session?.user?.email) redirect("/login");
 if(session.user.role!=="PLATFORM_ADMIN") redirect("/dashboard");
 const brand=await getPlatformBranding();
 return <><p className="muted">Platform Settings</p><h1 style={{fontSize:30,marginTop:4}}>Branding</h1><p className="muted">Manage global product identity. Tenant business details remain separate.</p><section className="card"><BrandingForm initial={brand}/></section></>;
}
