import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getRuntimeConnectionString() {
  const configured = process.env.DATABASE_URL ||
    "postgresql://missing:missing@127.0.0.1:1/crm_om_not_configured";

  // Prisma Postgres provides separate direct and pooled hostnames. Serverless
  // app traffic must use the pooler; prisma.config.ts continues to use the
  // configured direct URL for migration/admin commands.
  try {
    const url = new URL(configured);
    if (url.hostname === "db.prisma.io") {
      url.hostname = "pooled.db.prisma.io";
    }
    return url.toString();
  } catch {
    return configured;
  }
}

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getRuntimeConnectionString(),
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Cache at runtime-global level so every module bundle in a warm instance
// reuses the same client. Keep it alive across serverless invocations.
export const db = globalForPrisma.prisma ?? createPrisma();
globalForPrisma.prisma = db;
