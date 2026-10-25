import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeDocumentTemplates } from "@/lib/documents/templates";
import { DocumentTemplatesBuilder } from "@/components/document-templates-builder";

export const dynamic = "force-dynamic";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function DocumentTemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/logintoprivatecrmbysyzent7456");
  if ((session.user.role !== "TENANT_ADMIN" && session.user.role !== "PLATFORM_ADMIN") || !session.user.tenantId) redirect("/dashboard");
  const settings = await db.businessSettings.findUnique({ where: { tenantId: session.user.tenantId } });
  if (!settings) redirect("/settings/business");
  const preferences = asObject(settings.preferences);

  return (
    <div className="workspace-admin-page">
      <DocumentTemplatesBuilder
        initialTemplates={normalizeDocumentTemplates(preferences.documentTemplates)}
        businessName={settings.businessName}
        businessAddress={settings.address}
        businessEmail={settings.contactEmail}
        businessPhone={settings.contactPhone}
        initialLogoUrl={settings.logoUrl}
      />
    </div>
  );
}
