import { expect, test } from "@playwright/test";
import { evaluateSchemaProbe } from "../lib/system-health";

test("schema probe fails closed for missing migration or required schema", () => {
  expect(
    evaluateSchemaProbe({
      migrationReady: true,
      schemaReady: true,
    }),
  ).toEqual({ migrationReady: true, schemaReady: true });

  expect(
    evaluateSchemaProbe({
      migrationReady: false,
      schemaReady: true,
    }),
  ).toEqual({ migrationReady: false, schemaReady: true });

  expect(
    evaluateSchemaProbe({
      migrationReady: true,
      schemaReady: false,
    }),
  ).toEqual({ migrationReady: true, schemaReady: false });

  expect(evaluateSchemaProbe(undefined)).toEqual({
    migrationReady: false,
    schemaReady: false,
  });
});

test("health endpoints report the release schema state without private detail", async ({
  request,
}) => {
  for (const path of ["/api/health", "/api/ping"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);

    const body = await response.json();
    const services = body.services ?? body.data;
    expect(services).toMatchObject({
      database: "connected",
      migrations: "current",
      schema: "available",
    });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("20260727010000");
    expect(serialized).not.toContain("customer_contacts");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("postgresql://");
  }
});
