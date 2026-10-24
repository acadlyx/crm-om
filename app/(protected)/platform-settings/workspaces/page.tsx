import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Building2, Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { WorkspaceForm } from "@/components/workspace-form";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  const user = await db.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
  if (user?.role !== "PLATFORM_ADMIN") redirect("/dashboard");

  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      settings: { select: { businessName: true, contactEmail: true } },
      _count: { select: { users: true, customers: true, leads: true, invoices: true } },
    },
  });

  return (
    <div className="workspace-admin-page">
      <div className="dashboard-heading">
        <div><p className="dashboard-eyebrow">PLATFORM ADMINISTRATION</p><h1>Business workspaces</h1><p className="dashboard-subtitle">Create independent business accounts. Each owner sees only their own customers, sales and financial records.</p></div>
      </div>
      <section className="card workspace-admin-card"><WorkspaceForm /></section>
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
        ) : <div className="dashboard-empty"><span className="dashboard-empty-icon"><Building2 size={20} /></span><strong>No business workspaces yet</strong><p>Create the first workspace above. Its owner will get a separate business CRM account.</p></div>}
      </section>
    </div>
  );
}
