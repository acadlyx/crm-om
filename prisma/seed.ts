import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/prisma/client";
import { hash } from "bcryptjs";
import { DEFAULT_BRANDING } from "../lib/branding/defaults";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be available to the seed process."
    );
  }
  if (password.length < 12) {
    throw new Error("PLATFORM_ADMIN_PASSWORD must be at least 12 characters.");
  }
  const passwordHash = await hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {
      name: process.env.PLATFORM_ADMIN_NAME || "Platform Administrator",
      role: UserRole.PLATFORM_ADMIN,
      passwordHash,
      tenantId: null,
    },
    create: {
      email,
      passwordHash,
      name: process.env.PLATFORM_ADMIN_NAME || "Platform Administrator",
      role: UserRole.PLATFORM_ADMIN,
    },
  });
  console.info(`Platform admin upserted for ${email}.`);

  await prisma.platformSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
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
  console.info("Global platform branding settings ensured.");
}
main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
