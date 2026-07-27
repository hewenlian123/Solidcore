import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { calculateAvailable } from "../lib/inventory-availability";

const MARKER = "SOLIDCORE PHASE8 RETURN HOLD QA DELETE ME";

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
  throw new Error("Refusing to run return tests against a non-local database.");
}

const prisma = new PrismaClient();
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function sessionCookie(role: "ADMIN" | "SALES" | "WAREHOUSE") {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 3600,
    name: `Phase 8 ${role}`,
    role,
    userId: `phase8-${role.toLowerCase()}`,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret =
    process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function headers(role: "ADMIN" | "SALES" | "WAREHOUSE") {
  return { Cookie: sessionCookie(role), "x-user-role": role };
}

async function patchReturn(
  request: APIRequestContext,
  returnId: string,
  role: "ADMIN" | "SALES" | "WAREHOUSE",
  status: string,
) {
  const response = await request.patch(`/api/returns/${returnId}`, {
    headers: headers(role),
    data: { status },
  });
  return {
    response,
    body: await response.json().catch(() => ({})),
  };
}

test.describe.serial("return inventory disposition integrity", () => {
  let customerId = "";
  let orderId = "";
  let productId = "";
  let returnId = "";
  let variantId = "";

  test.beforeAll(async () => {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: `${MARKER} Customer ${runId}`,
        address: "800 Return Hold Way",
      },
    });
    customerId = customer.id;
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-RETURN-HOLD-${runId}`,
        customerId,
        status: "CONFIRMED",
        fulfillmentMethod: "PICKUP",
        subtotal: 20,
        total: 20,
        balanceDue: 20,
        notes: MARKER,
      },
    });
    orderId = order.id;
    const product = await prisma.salesProduct.create({
      data: {
        name: `${MARKER} Product ${runId}`,
        unit: "piece",
        price: 10,
      },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `RETURN-HOLD-${runId}`,
        displayName: `${MARKER} Variant`,
      },
    });
    variantId = variant.id;
    await prisma.inventoryStock.create({
      data: { variantId, onHand: 10, reserved: 2, hold: 0 },
    });
    const afterSalesReturn = await prisma.afterSalesReturn.create({
      data: {
        returnNumber: `RET-HOLD-${runId}`,
        customerId,
        salesOrderId: orderId,
        status: "DRAFT",
        refundMethod: "REFUND_PAYMENT",
        refundTotal: 20,
        notes: MARKER,
        items: {
          create: {
            variantId,
            title: `${MARKER} Item`,
            sku: variant.sku,
            qtyPurchased: 2,
            qtyReturn: 2,
            unitPrice: 10,
            lineRefund: 20,
          },
        },
      },
    });
    returnId = afterSalesReturn.id;
  });

  test.afterAll(async () => {
    await prisma.afterSalesReturnEvent.deleteMany({ where: { returnId } });
    await prisma.afterSalesReturnItem.deleteMany({ where: { returnId } });
    await prisma.afterSalesReturn.deleteMany({ where: { id: returnId } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId } });
    await prisma.inventoryStock.deleteMany({ where: { variantId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.salesProduct.deleteMany({ where: { id: productId } });
    await prisma.salesOrder.deleteMany({ where: { id: orderId } });
    await prisma.salesCustomer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  test("Sales cannot approve, Warehouse receives to Hold, and retry is idempotent", async ({
    request,
  }) => {
    const salesAttempt = await patchReturn(
      request,
      returnId,
      "SALES",
      "approved",
    );
    expect(salesAttempt.response.status()).toBe(403);

    const approved = await patchReturn(request, returnId, "ADMIN", "approved");
    expect(approved.response.status(), JSON.stringify(approved.body)).toBe(200);

    const before = await prisma.inventoryStock.findUniqueOrThrow({
      where: { variantId },
    });
    expect(calculateAvailable(before)).toBe(8);

    const received = await patchReturn(
      request,
      returnId,
      "WAREHOUSE",
      "received",
    );
    expect(received.response.status(), JSON.stringify(received.body)).toBe(200);
    const after = await prisma.inventoryStock.findUniqueOrThrow({
      where: { variantId },
    });
    expect(Number(after.onHand)).toBe(12);
    expect(Number(after.hold)).toBe(2);
    expect(Number(after.reserved)).toBe(2);
    expect(calculateAvailable(after)).toBe(8);
    expect(
      await prisma.inventoryMovement.count({
        where: { variantId, type: "RETURN_HOLD" },
      }),
    ).toBe(1);

    const replay = await patchReturn(
      request,
      returnId,
      "WAREHOUSE",
      "received",
    );
    expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
    expect(
      await prisma.inventoryMovement.count({
        where: { variantId, type: "RETURN_HOLD" },
      }),
    ).toBe(1);
    const replayedStock = await prisma.inventoryStock.findUniqueOrThrow({
      where: { variantId },
    });
    expect(Number(replayedStock.onHand)).toBe(12);
    expect(Number(replayedStock.hold)).toBe(2);
  });

  test("return cannot claim Refunded without a linked posted refund event", async ({
    request,
  }) => {
    const result = await patchReturn(request, returnId, "ADMIN", "refunded");
    expect(result.response.status()).toBe(409);
    expect(String(result.body.error)).toContain("posted refund");
    const current = await prisma.afterSalesReturn.findUniqueOrThrow({
      where: { id: returnId },
    });
    expect(current.status).toBe("RECEIVED");
  });
});
