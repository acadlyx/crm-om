import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
export const db = g.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
