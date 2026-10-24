import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { TenantSettingsForm } from "@/components/tenant-settings-form";

export const dynamic = "force-dynamic";
export default async function BusinessSettingsPage() {
  const session=await getServerSession(authOptions);
  if(!session?.user?.email)redirect("/logintoprivatecrmbysyzent7456");
  if((session.user.role!=="TENANT_ADMIN"&&session.user.role!=="PLATFORM_ADMIN")||!session.user.tenantId)redirect("/dashboard");
  const settings=await db.businessSettings.findUnique({where:{tenantId:session.user.tenantId}});
  const initial=settings?{
    businessName:settings.businessName,logoUrl:settings.logoUrl,contactEmail:settings.contactEmail,
    contactPhone:settings.contactPhone,address:settings.address,invoicePrefix:settings.invoicePrefix,
    invoiceIdentity:(settings.invoiceIdentity??{}) as Record<string,unknown>,
    preferences:(settings.preferences??{}) as Record<string,unknown>,
    currency: settings.currency,
    timezone: settings.timezone,
    financialYearStartMonth: settings.financialYearStartMonth,
    inventoryCostingMethod: settings.inventoryCostingMethod as "WEIGHTED_AVERAGE",
    defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
  }:null;
  return <><p className="muted">Tenant settings</p><h1 style={{fontSize:30,marginTop:4}}>Business identity</h1><p className="muted">Manage your business name, logo, contact details and invoice settings. These never change the global product brand.</p><section className="card"><TenantSettingsForm initial={initial}/></section></>;
}
