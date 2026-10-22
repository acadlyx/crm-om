import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding/defaults";

type BrandingWrite = Omit<Branding, "updatedAt">;

function fromRecord(row: {
  productName: string; productTagline: string; logoUrl: string | null; faviconUrl: string | null;
  primaryColor: string; supportEmail: string | null; supportWebsite: string | null; footerText: string; updatedAt: Date;
}): Branding {
  return {
    productName: row.productName || DEFAULT_BRANDING.productName,
    productTagline: row.productTagline || DEFAULT_BRANDING.productTagline,
    logoUrl: row.logoUrl,
    faviconUrl: row.faviconUrl,
    primaryColor: row.primaryColor || DEFAULT_BRANDING.primaryColor,
    supportEmail: row.supportEmail,
    supportWebsite: row.supportWebsite,
    footerText: row.footerText || DEFAULT_BRANDING.footerText,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureSettings() {
  const existing = await db.platformSettings.findUnique({ where: { id: "global" } });
  if (existing) return existing;
  try {
    return await db.platformSettings.create({
      data: {
        id: "global",
        productName: DEFAULT_BRANDING.productName,
        productTagline: DEFAULT_BRANDING.productTagline,
        logoUrl: DEFAULT_BRANDING.logoUrl,
        faviconUrl: DEFAULT_BRANDING.faviconUrl,
        primaryColor: DEFAULT_BRANDING.primaryColor,
        supportEmail: DEFAULT_BRANDING.supportEmail,
        supportWebsite: DEFAULT_BRANDING.supportWebsite,
        footerText: DEFAULT_BRANDING.footerText,
      },
    });
  } catch (error) {
    const concurrent = await db.platformSettings.findUnique({ where: { id: "global" } });
    if (concurrent) return concurrent;
    throw error;
  }
}

/** Read directly from PostgreSQL for each dynamic request. No cross-request cache is used. */
export async function getPlatformBranding(): Promise<Branding> {
  try {
    return fromRecord(await ensureSettings());
  } catch (error) {
    if (process.env.NODE_ENV !== "test") console.error("Unable to load platform branding; using defaults.", error instanceof Error ? error.message : "unknown error");
    return { ...DEFAULT_BRANDING };
  }
}

export async function updatePlatformBranding(input: BrandingWrite, actorUserId: string): Promise<Branding> {
  const current = await ensureSettings();
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.platformSettings.update({ where: { id: "global" }, data: input });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "platform.branding.updated",
        entityType: "PlatformSettings",
        entityId: "global",
        metadata: {
          before: {
            productName: current.productName, productTagline: current.productTagline,
            logoUrl: current.logoUrl, faviconUrl: current.faviconUrl, primaryColor: current.primaryColor,
            supportEmail: current.supportEmail, supportWebsite: current.supportWebsite, footerText: current.footerText,
          },
          after: {
            productName: updated.productName, productTagline: updated.productTagline,
            logoUrl: updated.logoUrl, faviconUrl: updated.faviconUrl, primaryColor: updated.primaryColor,
            supportEmail: updated.supportEmail, supportWebsite: updated.supportWebsite, footerText: updated.footerText,
          },
        },
      },
    });
    return updated;
  });
  return fromRecord(row);
}

export async function updatePlatformBrandAsset(kind: "logo" | "favicon", url: string, actorUserId: string): Promise<Branding> {
  const current = await ensureSettings();
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.platformSettings.update({
      where: { id: "global" },
      data: kind === "logo" ? { logoUrl: url } : { faviconUrl: url },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "platform.branding." + kind + "-updated",
        entityType: "PlatformSettings",
        entityId: "global",
        metadata: {
          before: kind === "logo" ? { logoUrl: current.logoUrl } : { faviconUrl: current.faviconUrl },
          after: kind === "logo" ? { logoUrl: updated.logoUrl } : { faviconUrl: updated.faviconUrl },
        },
      },
    });
    return updated;
  });
  return fromRecord(row);
}

export function cacheBustedAssetUrl(url: string | null, updatedAt: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("brand_v", updatedAt);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function renderFooterText(template: string, productName: string, year = new Date().getFullYear()): string {
  return template.replaceAll("{year}", String(year)).replaceAll("{product_name}", productName);
}
