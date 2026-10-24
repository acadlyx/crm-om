import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma() {
  // Keep module initialization safe so public branding shells can fall back while the DB is unavailable.
  const connectionString = process.env.DATABASE_URL ||
    "postgresql://missing:missing@127.0.0.1:1/crm_om_not_configured";

  // Vercel serverless instances each own a pool. A small pool prevents every
  // instance from opening the adapter's default 10 connections against Prisma Postgres.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Cache at the runtime-global level so every module bundle in a warm instance
// reuses the same client; do not disconnect between serverless invocations.
export const db = globalForPrisma.prisma ?? createPrisma();
globalForPrisma.prisma = db;
