import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DEFAULT_BRANDING } from "../lib/branding/defaults";

const url = process.env.TEST_DATABASE_URL;
const safeUrl = (() => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || parsed.pathname.toLowerCase().includes("test");
  } catch { return false; }
})();
const client = safeUrl && url ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) : null;
let original: Awaited<ReturnType<NonNullable<typeof client>["platformSettings"]["findUnique"]>> | null = null;
const testIt = it.skipIf(!safeUrl);

describe("platform branding PostgreSQL persistence", () => {
  beforeAll(async () => {
    if (client) original = await client.platformSettings.findUnique({ where: { id: "global" } });
  });
  testIt("a saved branding update is visible to a fresh database read", async () => {
    if (!client) return;
    const name = "Branding integration " + Date.now();
    await client.platformSettings.upsert({
      where: { id: "global" },
      create: {
        id: "global",
        productName: name,
        productTagline: DEFAULT_BRANDING.productTagline,
        logoUrl: DEFAULT_BRANDING.logoUrl,
        faviconUrl: DEFAULT_BRANDING.faviconUrl,
        primaryColor: DEFAULT_BRANDING.primaryColor,
        supportEmail: DEFAULT_BRANDING.supportEmail,
        supportWebsite: DEFAULT_BRANDING.supportWebsite,
        footerText: DEFAULT_BRANDING.footerText,
      },
      update: { productName: name },
    });
    const freshRead = await client.platformSettings.findUnique({ where: { id: "global" } });
    expect(freshRead?.productName).toBe(name);
  });
  afterAll(async () => {
    if (!client) return;
    if (original) {
      await client.platformSettings.update({
        where: { id: "global" },
        data: {
          productName: original.productName, productTagline: original.productTagline,
          logoUrl: original.logoUrl, faviconUrl: original.faviconUrl, primaryColor: original.primaryColor,
          supportEmail: original.supportEmail, supportWebsite: original.supportWebsite, footerText: original.footerText,
        },
      });
    } else {
      await client.platformSettings.deleteMany({ where: { id: "global" } });
    }
    await client.$disconnect();
  });
});
