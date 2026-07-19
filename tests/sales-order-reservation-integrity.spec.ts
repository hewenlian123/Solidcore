import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { syncInventoryReservationForSalesOrder } from "../lib/sales-orders";

const prisma = new PrismaClient();
const RUN_ID = `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE RESERVATION QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-reservation-integrity-results.json";

type FixtureVariant = {
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  unit: string;
  price: number;
};

type FixtureState = {
  customerId: string;
  shared: FixtureVariant;
  other: FixtureVariant;
};

type Snapshot = {
  stocks: Array<{ variantId: string; onHand: number; reserved: number }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    docType: string;
    status: string;
    reservedApplied: boolean;
    reservedReleased: boolean;
  }>;
  items: Array<{
    id: string;
    salesOrderId: string;
    variantId: string | null;
    quantity: number;
    fulfillQty: number;
  }>;
  fulfillments: Array<{ id: string; salesOrderId: string; status: string; type: string }>;
  fulfillmentItems: Array<{
    id: string;
    fulfillmentId: string;
    salesOrderItemId: string;
    variantId: string | null;
    orderedQty: number;
    fulfilledQty: number;
  }>;
  movements: Array<{
    id: string;
    variantId: string;
    type: string;
    qty: number;
    unit: string;
    note: string | null;
  }>;
};

const results: {
  runId: string;
  marker: string;
  scenarios: Record<string, { before: Snapshot; after: Snapshot }>;
  cleanup?: Snapshot;
} = {
  runId: RUN_ID,
  marker: QA_MARKER,
  scenarios: {},
};

let fixture: FixtureState;
let orderCounter = 0;

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      if (process.env[key] !== undefined) continue;
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  }
}

function assertSafeDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required for reservation tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run reservation tests against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

function createSessionCookie() {
  const payload = {
    userId: "reservation-test-admin",
    role: "ADMIN",
    name: "Reservation Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders() {
  return { Cookie: createSessionCookie() };
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function variantIds() {
  return [fixture?.shared?.variantId, fixture?.other?.variantId].filter(Boolean) as string[];
}

async function createFixtureVariant(label: "shared" | "other"): Promise<FixtureVariant> {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${QA_MARKER} ${label} product ${RUN_ID}`,
      title: `${label} product`,
      defaultDescription: `${QA_MARKER} ${label}`,
      unit: "PIECE",
      price: label === "shared" ? 10 : 14,
      cost: label === "shared" ? 4 : 6,
      availableStock: 100,
      active: true,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `RES-${label.toUpperCase()}-${RUN_ID}`,
      displayName: `${label} variant`,
      description: `${label} variant ${QA_MARKER}`,
      price: product.price,
      cost: product.cost,
      isStockItem: true,
    },
  });
  await prisma.inventoryStock.create({
    data: { variantId: variant.id, onHand: 100, reserved: 0 },
  });
  return {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    title: `${label} variant`,
    unit: "PIECE",
    price: Number(product.price),
  };
}

