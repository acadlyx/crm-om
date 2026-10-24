import { redirect, notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { requireWorkspacePermission } from "@/lib/operations/permissions";
import { OperationsModule } from "@/components/operations-module";
import { UpiCollectionsModule } from "@/components/upi-collections-module";

export const dynamic = "force-dynamic";

const sections = new Set([
  "products", "suppliers", "sales-orders", "purchase-orders", "goods-receipts",
  "deliveries", "customer-receipts", "supplier-bills", "supplier-payments", "upi-collections",
  "inventory", "customer-follow-ups", "ledger", "permissions",
]);

export default async function OperationsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();

  const access = await requireWorkspaceAccess();
  if (!access.ok) redirect("/logintoprivatecrmbysyzent7456");

  const permission = await requireWorkspacePermission(access, section, "read");
  if (!permission.ok) {
    return (
      <section className="card operations-access-denied" role="status">
        <h1>Access restricted</h1>
        <p>{permission.message}</p>
        <p>Ask your business owner to review your role permissions.</p>
      </section>
    );
  }

  const owner = access.user.role === "TENANT_ADMIN" || access.user.role === "PLATFORM_ADMIN";
  const updatePermission = await requireWorkspacePermission(access, section, "update");
  const deletePermission = await requireWorkspacePermission(access, section, "delete");
  if (section === "upi-collections") return <UpiCollectionsModule canDelete={deletePermission.ok} />;
  return <OperationsModule resource={section} owner={owner} canUpdate={updatePermission.ok} canDelete={deletePermission.ok} />;
}
