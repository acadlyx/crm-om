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
      :¶»§q«^