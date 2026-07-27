import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const MARKER = "SOLIDCORE PHASE9 SPECIAL ORDER QA DELETE ME";

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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedDatabaseUrl = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname)) {
  throw new Error(
    "Refusing to run Special Order tests against a non-local database.",
  );
}

const prisma = new PrismaClient();
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function sessionCookie(role: "ADMIN" | "SALES") {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 3600,
    name: `Phase 9 ${role}`,
    role,
    userId: `phase9-${role.toLowerCase()}`,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret =
    process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function headers(role: "ADMIN" | "SALES") {
  return { Cookie: sessionCookie(role), "x-user-role": role };
}

async function patchOrder(
  request: APIRequestContext,
  orderId: string,
  role: "ADMIN" | "SALES",
  data: Record<string, unknown>,
) {
  const response = await request.patch(`/api/sales-orders/${orderId}`, {
    headers: headers(role),
    data,
  });
  return {
    response,
    body: await response.json().catch(() => ({})),
  };
}

test.describe
  .serial("Special Order promise and communication integrity", () => {
  let customerId = "";
  let orderId = "";

  test.beforeAll(async () => {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: `${MARKER} Customer ${runId}`,
        address: "900 Promise Date Way",
      },
    });
    customerId = customer.id;
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-SPECIAL-${runId}`,
        customerId,
        status: "CONFIRMED",
        fulfillmentMethod: "PICKUP",
        specialOrder: true,
        customerPromiseDate: new Date("2026-08-05T00:00:00.000Z"),
        subtotal: 0,
        total: 0,
        balanceDue: 0,
        notes: MARKER,
      },
    });
    orderId = order.id;
  });

  test.afterAll(async () => {
    await prisma.specialOrderInteraction.deleteMany({
      where: { salesOrderId: orderId },
    });
    await prisma.salesOrder.deleteMany({ where: { id: orderId } });
    await prisma.salesCustomer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  test("Supplier ETA never changes the confirmed Customer Promise Date", async ({
    request,
  }) => {
    const result = await patchOrder(request, orderId, "SALES", {
      etaDate: "2026-08-02",
    });
    expect(result.response.status(), JSON.stringify(result.body)).toBe(200);
    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(stored.etaDate?.toISOString()).toBe("2026-08-02T00:00:00.000Z");
    expect(stored.customerPromiseDate?.toISOString()).toBe(
      "2026-08-05T00:00:00.000Z",
    );
  });

  test("Sales proposes and Owner/Manager explicitly confirms a promise date", async ({
    request,
  }) => {
    const proposed = await patchOrder(request, orderId, "SALES", {
      proposedCustomerPromiseDate: "2026-08-07",
      promiseDateReason: "Supplier confirmed revised vessel arrival.",
    });
    expect(proposed.response.status(), JSON.stringify(proposed.body)).toBe(200);
    let stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(stored.proposedCustomerPromiseDate?.toISOString()).toBe(
      "2026-08-07T00:00:00.000Z",
    );
    expect(stored.customerPromiseDate?.toISOString()).toBe(
      "2026-08-05T00:00:00.000Z",
    );

    const salesConfirmation = await patchOrder(request, orderId, "SALES", {
      confirmCustomerPromiseDate: true,
      promiseDateReason: "Attempted sales confirmation.",
    });
    expect(salesConfirmation.response.status()).toBe(403);

    const confirmed = await patchOrder(request, orderId, "ADMIN", {
      confirmCustomerPromiseDate: true,
      promiseDateReason: "Owner reviewed supplier ETA and approved.",
    });
    expect(confirmed.response.status(), JSON.stringify(confirmed.body)).toBe(
      200,
    );
    stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(stored.customerPromiseDate?.toISOString()).toBe(
      "2026-08-07T00:00:00.000Z",
    );
    expect(stored.proposedCustomerPromiseDate).toBeNull();
    expect(stored.promiseDateApprovalActor).toContain("phase9-admin");
    expect(stored.promiseDateReason).toBe(
      "Owner reviewed supplier ETA and approved.",
    );
  });

  test("Follow-up ownership and due date are an inseparable pair", async ({
    request,
  }) => {
    const incomplete = await patchOrder(request, orderId, "SALES", {
      specialFollowUpOwner: "Jordan",
    });
    expect(incomplete.response.status()).toBe(400);
    expect(String(incomplete.body.error)).toContain("both required");

    const complete = await patchOrder(request, orderId, "SALES", {
      specialFollowUpOwner: "Jordan",
      specialFollowUpDueAt: "2026-08-03",
    });
    expect(complete.response.status(), JSON.stringify(complete.body)).toBe(200);
    const stored = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(stored.specialFollowUpOwner).toBe("Jordan");
    expect(stored.specialFollowUpDueAt?.toISOString()).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });

  test("External activity is logged idempotently without claiming delivery", async ({
    request,
  }) => {
    const creationKey = `phase9-logged-${runId}`;
    const occurredAt = "2026-07-26T12:00:00.000Z";
    const data = {
      state: "LOGGED",
      channel: "PHONE",
      summary: "Customer called outside SolidCore; revised timing discussed.",
      occurredAt,
      creationKey,
    };
    const first = await request.post(
      `/api/sales-orders/${orderId}/special-order-interactions`,
      { headers: headers("SALES"), data },
    );
    expect(first.status(), await first.text()).toBe(201);
    const replay = await request.post(
      `/api/sales-orders/${orderId}/special-order-interactions`,
      { headers: headers("SALES"), data },
    );
    expect(replay.status(), await replay.text()).toBe(200);
    expect(
      await prisma.specialOrderInteraction.count({
        where: { creationKey },
      }),
    ).toBe(1);

    const conflict = await request.post(
      `/api/sales-orders/${orderId}/special-order-interactions`,
      {
        headers: headers("SALES"),
        data: { ...data, summary: "Different activity under the same key." },
      },
    );
    expect(conflict.status()).toBe(409);
  });

  test("Sent or delivered states require explicit evidence", async ({
    request,
  }) => {
    const withoutEvidence = await request.post(
      `/api/sales-orders/${orderId}/special-order-interactions`,
      {
        headers: headers("SALES"),
        data: {
          state: "SENT",
          channel: "EMAIL",
          summary: "Promise-date update prepared for customer.",
          creationKey: `phase9-no-evidence-${runId}`,
        },
      },
    );
    expect(withoutEvidence.status()).toBe(400);
    expect(await withoutEvidence.text()).toContain("evidence");

    const withEvidence = await request.post(
      `/api/sales-orders/${orderId}/special-order-interactions`,
      {
        headers: headers("SALES"),
        data: {
          state: "SENT",
          channel: "EMAIL",
          summary: "Provider accepted the customer update.",
          evidenceReference: `provider-message-${runId}`,
          creationKey: `phase9-with-evidence-${runId}`,
        },
      },
    );
    expect(withEvidence.status(), await withEvidence.text()).toBe(201);
  });

  test("The database rejects an evidence-free sent state", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "special_order_interactions"
          ("id", "sales_order_id", "state", "channel", "summary", "actor", "occurred_at", "created_at", "updated_at")
         VALUES ($1, $2, 'SENT', 'EMAIL', $3, $4, NOW(), NOW(), NOW())`,
        randomUUID(),
        orderId,
        `${MARKER} invalid sent state`,
        "phase9-direct-sql",
      ),
    ).rejects.toThrow();
  });
});
