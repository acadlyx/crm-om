import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/crm/access";
import { TeamModule } from "@/components/team-module";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const access = await requireWorkspaceAccess();
  if (!access.ok) redirect("/logintoprivatecrmbysyzent7456");
  if (access.user.role !== "TENANT_ADMIN" && access.user.role !== "PLATFORM_ADMIN") {
    return <section className="card operations-access-denied"><h1>Access restricted</h1><p>Only the business owner can manage team accounts.</p></section>;
  }
  return <TeamModule />;
}
