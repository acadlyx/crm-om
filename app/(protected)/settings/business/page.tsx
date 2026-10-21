import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function BusinessSettingsPage() {
 const session=await getServerSession(authOptions);
 if(!session?.user?.email)redirect("/login");
 if(!session.user.tenantId)return <><h1>Business settings</h1><section className="card">This account is not associated with a tenant.</section></>;
 const settings=await db.businessSettings.findUnique({where:{tenantId:session.user.tenantId}});
 return <><h1 style={{fontSize:30}}>Business settings</h1><section className="card"><p><strong>Business name:</strong> {settings?.businessName??"Not configured"}</p><p className="muted">Business name, logo, contact details and invoice identity belong to your tenant and never alter the global product brand.</p><p>Use the tenant settings API to update this business identity.</p></section></>;
}