async function captureSnapshot(orderIds: string[] = []): Promise<Snapshot> {
  const trackedVariantIds = variantIds();
  const fulfillmentsForOrders =
    orderIds.length > 0
      ? await prisma.salesOrderFulfillment.findMany({
          where: { salesOrderId: { in: orderIds } },
          select: { id: true },
        })
      : [];
  const fulfillmentIds = fulfillmentsForOrders.map((fulfillment) => fulfillment.id);
  const [stocks, orders, items, fulfillments, fulfillmentItems, movements] =
    await Promise.all([
      prisma.inventoryStock.findMany({
        where: { variantId: { in: trackedVariantIds } },
        select: { variantId: true, onHand: true, reserved: true },
        orderBy: { variantId: "asc" },
      }),
      prisma.salesOrder.findMany({
        where:
          orderIds.length > 0
            ? { id: { in: orderIds } }
            : { customerId: fixture.customerId },
        select: {
          id: true,
          orderNumber: true,
          docType: true,
          status: true,
          reservedAppliedAt: true,
          reservedReleasedAt: true,
        },
        orderBy: { orderNumber: "asc" },
      }),
      prisma.salesOrderItem.findMany({
        where:
          orderIds.length > 0
            ? { salesOrderId: { in: orderIds } }
            : { salesOrder: { customerId: fixture.customerId } },
        select: {
          id: true,
          salesOrderId: true,
          variantId: true,
          quantity: true,
          fulfillQty: true,
        },
        orderBy: [{ salesOrderId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.salesOrderFulfillment.findMany({
        where:
          orderIds.length > 0
            ? { salesOrderId: { in: orderIds } }
            : { salesOrder: { customerId: fixture.customerId } },
        select: { id: true, salesOrderId: true, status: true, type: true },
        orderBy: { id: "asc" },
      }),
      prisma.salesOrderFulfillmentItem.findMany({
        where:
          fulfillmentIds.length > 0
            ? { fulfillmentId: { in: fulfillmentIds } }
            : { fulfillment: { salesOrder: { customerId: fixture.customerId } } },
        select: {
          id: true,
          fulfillmentId: true,
          salesOrderItemId: true,
          variantId: true,
          orderedQty: true,
          fulfilledQty: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.inventoryMovement.findMany({
        where: { variantId: { in: trackedVariantIds } },
        select: { id: true, variantId: true, type: true, qty: true, unit: true, note: true },
        orderBy: [{ variantId: "asc" }, { id: "asc" }],
      }),
    ]);

  return {
    stocks: stocks.map((stock) => ({
      variantId: stock.variantId,
      onHand: toNumber(stock.onHand),
      reserved: toNumber(stock.reserved),
    })),
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      docType: order.docType,
      status: order.status,
      reservedApplied: Boolean(order.reservedAppliedAt),
      reservedReleased: Boolean(order.reservedReleasedAt),
    })),
    items: items.map((item) => ({
      id: item.id,
      salesOrderId: item.salesOrderId,
      variantId: item.variantId,
      quantity: toNumber(item.quantity),
      fulfillQty: toNumber(item.fulfillQty),
    })),
    fulfillments: fulfillments.map((fulfillment) => ({
      id: fulfillment.id,
      salesOrderId: fulfillment.salesOrderId,
      status: fulfillment.status,
      type: fulfillment.type,
    })),
    fulfillmentItems: fulfillmentItems.map((item) => ({
      id: item.id,
      fulfillmentId: item.fulfillmentId,
      salesOrderItemId: item.salesOrderItemId,
      variantId: item.variantId,
      orderedQty: toNumber(item.orderedQty),
      fulfilledQty: toNumber(item.fulfilledQty),
    })),
    movements: movements.map((movement) => ({
      id: movement.id,
      variantId: movement.variantId,
      type: movement.type,
      qty: toNumber(movement.qty),
      unit: movement.unit,
      note: movement.note,
    })),
  };
}

function stockReserved(snapshot: Snapshot, variantId: string) {
  return snapshot.stocks.find((stock) => stock.variantId === variantId)?.reserved ?? 0;
}

async function cleanupScenarioRecords() {
  await prisma.inventoryMovement.deleteMany({
    where: { variantId: { in: variantIds() } },
  });
  await prisma.salesOrder.deleteMany({ where: { customerId: fixture.customerId } });
  await prisma.inventoryStock.updateMany({
    where: { variantId: { in: variantIds() } },
    data: { onHand: 100, reserved: 0 },
  });
}

function lineFor(variant: FixtureVariant, quantity: number) {
  return {
    productId: variant.productId,
    variantId: variant.variantId,
    productSku: variant.sku,
    productTitle: variant.title,
    skuSnapshot: variant.sku,
    titleSnapshot: variant.title,
    uomSnapshot: variant.unit,
    lineDescription: variant.title,
    quantity,
    unitPrice: variant.price,
    lineDiscount: 0,
    lineTotal: variant.price * quantity,
  };
}

async function createDraftOrder(args: {
  label: string;
  docType?: "QUOTE" | "SALES_ORDER";
  lines: Array<ReturnType<typeof lineFor>>;
}) {
  orderCounter += 1;
  const subtotal = args.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  return prisma.salesOrder.create({
    data: {
      orderNumber: `${args.docType === "QUOTE" ? "QT" : "SO"}-RES-${RUN_ID}-${orderCounter}`,
      customerId: fixture.customerId,
      docType: args.docType ?? "SALES_ORDER",
      status: "DRAFT",
      fulfillmentMethod: "PICKUP",
      projectName: `${QA_MARKER} ${RUN_ID} ${args.label}`,
      subtotal,
      discount: 0,
      tax: 0,
      total: subtotal,
      balanceDue: subtotal,
      items: { create: args.lines },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
}

async function createBrokenDraftOrder() {
  orderCounter += 1;
  return prisma.salesOrder.create({
    data: {
      orderNumber: `SO-RES-${RUN_ID}-${orderCounter}`,
      customerId: fixture.customerId,
      docType: "SALES_ORDER",
      status: "DRAFT",
      fulfillmentMethod: "PICKUP",
      projectName: `${QA_MARKER} ${RUN_ID} broken missing variant`,
      subtotal: 5,
      discount: 0,
      tax: 0,
      total: 5,
      balanceDue: 5,
      items: {
        create: {
          productTitle: "Missing variant item",
          titleSnapshot: "Missing variant item",
          uomSnapshot: "PIECE",
          lineDescription: "Missing variant item",
          quantity: 1,
          unitPrice: 5,
          lineDiscount: 0,
          lineTotal: 5,
        },
      },
    },
    include: { items: true },
  });
}

async function patchStatus(
  request: APIRequestContext,
  orderId: string,
  status: string,
  expectedStatus = 200,
) {
  const response = await request.patch(`/api/sales-orders/${orderId}/status`, {
    headers: authHeaders(),
    data: { status },
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(expectedStatus);
  return body;
}

async function patchItemQuantity(
  request: APIRequestContext,
  orderId: string,
  itemId: string,
  quantity: number,
) {
  const response = await request.patch(`/api/sales-orders/${orderId}/items/${itemId}`, {
    headers: authHeaders(),
    data: { quantity },
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function deleteSalesOrderItem(
  request: APIRequestContext,
  orderId: string,
  itemId: string,
) {
  const response = await request.delete(`/api/sales-orders/${orderId}/items/${itemId}`, {
    headers: authHeaders(),
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function deleteSalesOrder(request: APIRequestContext, orderId: string) {
  const response = await request.delete(`/api/sales-orders/${orderId}`, {
    headers: authHeaders(),
  });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

test.describe.serial("sales order reservation integrity", () => {
  test.beforeAll(async () => {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: `${QA_MARKER} Customer ${RUN_ID}`,
        phone: "808-555-2201",
        email: `${RUN_ID}@example.com`,
        address: "220 Reservation Test Way",
      },
    });
    fixture = {
      customerId: customer.id,
      shared: await createFixtureVariant("shared"),
      other: await createFixtureVariant("other"),
    };
  });

  test.afterEach(async () => {
    await cleanupScenarioRecords();
  });

  test.afterAll(async () => {
    await cleanupScenarioRecords().catch(() => {});
    results.cleanup = await captureSnapshot().catch(() => ({
      stocks: [],
      orders: [],
      items: [],
      fulfillments: [],
      fulfillmentItems: [],
      movements: [],
    }));
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));

    await prisma.inventoryStock.deleteMany({ where: { variantId: { in: variantIds() } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds() } } });
    await prisma.salesProduct.deleteMany({
      where: { id: { in: [fixture.shared.productId, fixture.other.productId] } },
    });
    await prisma.salesCustomer.deleteMany({ where: { id: fixture.customerId } });
    await prisma.$disconnect();
  });

  test("confirmed order followed by Quote preserves the confirmed reservation", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "confirmed A",
      lines: [lineFor(fixture.shared, 1)],
    });
    const quoteB = await createDraftOrder({
      label: "quote B",
      docType: "QUOTE",
      lines: [lineFor(fixture.shared, 2)],
    });
    const before = await captureSnapshot([orderA.id, quoteB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    const afterConfirm = await captureSnapshot([orderA.id, quoteB.id]);
    expect(stockReserved(afterConfirm, fixture.shared.variantId)).toBe(1);
    expect(afterConfirm.movements).toHaveLength(1);

    await patchStatus(request, quoteB.id, "QUOTED");
    const after = await captureSnapshot([orderA.id, quoteB.id]);
    results.scenarios.confirmedThenQuote = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(1);
    expect(after.orders.find((order) => order.id === orderA.id)).toMatchObject({
      status: "CONFIRMED",
      reservedApplied: true,
      reservedReleased: false,
    });
    expect(after.orders.find((order) => order.id === quoteB.id)).toMatchObject({
      docType: "QUOTE",
      status: "QUOTED",
      reservedApplied: false,
    });
    expect(after.fulfillments.filter((fulfillment) => fulfillment.salesOrderId === quoteB.id)).toHaveLength(0);
    expect(after.movements).toHaveLength(1);
  });

  test("two confirmed orders aggregate reservation and repeated sync keeps the aggregate", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "confirmed A qty 2",
      lines: [lineFor(fixture.shared, 2)],
    });
    const orderB = await createDraftOrder({
      label: "confirmed B qty 3",
      lines: [lineFor(fixture.shared, 3)],
    });
    const before = await captureSnapshot([orderA.id, orderB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, orderB.id, "CONFIRMED");
    await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, orderA.id));
    await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, orderB.id));
    const after = await captureSnapshot([orderA.id, orderB.id]);
    results.scenarios.twoConfirmedAggregate = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(5);
    expect(after.movements.filter((movement) => movement.type === "RESERVE")).toHaveLength(2);
    expect(after.fulfillments).toHaveLength(2);
  });

  test("cancelling one confirmed order releases only that order contribution", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "cancel A qty 2",
      lines: [lineFor(fixture.shared, 2)],
    });
    const orderB = await createDraftOrder({
      label: "keep B qty 3",
      lines: [lineFor(fixture.shared, 3)],
    });
    const before = await captureSnapshot([orderA.id, orderB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, orderB.id, "CONFIRMED");
    expect(stockReserved(await captureSnapshot([orderA.id, orderB.id]), fixture.shared.variantId)).toBe(5);

    await patchStatus(request, orderA.id, "CANCELLED");
    const after = await captureSnapshot([orderA.id, orderB.id]);
    results.scenarios.cancelOneConfirmed = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(3);
    expect(after.orders.find((order) => order.id === orderA.id)).toMatchObject({
      status: "CANCELLED",
      reservedReleased: true,
    });
    expect(after.orders.find((order) => order.id === orderB.id)).toMatchObject({
      status: "CONFIRMED",
      reservedApplied: true,
      reservedReleased: false,
    });
  });

  test("quantity reduction and increase update only the aggregate contribution", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "quantity changing A",
      lines: [lineFor(fixture.shared, 5)],
    });
    const orderB = await createDraftOrder({
      label: "quantity steady B",
      lines: [lineFor(fixture.shared, 2)],
    });
    const before = await captureSnapshot([orderA.id, orderB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, orderB.id, "CONFIRMED");
    expect(stockReserved(await captureSnapshot([orderA.id, orderB.id]), fixture.shared.variantId)).toBe(7);

    await patchItemQuantity(request, orderA.id, orderA.items[0].id, 3);
    const afterReduction = await captureSnapshot([orderA.id, orderB.id]);
    expect(stockReserved(afterReduction, fixture.shared.variantId)).toBe(5);
    expect(afterReduction.items.find((item) => item.salesOrderId === orderB.id)?.quantity).toBe(2);

    await patchItemQuantity(request, orderA.id, orderA.items[0].id, 4);
    const after = await captureSnapshot([orderA.id, orderB.id]);
    results.scenarios.quantityChange = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(6);
    expect(after.items.find((item) => item.salesOrderId === orderB.id)?.quantity).toBe(2);
    expect(after.movements.filter((movement) => movement.type === "RESERVE")).toHaveLength(2);
  });

  test("deleting a confirmed line releases only that line variant contribution", async ({
    request,
  }) => {
    const order = await createDraftOrder({
      label: "delete confirmed line",
      lines: [lineFor(fixture.shared, 2), lineFor(fixture.other, 4)],
    });
    const before = await captureSnapshot([order.id]);

    await patchStatus(request, order.id, "CONFIRMED");
    expect(stockReserved(await captureSnapshot([order.id]), fixture.shared.variantId)).toBe(2);
    expect(stockReserved(await captureSnapshot([order.id]), fixture.other.variantId)).toBe(4);

    await deleteSalesOrderItem(request, order.id, order.items[0].id);
    const after = await captureSnapshot([order.id]);
    results.scenarios.deleteConfirmedLine = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(0);
    expect(stockReserved(after, fixture.other.variantId)).toBe(4);
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({
      variantId: fixture.other.variantId,
      quantity: 4,
    });
  });

  test("deleting one confirmed order preserves other active reservations", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "delete confirmed order A",
      lines: [lineFor(fixture.shared, 2)],
    });
    const orderB = await createDraftOrder({
      label: "preserve confirmed order B",
      lines: [lineFor(fixture.shared, 3)],
    });
    const before = await captureSnapshot([orderA.id, orderB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, orderB.id, "CONFIRMED");
    expect(stockReserved(await captureSnapshot([orderA.id, orderB.id]), fixture.shared.variantId)).toBe(5);

    await deleteSalesOrder(request, orderA.id);
    const after = await captureSnapshot([orderA.id, orderB.id]);
    results.scenarios.deleteConfirmedOrder = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(3);
    expect(after.orders).toHaveLength(1);
    expect(after.orders[0]).toMatchObject({
      status: "CONFIRMED",
      reservedApplied: true,
      reservedReleased: false,
    });
  });

  test("Quote with same variant on multiple lines does not affect active reservations", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "confirmed before multi-line quote",
      lines: [lineFor(fixture.shared, 1)],
    });
    const quoteB = await createDraftOrder({
      label: "multi-line quote",
      docType: "QUOTE",
      lines: [lineFor(fixture.shared, 2), lineFor(fixture.shared, 4)],
    });
    const before = await captureSnapshot([orderA.id, quoteB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, quoteB.id, "QUOTED");
    const after = await captureSnapshot([orderA.id, quoteB.id]);
    results.scenarios.multipleQuoteLines = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(1);
    expect(after.fulfillments.filter((fulfillment) => fulfillment.salesOrderId === quoteB.id)).toHaveLength(0);
    expect(after.movements).toHaveLength(1);
  });

  test("syncing one variant does not alter a different variant reservation", async ({
    request,
  }) => {
    const orderA = await createDraftOrder({
      label: "shared variant A",
      lines: [lineFor(fixture.shared, 2)],
    });
    const orderB = await createDraftOrder({
      label: "other variant B",
      lines: [lineFor(fixture.other, 4)],
    });
    const before = await captureSnapshot([orderA.id, orderB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, orderB.id, "CONFIRMED");
    await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, orderA.id));
    const after = await captureSnapshot([orderA.id, orderB.id]);
    results.scenarios.differentVariants = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(2);
    expect(stockReserved(after, fixture.other.variantId)).toBe(4);
  });

  test("repeated synchronization is idempotent", async ({ request }) => {
    const orderA = await createDraftOrder({
      label: "repeat sync A",
      lines: [lineFor(fixture.shared, 2)],
    });
    const orderB = await createDraftOrder({
      label: "repeat sync B",
      lines: [lineFor(fixture.shared, 3)],
    });
    const before = await captureSnapshot([orderA.id, orderB.id]);

    await patchStatus(request, orderA.id, "CONFIRMED");
    await patchStatus(request, orderB.id, "CONFIRMED");
    for (let i = 0; i < 3; i += 1) {
      await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, orderA.id));
    }
    const after = await captureSnapshot([orderA.id, orderB.id]);
    results.scenarios.repeatedSync = { before, after };

    expect(stockReserved(after, fixture.shared.variantId)).toBe(5);
    expect(after.movements.filter((movement) => movement.type === "RESERVE")).toHaveLength(2);
    expect(after.fulfillments).toHaveLength(2);
  });

  test("failed confirmation rolls back status, fulfillment, movement, and stock changes", async ({
    request,
  }) => {
    const brokenOrder = await createBrokenDraftOrder();
    const before = await captureSnapshot([brokenOrder.id]);

    await patchStatus(request, brokenOrder.id, "CONFIRMED", 400);
    const after = await captureSnapshot([brokenOrder.id]);
    results.scenarios.failedStatusTransition = { before, after };

    expect(after.orders.find((order) => order.id === brokenOrder.id)).toMatchObject({
      status: "DRAFT",
      reservedApplied: false,
    });
    expect(after.fulfillments).toHaveLength(0);
    expect(after.movements).toHaveLength(0);
    expect(after.stocks).toEqual(before.stocks);
  });
});
