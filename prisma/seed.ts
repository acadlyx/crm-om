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

  // Keep the tenant-scoped browser checks realistic in CI without creating
  // sample business data in normal environments. These credentials are set
  // only by the dedicated CI workflow.
  const e2eEmail = process.env.E2E_TENANT_ADMIN_EMAIL?.trim().toLowerCase();
  const e2ePassword = process.env.E2E_TENANT_ADMIN_PASSWORD;
  if (e2eEmail || e2ePassword) {
    if (!e2eEmail || !e2ePassword || e2ePassword.length < 12) {
      throw new Error("Both E2E_TENANT_ADMIN_EMAIL and a 12+ character E2E_TENANT_ADMIN_PASSWORD are required together.");
    }

    const tenant = await prisma.tenant.upsert({
      where: { slug: "e2e-business-workspace" },
      update: {},
      create: { slug: "e2e-business-workspace" },
    });

    await prisma.businessSettings.upsert({
      where: { tenantId: tenant.id },
      update: { businessName: "E2E Business Workspace" },
      create: { tenantId: tenant.id, businessName: "E2E Business Workspace" },
    });

    await prisma.user.upsert({
      where: { email: e2eEmail },
      update: {
        name: "E2E Workspace Administrator",
        role: UserRole.TENANT_ADMIN,
        passwordHash: await hash(e2ePassword, 12),
        tenantId: tenant.id,
        isActive: true,
      },
      create: {
        name: "E2E Workspace Administrator",
        email: e2eEmail,
        role: UserRole.TENANT_ADMIN,
        passwordHash: await hash(e2ePassword, 12),
        tenantId: tenant.id,
      },
    });

    console.info("Dedicated E2E workspace administrator upserted.");
  }
}
main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
