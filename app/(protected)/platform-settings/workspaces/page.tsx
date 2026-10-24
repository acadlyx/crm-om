import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Building2, CircleAlert, Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { WorkspaceForm } from "@/components/workspace-form";

export const dynamic = "force-dynamic";

const crmMigration = "20261024000100_business_crm_core";

type WorkspaceRow = {
  id: string;
  slug: string;
  createdAt: Date;
  settings: { businessName: string; contactEmail: string | null } | null;
  _count: { users: number; customers: number; leads: number; invoices: number };
};

export default async function WorkspacesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  const user = await db.user.findUnique({ where: { email: session.user.email }, select: { role: true, name: true, email: true, tenantId: true } });
  if (user?.role !== "PLATFORM_ADMIN") redirect("/dashboard");

  let tenants: WorkspaceRow[] = [];
  let crmSchemaReady = true;

  try {
    tenants = await db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        settings: { select: { businessName: true, contactEmail: true } },
        _count: { select: { users: true, customers: true, leads: true, invoices: true } },
      },
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === "P2021") {
      crmSchemaReady = false;
    } else {
      throw error;
    }
  }

  return (
    <div className="workspace-admin-page">
      <div className="dashboard-heading">
        <div><p className="dashboard-eyebrow">PLATFORM ADMINISTRATION</p><h1>Business workspaces</h1><p className="dashboard-subtitle">Create independent business accounts. Each owner sees only their own customers, sales and financial records.</p></div>
      </div>
      {!crmSchemaReady ? (
        <section className="card workspace-list-card" aria-labelledby="crm-migration-required-title">
          <div className="workspace-migration-warning" role="alert">
            <span className="workspace-form-icon"><CircleAlert size={21} aria-hidden="true" /></span>
            <div>
              <p className="dashboard-eyebrow">DATABASE SETUP REQUIRED</p>
              <h2 id="crm-migration-required-title">CRM tables have not been created yet</h2>
              <p>The application is connected to the database, but the CRM migration is still pending. No existing records were deleted. Business workspace creation is temporarily disabled until the migration is applied.</p>
              <p className="workspace-migration-code">Migration: <code>{crmMigration}</code></p>
              <p>Run <code>npm run db:migrate</code> once against the production <code>DATABASE_URL</code>, confirm that the migration is applied, then reload this page.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="card workspace-admin-card"><WorkspaceForm currentAccount={{ name: user.name, email: user.email, hasWorkspace: !!user.tenantId }} /></section>
          <section className="card workspace-list-card">
            <div className="dashboard-panel-heading"><div><p className="dashboard-eyebrow">TENANT DIRECTORY</p><h2>Existing workspaces</h2></div><span className="dashboard-panel-count">{tenants.length} total</span></div>
            {tenants.length ? (
              <div className="workspace-table-wrap"><table className="workspace-table">
                <thead><tr><th>Business</th><th>Owner / contact</th><th>Users</th><th>Customers</th><th>Invoices</th><th>Created</th></tr></thead>
                <tbody>{tenants.map((tenant) => <tr key={tenant.id}>
                  <td><strong>{tenant.settings?.businessName || tenant.slug}</strong><span className="workspace-slug">{tenant.slug}</span></td>
                  <td>{tenant.settings?.contactEmail || "—"}</td>
                  <td><span className="workspace-count"><Users size={14} />{tenant._count.users}</span></td>
                  <td>{tenant._count.customers}</td>
                  <td>{tenant._count.invoices}</td>
                  <td>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(tenant.createdAt)}</td>
                </tr>)}</tbody>
              </table></div>
            ) : <div className="dashboard-empty"><span className="dashboard-empty-icon"><Building2 size={20} /></span><strong>No business workspaces yet</strong><p>Create the first workspace above. Its owner will receive a separate workspace and login.</p></div>}
          </section>
        </>
      )}
    </div>
  );
}
