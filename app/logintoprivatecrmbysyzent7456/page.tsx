import type { Metadata } from "next";
import { getPlatformBranding, renderFooterText } from "@/lib/branding/service";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getPlatformBranding();
  return {
    title: "Private sign in",
    description: brand.productTagline,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export default async function PrivateLoginPage() {
  const brand = await getPlatformBranding();
  return (
    <main className="private-login-page">
      <section className="card private-login-card">
        <BrandLogo branding={brand} />
        <p className="private-login-eyebrow">PRIVATE ACCESS</p>
        <h1>Sign in to your workspace</h1>
        <p className="muted private-login-description">Enter your account credentials to continue.</p>
        <LoginForm />
        <p className="muted private-login-footer">{renderFooterText(brand.footerText, brand.productName)}</p>
        {brand.supportEmail && <p className="muted private-login-support">Support: <a href={"mailto:" + brand.supportEmail}>{brand.supportEmail}</a></p>}
        {brand.supportWebsite && <p className="muted private-login-support"><a href={brand.supportWebsite} rel="noreferrer" target="_blank">Support website</a></p>}
      </section>
    </main>
  );
}
