import type { Metadata } from "next";
import { getPlatformBranding, cacheBustedAssetUrl } from "@/lib/branding/service";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPlatformBranding();
  const favicon = cacheBustedAssetUrl(branding.faviconUrl, branding.updatedAt);
  return {
    title: { default: branding.productName, template: "%s | " + branding.productName },
    description: branding.productTagline,
    applicationName: branding.productName,
    icons: favicon ? { icon: [{ url: favicon }, { url: "/icon.svg" }] } : { icon: "/icon.svg" },
    other: { "theme-color": branding.primaryColor },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const branding = await getPlatformBranding();
  return <html lang="en"><body style={{ "--brand-primary": branding.primaryColor } as React.CSSProperties}>{children}</body></html>;
}
