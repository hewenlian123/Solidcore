import { prisma } from "@/lib/prisma";

export const EXPECTED_RELEASE_MIGRATION = "20260727010000_lock_down_public_api";

type SchemaProbe = {
  migrationReady: boolean;
  schemaReady: boolean;
};

export type SystemHealthServices = {
  server: "running";
  database: "connected" | "error";
  prisma: "active" | "error";
  migrations: "current" | "stale" | "unknown";
  schema: "available" | "unavailable" | "unknown";
  supabase: "configured" | "not_configured";
};

export type SystemHealthResult = {
  ready: boolean;
  services: SystemHealthServices;
  error: string | null;
};

export function evaluateSchemaProbe(probe: SchemaProbe | undefined) {
  return {
    migrationReady: probe?.migrationReady === true,
    schemaReady: probe?.schemaReady === true,
  };
}

function optionalSupabaseStatus(): SystemHealthServices["supabase"] {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url?.trim() && key?.trim() ? "configured" : "not_configured";
}

function initialServices(): SystemHealthServices {
  return {
    server: "running",
    database: "error",
    prisma: "error",
    migrations: "unknown",
    schema: "unknown",
    supabase: optionalSupabaseStatus(),
  };
}

export async function inspectSystemHealth(): Promise<SystemHealthResult> {
  const services = initialServices();

  try {
    await prisma.$queryRaw`SELECT 1`;
    services.database = "connected";
    services.prisma = "active";
  } catch (error) {
    console.error("Health check database connectivity failed", error);
    return {
      ready: false,
      services,
      error: "Database connectivity check failed.",
    };
  }

  let probe: SchemaProbe | undefined;
  try {
    const rows = await prisma.$queryRaw<SchemaProbe[]>`
      SELECT
        EXISTS (
          SELECT 1
          FROM "_prisma_migrations"
          WHERE "migration_name" = ${EXPECTED_RELEASE_MIGRATION}
            AND "finished_at" IS NOT NULL
            AND "rolled_back_at" IS NULL
            AND "applied_steps_count" = 1
        ) AS "migrationReady",
        (
          to_regclass('public.customer_contacts') IS NOT NULL
          AND to_regclass('public.sales_fulfillment_events') IS NOT NULL
          AND to_regclass('public.purchase_receipts') IS NOT NULL
          AND to_regclass('public.special_order_interactions') IS NOT NULL
          AND to_regclass('public.customer_lifecycle_events') IS NOT NULL
        ) AS "schemaReady"
    `;
    probe = rows[0];
  } catch (error) {
    console.error("Health check schema verification failed", error);
  }

  const evaluated = evaluateSchemaProbe(probe);
  services.migrations = evaluated.migrationReady ? "current" : "stale";
  services.schema = evaluated.schemaReady ? "available" : "unavailable";

  if (!evaluated.migrationReady || !evaluated.schemaReady) {
    return {
      ready: false,
      services,
      error: "Database schema is not ready for this release.",
    };
  }

  return { ready: true, services, error: null };
}
