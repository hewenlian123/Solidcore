import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

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

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(
      "Refusing to run create-sale integrity tests outside a local database.",
    );
  }
}

function sessionCookie() {
  const payload = {
    userId: "create-sale-integrity",
    role: "ADMIN",
    name: "Create Sale Integrity",
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
  return `solidcore_session=${encoded}.${signature}`;
}

loadLocalEnv();
assertLocalDatabase();

const prisma = new PrismaClient();
const runId = randomUUID();
const creationKey = `create-sale-integrity-${runId}`;
let customerId = "";
let separateCustomerId = "";
let productId = "";
let variantId = "";

test.describe.serial("Create Sale persistence integrity", () => {
  test.beforeAll(async () => {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: `Integrity Contact ${runId}`,
        companyName: `Integrity Builders ${runId}`,
        phone: "808-555-7411",
        email: `integrity-${runId}@example.com`,
        address: "741 Integrity Street",
        city: "Honolulu",
        state: "HI",
        zipCode: "96813",
      },
    });
    customerId = customer.id;

    const product = await prisma.salesProduct.create({
      data: {
        name: `Integrity Tile ${runId}`,
        unit: "PIECE",
        price: 25,
        active: true,
      },
    });
    productId = product.id;

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `INT-${runId}`,
        displayName: `Integrity Tile ${runId}`,
        price: 25,
        isStockItem: true,
      },
    });
    variantId = variant.id;
  });

  test.afterAll(async () => {
    await prisma.salesOrder.deleteMany({
      where: {
        OR: [{ creationKey }, { customerId }],
      },
    });
    if (separateCustomerId) {
      await prisma.salesCustomer.deleteMany({
        where: { id: separateCustomerId },
      });
    }
    if (variantId) {
      await prisma.productVariant.deleteMany({ where: { id: variantId } });
    }
    if (productId) {
      await prisma.salesProduct.deleteMany({ where: { id: productId } });
    }
    if (customerId) {
      await prisma.salesCustomer.deleteMany({ where: { id: customerId } });
    }
    await prisma.$disconnect();
  });

  test("concurrent retries create one delivery order and no financial records", async ({
    request,
  }) => {
    const data = {
      customerId,
      docType: "SALES_ORDER",
      projectName: "Integrity Job Site",
      fulfillmentMethod: "DELIVERY",
      deliveryName: "Integrity Contact",
      deliveryPhone: "808-555-7411",
      deliveryAddress1: "741 Integrity Street",
      deliveryAddress2: "Loading bay 2",
      deliveryCity: "Honolulu",
      deliveryState: "HI",
      deliveryZip: "96813",
      deliveryNotes: "Call before arrival.",
      depositRequired: 50,
      items: [
        {
          productId,
          variantId,
          productSku: `INT-${runId}`,
          productTitle: `Integrity Tile ${runId}`,
          uomSnapshot: "PIECE",
          quantity: 4,
          unitPrice: 25,
          lineDiscount: 0,
        },
      ],
    };
    const headers = {
      Cookie: sessionCookie(),
      "Idempotency-Key": creationKey,
    };

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request.post("/api/sales-orders", { headers, data }),
      ),
    );
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );
    const diagnostics = responses.map((response, index) => ({
      status: response.status(),
      body: bodies[index],
    }));
    expect(
      responses.every((response) => response.ok()),
      JSON.stringify(diagnostics, null, 2),
    ).toBe(true);
    expect(responses.map((response) => response.status()).sort()).toEqual([
      200, 200, 200, 201,
    ]);
    const ids = new Set(bodies.map((body) => body.data?.id));
    expect(ids.size).toBe(1);

    const persisted = await prisma.salesOrder.findMany({
      where: { creationKey },
      include: { items: true, invoices: true, payments: true },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      customerId,
      projectName: "Integrity Job Site",
      fulfillmentMethod: "DELIVERY",
      deliveryName: "Integrity Contact",
      deliveryPhone: "808-555-7411",
      deliveryAddress1: "741 Integrity Street",
      deliveryAddress2: "Loading bay 2",
      deliveryCity: "Honolulu",
      deliveryState: "HI",
      deliveryZip: "96813",
      deliveryNotes: "Call before arrival.",
      status: "DRAFT",
    });
    expect(Number(persisted[0].depositRequired)).toBe(50);
    expect(Number(persisted[0].paidAmount)).toBe(0);
    expect(persisted[0].paymentStatus).toBe("unpaid");
    expect(persisted[0].items).toHaveLength(1);
    expect(persisted[0].invoices).toHaveLength(0);
    expect(persisted[0].payments).toHaveLength(0);

    const conflict = await request.post("/api/sales-orders", {
      headers,
      data: {
        ...data,
        items: [{ ...data.items[0], quantity: 5 }],
      },
    });
    expect(conflict.status()).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      existingOrderId: persisted[0].id,
    });
    await expect(
      prisma.salesOrder.count({ where: { creationKey } }),
    ).resolves.toBe(1);
  });

  test("strong identity matches are blocked and possible matches require a reason", async ({
    request,
  }) => {
    const headers = { Cookie: sessionCookie() };
    const strong = await request.post("/api/customers", {
      headers,
      data: {
        name: `Different Name ${runId}`,
        email: `INTEGRITY-${runId}@EXAMPLE.COM`,
        phone: "808-555-9999",
      },
    });
    expect(strong.status()).toBe(409);
    await expect(strong.json()).resolves.toMatchObject({
      code: "CUSTOMER_STRONG_MATCH",
      matches: [
        expect.objectContaining({ id: customerId, strength: "STRONG" }),
      ],
    });

    const possiblePayload = {
      name: `Integrity Contact ${runId}`,
      companyName: `Integrity Builders ${runId}`,
      email: `separate-${runId}@example.com`,
      phone: "808-555-8522",
      customerType: "COMMERCIAL",
    };
    const possible = await request.post("/api/customers", {
      headers,
      data: possiblePayload,
    });
    expect(possible.status()).toBe(409);
    await expect(possible.json()).resolves.toMatchObject({
      code: "CUSTOMER_POSSIBLE_MATCH",
      matches: [
        expect.objectContaining({ id: customerId, strength: "POSSIBLE" }),
      ],
    });

    const reviewed = await request.post("/api/customers", {
      headers,
      data: {
        ...possiblePayload,
        duplicateReviewReason:
          "Separate legal billing entity confirmed by manager.",
      },
    });
    expect(reviewed.status()).toBe(201);
    const reviewedBody = await reviewed.json();
    separateCustomerId = reviewedBody.data.id;
    const persisted = await prisma.salesCustomer.findUnique({
      where: { id: separateCustomerId },
    });
    expect(persisted?.notes).toContain(
      "Duplicate review: Separate legal billing entity confirmed by manager.",
    );
  });
});
