import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;

/**
 * Use a single PrismaClient instance per process to avoid connection pool exhaustion.
 * In DATABASE_URL, add: ?connection_limit=5&pool_timeout=10
 * (Supabase/Postgres: append to existing query string or use &connection_limit=5&pool_timeout=10)
 */
