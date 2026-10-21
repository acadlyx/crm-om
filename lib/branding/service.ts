import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding/defaults";

export async function getPlatformBranding(): Promise<Branding> {
  try {
    const row = await db.platformSettings.findUnique({ where: { id: "global" } });
    if (!row) return { ...DEFAULT_BRANDING };
    return {
      productName: row.productName || DEFAULT_BRANDING.productName,
      productTagline: row.productTagline || DEFAULT_BRANDING.productTagline,
      logoUrl: row.logoUrl, faviconUrl: row.faviconUrl,
      primaryColor: row.primaryColor || DEFAULT_BRANDING.primaryColor,
      supportEmail: row.supportEmail, supportWebsite: row.supportWebsite,
      footerText: row.footerText || DEFAULT_BRANDING.footerText,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("Platform branding read failed; using safe defaults.", error);
    return { ...DEFAULT_BRANDING };
  }
}
