import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/prisma/client";
import { hash } from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const databaseHost = new URL(databaseUrl).hostname;
if (databaseHost !== "127.0.0.1" && databaseHost !== "localhost") {
  throw new Error("Refusing to seed a load-test account outside the isolated local CI database.");
}

const email = process.env.LOAD_TEST_EMAIL || "loadtest.admin@example.test";
const password = process.env.LOAD_TEST_PASSWORD || "Load-Test-Only-Password-2026!";
if (password.length < 12) throw new Error("LOAD_TEST_PASSWORD must be at least 12 characters.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const tenant = await prisma.tenant.create({ data: { slug: "customer-load-sim-ci" } });
  const passwordHash = await hash(password, 10);
  await prisma.user.create({
    data: {
      name: "Isolated CRM Load Test Admin",
      email,
      passwordHash,
      role: UserRole.TENANT_ADMIN,
      tenantId: tenant.id,
    },
  });
  console.info("Created isolated CI load-test tenant and administrator.");
} finally {
  await prisma.$disconnect();
}
