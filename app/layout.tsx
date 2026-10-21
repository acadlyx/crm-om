import type { Metadata } from "next";
import { getPlatformBranding } from "@/lib/branding/service";
import "./globals.css";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getPlatformBranding();
  return {
    title: { default: brand.productName, template: "%s | " + brand.productName },
    description: brand.productTagline,
    icons: brand.faviconUrl ? { icon: [{ url: brand.faviconUrl }] } : undefined,
  };
}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brand = await getPlatformBranding();
  return <html lang="en"><body style={{ "--brand-primary": brand.primaryColor } as React.CSSProperties}>{children}</body></html>;
}
