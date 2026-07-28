import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const AFFECTED_TABLES = [
  "AfterSalesTicket",
  "AppUser",
  "Customer",
  "Order",
  "OrderItem",
  "Product",
  "StockLog",
  "Supplier",
  "Warehouse",
  "customers",
  "description_templates",
  "inventory_movements",
  "inventory_stock",
] as const;

type AffectedTable = (typeof AFFECTED_TABLES)[number];
type DirectRole = "anon" | "authenticated";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function expectRoleStatementDenied(role: DirectRole, statement: string) {
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$executeRawUnsafe(statement);
    }),
  ).rejects.toThrow(/permission denied/i);
}

test("corrective migration records the reviewed fail-closed policy topology", () => {
  const migration = readFileSync(
    "prisma/migrations/20260727020000_close_historical_authenticated_rls_policies/migration.sql",
    "utf8",
  );

  expect(migration).not.toMatch(/\bCREATE\s+POLICY\b/i);
  expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
  expect(migration).not.toMatch(
    /\bALTER\s+TABLE\b[^;]*\b(ADD|DROP)\s+COLUMN\b/i,
  );
  expect(migration).toContain(
    "actual_authenticated_policy_count NOT IN (0, 14)",
  );
  expect(migration).toContain(
    "actual_authenticated_policy_count <> matched_authenticated_policy_count",
  );

  for (const table of AFFECTED_TABLES) {
    expect(migration).toContain(`('${table}')`);
  }
});

test("affected private tables retain forced RLS with no direct role privileges or policies", async () => {
  const tableRows = await prisma.$queryRaw<
    Array<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
      anon_select: boolean;
      anon_insert: boolean;
      anon_update: boolean;
      anon_delete: boolean;
      authenticated_select: boolean;
      authenticated_insert: boolean;
      authenticated_update: boolean;
      authenticated_delete: boolean;
    }>
  >`
    SELECT
      table_class.relname AS table_name,
      table_class.relrowsecurity AS rls_enabled,
      table_class.relforcerowsecurity AS rls_forced,
      has_table_privilege('anon', table_class.oid, 'SELECT') AS anon_select,
      has_table_privilege('anon', table_class.oid, 'INSERT') AS anon_insert,
      has_table_privilege('anon', table_class.oid, 'UPDATE') AS anon_update,
      has_table_privilege('anon', table_class.oid, 'DELETE') AS anon_delete,
      has_table_privilege('authenticated', table_class.oid, 'SELECT') AS authenticated_select,
      has_table_privilege('authenticated', table_class.oid, 'INSERT') AS authenticated_insert,
      has_table_privilege('authenticated', table_class.oid, 'UPDATE') AS authenticated_update,
      has_table_privilege('authenticated', table_class.oid, 'DELETE') AS authenticated_delete
    FROM pg_catalog.pg_class table_class
    JOIN pg_catalog.pg_namespace table_schema
      ON table_schema.oid = table_class.relnamespace
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = ANY(${AFFECTED_TABLES})
      AND table_class.relkind = 'r'
    ORDER BY table_class.relname
  `;

  expect(tableRows).toHaveLength(AFFECTED_TABLES.length);
  for (const row of tableRows) {
    expect(row).toMatchObject({
      rls_enabled: true,
      rls_forced: true,
      anon_select: false,
      anon_insert: false,
      anon_update: false,
      anon_delete: false,
      authenticated_select: false,
      authenticated_insert: false,
      authenticated_update: false,
      authenticated_delete: false,
    });
  }

  const policies = await prisma.$queryRaw<Array<{ policy_count: number }>>`
    SELECT count(*)::integer AS policy_count
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(${AFFECTED_TABLES})
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  `;
  expect(policies).toEqual([{ policy_count: 0 }]);
});

test("anonymous and authenticated SQL roles cannot read or write any affected table", async () => {
  const columns = await prisma.$queryRaw<
    Array<{ table_name: AffectedTable; column_name: string }>
  >`
    SELECT DISTINCT ON (table_class.relname)
      table_class.relname AS table_name,
      column_attribute.attname AS column_name
    FROM pg_catalog.pg_class table_class
    JOIN pg_catalog.pg_namespace table_schema
      ON table_schema.oid = table_class.relnamespace
    JOIN pg_catalog.pg_attribute column_attribute
      ON column_attribute.attrelid = table_class.oid
    WHERE table_schema.nspname = 'public'
      AND table_class.relname = ANY(${AFFECTED_TABLES})
      AND table_class.relkind = 'r'
      AND column_attribute.attnum > 0
      AND NOT column_attribute.attisdropped
      AND column_attribute.attgenerated = ''
    ORDER BY table_class.relname, column_attribute.attnum
  `;
  expect(columns).toHaveLength(AFFECTED_TABLES.length);
  const firstColumn = new Map(
    columns.map((row) => [row.table_name, row.column_name]),
  );

  for (const role of ["anon", "authenticated"] as const) {
    for (const table of AFFECTED_TABLES) {
      const qualifiedTable = `${quoteIdentifier("public")}.${quoteIdentifier(table)}`;
      const column = quoteIdentifier(firstColumn.get(table)!);
      await expectRoleStatementDenied(
        role,
        `SELECT * FROM ${qualifiedTable} LIMIT 1`,
      );
      await expectRoleStatementDenied(
        role,
        `INSERT INTO ${qualifiedTable} SELECT * FROM ${qualifiedTable} WHERE false`,
      );
      await expectRoleStatementDenied(
        role,
        `UPDATE ${qualifiedTable} SET ${column} = ${column} WHERE false`,
      );
      await expectRoleStatementDenied(
        role,
        `DELETE FROM ${qualifiedTable} WHERE false`,
      );
    }
  }
});

test("trusted server Prisma retains access to every affected application model", async () => {
  await expect(
    Promise.all([
      prisma.afterSalesTicket.findFirst({ select: { id: true } }),
      prisma.appUser.findFirst({ select: { id: true } }),
      prisma.customer.findFirst({ select: { id: true } }),
      prisma.order.findFirst({ select: { id: true } }),
      prisma.orderItem.findFirst({ select: { id: true } }),
      prisma.product.findFirst({ select: { id: true } }),
      prisma.stockLog.findFirst({ select: { id: true } }),
      prisma.supplier.findFirst({ select: { id: true } }),
      prisma.warehouse.findFirst({ select: { id: true } }),
      prisma.salesCustomer.findFirst({ select: { id: true } }),
      prisma.descriptionTemplate.findFirst({ select: { id: true } }),
      prisma.inventoryMovement.findFirst({ select: { id: true } }),
      prisma.inventoryStock.findFirst({ select: { id: true } }),
    ]),
  ).resolves.toHaveLength(AFFECTED_TABLES.length);
});

test("service-role authority remains server-only", () => {
  const storageSource = readFileSync("lib/storage.ts", "utf8");
  const browserClientSource = readFileSync("lib/supabaseClient.ts", "utf8");

  expect(storageSource).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
  expect(storageSource).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
  expect(storageSource).not.toMatch(/^["']use client["'];/m);
  expect(browserClientSource).not.toContain("SUPABASE_SERVICE_ROLE");
});
