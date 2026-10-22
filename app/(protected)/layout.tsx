import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPlatformBranding, renderFooterText } from "@/lib/branding/service";
import { AppSidebar } from "@/components/app-sidebar";

export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  const brand = await getPlatformBranding();
  return <div className="shell">
    <AppSidebar branding={brand} role={session.user.role} />
    <main className="main-content">
      {children}
      <footer className="muted" style={{marginTop:40,borderTop:"1px solid #e8ebf0",paddingTop:16,fontSize:12}}>
        {renderFooterText(brand.footerText, brand.productName)}
      </footer>
    </main>
  </div>;
}
