import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { authenticateUser } from "@/lib/auth-users";
import {
  clearLoginFailures,
  loginRateLimitStatus,
  recordLoginFailure,
} from "@/lib/auth-rate-limit";
import { prisma } from "@/lib/prisma";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

function sessionToken(role: "ADMIN" | "SALES" | "WAREHOUSE") {
  const payload = {
    userId: `security-${role.toLowerCase()}`,
    role,
    name: `Security ${role}`,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const secret =
    process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function headers(role: "ADMIN" | "SALES" | "WAREHOUSE") {
  return { Cookie: `solidcore_session=${sessionToken(role)}` };
}

loadLocalEnv();
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";

test("all representative mutation domains reject unauthenticated requests", async ({
  request,
}) => {
  const missing = randomUUID();
  const cases = [
    request.post("/api/customers", { data: { name: "Blocked" } }),
    request.patch(`/api/customers/${missing}/archive`, {
      data: { action: "ARCHIVE", reason: "Unauthorized request." },
    }),
    request.post(`/api/customers/${missing}/merge`, {
      data: {
        targetCustomerId: randomUUID(),
        reason: "Unauthorized request.",
      },
    }),
    request.post(`/api/invoices/${missing}/payments`, {
      data: { amount: 1 },
    }),
    request.post(`/api/sales-orders/${missing}/payments/${missing}/refunds`, {
      data: { amount: 1 },
    }),
    request.patch(`/api/fulfillments/${missing}/pickup`, {
      data: { items: [] },
    }),
    request.post(`/api/purchase-orders/${missing}/receive`, {
      data: { lines: [] },
    }),
  ];
  const responses = await Promise.all(cases);
  for (const response of responses) {
    expect([401, 403]).toContain(response.status());
  }
});

test("role boundaries prevent customer, money, and inventory privilege escalation", async ({
  request,
}) => {
  const missing = randomUUID();
  const salesMerge = await request.post(`/api/customers/${missing}/merge`, {
    headers: headers("SALES"),
    data: {
      targetCustomerId: randomUUID(),
      reason: "Attempted role escalation.",
    },
  });
  const salesArchive = await request.patch(
    `/api/customers/${missing}/archive`,
    {
      headers: headers("SALES"),
      data: { action: "ARCHIVE", reason: "Attempted role escalation." },
    },
  );
  const salesRefund = await request.post(
    `/api/sales-orders/${missing}/payments/${missing}/refunds`,
    {
      headers: headers("SALES"),
      data: { amount: 1 },
    },
  );
  const warehouseCustomerWrite = await request.post(
    `/api/customers/${missing}/notes`,
    {
      headers: headers("WAREHOUSE"),
      data: { note: "Attempted cross-role write." },
    },
  );
  const warehousePayment = await request.post(
    `/api/invoices/${missing}/payments`,
    {
      headers: headers("WAREHOUSE"),
      data: { amount: 1 },
    },
  );

  for (const response of [
    salesMerge,
    salesArchive,
    salesRefund,
    warehouseCustomerWrite,
    warehousePayment,
  ]) {
    expect([401, 403]).toContain(response.status());
  }
});

test("authorized random-resource requests fail closed without 500 or cross-record access", async ({
  request,
}) => {
  const missing = randomUUID();
  const responses = await Promise.all([
    request.patch(`/api/customers/${missing}/archive`, {
      headers: headers("ADMIN"),
      data: { action: "ARCHIVE", reason: "IDOR boundary check." },
    }),
    request.post(`/api/customers/${missing}/merge`, {
      headers: headers("ADMIN"),
      data: {
        targetCustomerId: randomUUID(),
        reason: "IDOR boundary check.",
      },
    }),
    request.post(`/api/customers/${missing}/notes`, {
      headers: headers("SALES"),
      data: { note: "IDOR boundary check." },
    }),
    request.patch(`/api/fulfillments/${missing}/pickup`, {
      headers: headers("WAREHOUSE"),
      data: { items: [] },
    }),
    request.post(`/api/invoices/${missing}/payments`, {
      headers: headers("SALES"),
      data: { amount: 1, method: "CASH", paymentType: "FINAL" },
    }),
  ]);

  for (const response of responses) {
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  }
});

test("tampered sessions fail and signed-in users cannot rewrite their role", async ({
  request,
}) => {
  const token = sessionToken("SALES");
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  const invalid = await request.get("/api/auth/session", {
    headers: { Cookie: `solidcore_session=${tampered}` },
  });
  expect(invalid.status()).toBe(401);

  const escalation = await request.patch("/api/auth/session", {
    headers: {
      ...headers("SALES"),
      "Content-Type": "application/json",
    },
    data: { role: "ADMIN" },
  });
  expect(escalation.status()).toBe(405);

  const unchanged = await request.get("/api/auth/session", {
    headers: headers("SALES"),
  });
  expect(unchanged.ok()).toBe(true);
  await expect(unchanged.json()).resolves.toMatchObject({
    data: { role: "SALES" },
  });
});

test("login credentials are environment-owned and failed attempts are throttled", () => {
  const retiredDemoPassword = ["admin", "123"].join("");
  expect(authenticateUser("admin", retiredDemoPassword)).toBeNull();

  const previous = process.env.SOLIDCORE_ADMIN_PASSWORD;
  process.env.SOLIDCORE_ADMIN_PASSWORD = "test-only-strong-password";
  expect(authenticateUser("admin", "test-only-strong-password")).toMatchObject({
    role: "ADMIN",
  });
  if (previous === undefined) delete process.env.SOLIDCORE_ADMIN_PASSWORD;
  else process.env.SOLIDCORE_ADMIN_PASSWORD = previous;

  const key = `security-rate-limit-${randomUUID()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordLoginFailure(key, 1_000);
  }
  expect(loginRateLimitStatus(key, 1_001)).toMatchObject({
    allowed: false,
  });
  clearLoginFailures(key);
  expect(loginRateLimitStatus(key, 1_001)).toMatchObject({
    allowed: true,
  });
});

test("application responses include the release security headers", async ({
  request,
}) => {
  const response = await request.get("/login");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});

test("production hides system diagnostics and test-write tooling", async ({
  page,
  request,
}) => {
  const diagnostics = await Promise.all([
    request.post("/api/system/feature-tests", {
      headers: headers("ADMIN"),
    }),
    request.post("/api/system/ui-tests", {
      headers: headers("ADMIN"),
    }),
    request.post("/api/system/run-all-tests", {
      headers: headers("ADMIN"),
    }),
    request.post("/api/system/run-tests", {
      headers: headers("ADMIN"),
    }),
    request.get("/api/system/metrics", {
      headers: headers("ADMIN"),
    }),
    request.get("/api/system/logs", {
      headers: headers("ADMIN"),
    }),
  ]);
  for (const response of diagnostics) {
    expect(response.status()).toBe(404);
  }

  const sidebarSource = readFileSync("components/layout/sidebar.tsx", "utf8");
  expect(sidebarSource).not.toContain('href: "/system/');

  await page.context().addCookies([
    {
      name: "solidcore_session",
      value: sessionToken("ADMIN"),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
  await page.goto("/system/tests");
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run All Tests" })).toHaveCount(
    0,
  );
});

test("direct Supabase Data API roles cannot access SolidCore public tables", async () => {
  const rows = await prisma.$queryRaw<
    Array<{
      table_name: string;
      rls_enabled: boolean;
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
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
      has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
      has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
      has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
      has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
      has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `;

  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.filter(
      (row) =>
        !row.rls_enabled ||
        row.anon_select ||
        row.anon_insert ||
        row.anon_update ||
        row.anon_delete ||
        row.authenticated_select ||
        row.authenticated_insert ||
        row.authenticated_update ||
        row.authenticated_delete,
    ),
  ).toEqual([]);
});
