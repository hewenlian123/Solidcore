import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureFulfillmentFromSalesOrder } from "../lib/fulfillment";
import { syncInventoryReservationForSalesOrder } from "../lib/sales-orders";

const prisma = new PrismaClient();
const RUN_ID = `phase3a0-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE PHASE3A0 QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-phase3a0-results.json";

type FixtureVariant = {
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  unit: string;
  price: number;
};

type FixtureOrder = {
  orderId: string;
  itemIds: string[];
  fulfillmentId: string;
  fulfillmentItemIds: string[];
};

type Snapshot = Awaited<ReturnType<typeof captureSnapshot>>;

const createdCustomerIds = new Set<string>();
const createdProductIds = new Set<string>();
const createdVariantIds = new Set<string>();
const createdOrderIds = new Set<string>();
const createdFulfillmentIds = new Set<string>();
const createdFulfillmentItemIds = new Set<string>();

const results: {
  runId: string;
  marker: string;
  beforeCounts?: Record<string, number>;
  scenarios: Record<string, { before: Snapshot; after: Snapshot; extra?: Record<string, unknown> }>;
  cleanup?: Record<string, unknown>;
} = {
  runId: RUN_ID,
  marker: QA_MARKER,
  scenarios: {},
};

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for Phase 3A-0.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run Phase 3A-0 against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

function createSessionCookie() {
  const payload = {
    userId: "phase3a0-test-admin",
    role: "ADMIN",
    name: "Phase 3A-0 Test Admin",
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

async function tableCounts() {
  const [
    customers,
    products,
    variants,
    stocks,
    orders,
    items,
    fulfillments,
    fulfillmentItems,
    movements,
    invoices,
    payments,
    outboundQueues,
  ] = await Promise.all([
    prisma.salesCustomer.count(),
    prisma.salesProduct.count(),
    prisma.productVariant.count(),
    prisma.inventoryStock.count(),
    prisma.salesOrder.count(),
    prisma.salesOrderItem.count(),
    prisma.salesOrderFulfillment.count(),
    prisma.salesOrderFulfillmentItem.count(),
    prisma.inventoryMovement.count(),
    prisma.invoice.count(),
    prisma.salesOrderPayment.count(),
    prisma.salesOutboundQueue.count(),
  ]);
  return {
    customers,
    products,
    variants,
    stocks,
    orders,
    items,
    fulfillments,
    fulfillmentItems,
    movements,
    invoices,
    payments,
    outboundQueues,
  };
}

async function createCustomer(label: string) {
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${QA_MARKER} ${label} ${RUN_ID}`,
      phone: "808-555-3000",
      email: `${label}-${RUN_ID}@example.com`,
      address: "3000 Fulfillment Way",
      taxExempt: false,
      taxRate: 0,
    },
  });
  createdCustomerIds.add(customer.id);
  return customer.id;
}

async function createVariant(label: string, onHand = 25): Promise<FixtureVariant> {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${QA_MARKER} ${label} product ${RUN_ID}`,
      title: `${label} product`,
      defaultDescription: `${QA_MARKER} ${label}`,
      unit: "PIECE",
      price: 10,
      cost: 4,
      availableStock: onHand,
      active: true,
    },
  });
  createdProductIds.add(product.id);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `PH3A0-${label.toUpperCase()}-${RUN_ID}`,
      displayName: `${label} variant`,
      description: `${label} variant ${QA_MARKER}`,
      price: product.price,
      cost: product.cost,
      isStockItem: true,
    },
  });
  createdVariantIds.add(variant.id);
  await prisma.inventoryStock.create({
    data: { variantId: variant.id, onHand, reserved: 0 },
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

async function createOrderWithFulfillment(args: {
  label: string;
  customerId?: string;
  status?: "DRAFT" | "QUOTED" | "CONFIRMED" | "READY" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED";
  lines: Array<{ variant: FixtureVariant; quantity: number }>;
  ensure?: boolean;
}): Promise<FixtureOrder> {
  const customerId = args.customerId ?? (await createCustomer(args.label));
  const total = args.lines.reduce((sum, line) => sum + line.quantity * line.variant.price, 0);
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A0-${RUN_ID}-${args.label}`,
      customerId,
      docType: "SALES_ORDER",
      status: args.status ?? "CONFIRMED",
      fulfillmentMethod: "PICKUP",
      subtotal: total,
      discount: 0,
      tax: 0,
      total,
      paidAmount: 0,
      balanceDue: total,
      paymentStatus: "unpaid",
      items: {
        create: args.lines.map((line) => ({
          productId: line.variant.productId,
          variantId: line.variant.variantId,
          productSku: line.variant.sku,
          productTitle: line.variant.title,
          skuSnapshot: line.variant.sku,
          titleSnapshot: line.variant.title,
          uomSnapshot: line.variant.unit,
          lineDescription: line.variant.title,
          quantity: line.quantity,
          unitPrice: line.variant.price,
          lineDiscount: 0,
          lineTotal: line.quantity * line.variant.price,
        })),
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  createdOrderIds.add(order.id);

  if (["CONFIRMED", "READY", "PARTIALLY_FULFILLED"].includes(order.status)) {
    await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, order.id));
  }

  let fulfillmentId = "";
  let fulfillmentItemIds: string[] = [];
  if (args.ensure ?? true) {
    const ensured = await prisma.$transaction((tx) =>
      ensureFulfillmentFromSalesOrder(tx, {
        salesOrderId: order.id,
        type: "PICKUP",
      }),
    );
    fulfillmentId = ensured.fulfillment.id;
    const fulfillmentItems = await prisma.salesOrderFulfillmentItem.findMany({
      where: { fulfillmentId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    fulfillmentItemIds = fulfillmentItems.map((item) => item.id);
    createdFulfillmentIds.add(fulfillmentId);
    fulfillmentItemIds.forEach((id) => createdFulfillmentItemIds.add(id));
  }

  return {
    orderId: order.id,
    itemIds: order.items.map((item) => item.id),
    fulfillmentId,
    fulfillmentItemIds,
  };
}

async function captureSnapshot(orderIds: string[], variantIds: string[]) {
  const [orders, items, fulfillments, fulfillmentItems, movements, stocks, invoices, payments] =
    await Promise.all([
      prisma.salesOrder.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderNumber: true,
          docType: true,
          status: true,
          subtotal: true,
          discount: true,
          tax: true,
          total: true,
          paidAmount: true,
          balanceDue: true,
        },
        orderBy: { orderNumber: "asc" },
      }),
      prisma.salesOrderItem.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: {
          id: true,
          salesOrderId: true,
          variantId: true,
          quantity: true,
          fulfillQty: true,
          lineTotal: true,
        },
        orderBy: [{ salesOrderId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.salesOrderFulfillment.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: {
          id: true,
          salesOrderId: true,
          status: true,
          markedDoneAt: true,
          inventoryDeductedAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.salesOrderFulfillmentItem.findMany({
        where: { fulfillment: { salesOrderId: { in: orderIds } } },
        select: {
          id: true,
          fulfillmentId: true,
          salesOrderItemId: true,
          variantId: true,
          orderedQty: true,
          fulfilledQty: true,
        },
        orderBy: [{ fulfillmentId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.inventoryMovement.findMany({
        where: { variantId: { in: variantIds } },
        select: {
          id: true,
          variantId: true,
          fulfillmentId: true,
          fulfillmentItemId: true,
          type: true,
          qty: true,
          unit: true,
          note: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.inventoryStock.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, onHand: true, reserved: true },
        orderBy: { variantId: "asc" },
      }),
      prisma.invoice.count({ where: { salesOrderId: { in: orderIds } } }),
      prisma.salesOrderPayment.count({ where: { salesOrderId: { in: orderIds } } }),
    ]);

  return {
    orders: orders.map((order) => ({
      ...order,
      subtotal: toNumber(order.subtotal),
      discount: toNumber(order.discount),
      tax: toNumber(order.tax),
      total: toNumber(order.total),
      paidAmount: toNumber(order.paidAmount),
      balanceDue: toNumber(order.balanceDue),
    })),
    items: items.map((item) => ({
      ...item,
      quantity: toNumber(item.quantity),
      fulfillQty: toNumber(item.fulfillQty),
      lineTotal: toNumber(item.lineTotal),
    })),
    fulfillments: fulfillments.map((fulfillment) => ({
      ...fulfillment,
      markedDone: Boolean(fulfillment.markedDoneAt),
      inventoryDeducted: Boolean(fulfillment.inventoryDeductedAt),
      markedDoneAt: undefined,
      inventoryDeductedAt: undefined,
    })),
    fulfillmentItems: fulfillmentItems.map((item) => ({
      ...item,
      orderedQty: toNumber(item.orderedQty),
      fulfilledQty: toNumber(item.fulfilledQty),
    })),
    movements: movements.map((movement) => ({
      ...movement,
      qty: toNumber(movement.qty),
    })),
    stocks: stocks.map((stock) => ({
      variantId: stock.variantId,
      onHand: toNumber(stock.onHand),
      reserved: toNumber(stock.reserved),
    })),
    invoices,
    payments,
  };
}

function movementQty(snapshot: Snapshot, variantId: string) {
  return snapshot.movements
    .filter((movement) => movement.variantId === variantId && movement.type === "FULFILLMENT_DEDUCT")
    .reduce((sum, movement) => sum + movement.qty, 0);
}

async function completeViaStatus(request: APIRequestContext, fulfillmentId: string, status = "completed") {
  return request.patch(`/api/fulfillments/${fulfillmentId}/status`, {
    headers: authHeaders(),
    data: { status },
  });
}

test.describe("Sales Order fulfillment and inventory integrity", () => {
  test.beforeAll(async () => {
    results.beforeCounts = await tableCounts();
  });

  test.afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: Array.from(createdVariantIds) } },
    });
    await prisma.salesOrder.deleteMany({ where: { id: { in: Array.from(createdOrderIds) } } });
    await prisma.inventoryStock.deleteMany({
      where: { variantId: { in: Array.from(createdVariantIds) } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: Array.from(createdVariantIds) } } });
    await prisma.salesProduct.deleteMany({ where: { id: { in: Array.from(createdProductIds) } } });
    await prisma.salesCustomer.deleteMany({ where: { id: { in: Array.from(createdCustomerIds) } } });

    const afterCounts = await tableCounts();
    const remainingFixtureMovements = await prisma.inventoryMovement.count({
      where: {
        OR: [
          { variantId: { in: Array.from(createdVariantIds) } },
          { fulfillmentId: { in: Array.from(createdFulfillmentIds) } },
          { fulfillmentItemId: { in: Array.from(createdFulfillmentItemIds) } },
        ],
      },
    });
    results.cleanup = {
      afterCounts,
      remainingFixtureMovements,
      remainingTaggedOrders: await prisma.salesOrder.count({
        where: { orderNumber: { contains: RUN_ID } },
      }),
      remainingTaggedCustomers: await prisma.salesCustomer.count({
        where: { name: { contains: RUN_ID } },
      }),
    };
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  });

  test("full completion deducts exactly once and fulfills the Sales Order", async ({ request }) => {
    const variant = await createVariant("full", 10);
    const order = await createOrderWithFulfillment({
      label: "full",
      lines: [{ variant, quantity: 3 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await completeViaStatus(request, order.fulfillmentId);
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.fullCompletion = { before, after };

    expect(after.stocks[0]).toMatchObject({ onHand: 7, reserved: 0 });
    expect(after.items[0].fulfillQty).toBe(3);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(3);
    expect(after.movements).toHaveLength(1);
    expect(movementQty(after, variant.variantId)).toBe(-3);
    expect(after.fulfillments[0]).toMatchObject({
      status: "COMPLETED",
      markedDone: true,
      inventoryDeducted: true,
    });
    expect(after.orders[0].status).toBe("FULFILLED");
  });

  test("repeated completion is idempotent", async ({ request }) => {
    const variant = await createVariant("repeat", 10);
    const order = await createOrderWithFulfillment({
      label: "repeat",
      lines: [{ variant, quantity: 3 }],
    });
    const first = await completeViaStatus(request, order.fulfillmentId);
    expect(first.ok()).toBeTruthy();
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const second = await completeViaStatus(request, order.fulfillmentId);
    const body = await second.json();
    expect(second.status(), JSON.stringify(body)).toBe(200);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.repeatedCompletion = { before, after };

    expect(after.stocks).toEqual(before.stocks);
    expect(after.movements).toHaveLength(before.movements.length);
    expect(after.items[0].fulfillQty).toBe(3);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(3);
    expect(after.orders[0].status).toBe("FULFILLED");
  });

  test("shared variant preserves the other confirmed order reservation", async ({ request }) => {
    const variant = await createVariant("shared", 20);
    const customerId = await createCustomer("shared");
    const orderA = await createOrderWithFulfillment({
      label: "shared-a",
      customerId,
      lines: [{ variant, quantity: 2 }],
    });
    const orderB = await createOrderWithFulfillment({
      label: "shared-b",
      customerId,
      lines: [{ variant, quantity: 3 }],
    });
    const before = await captureSnapshot([orderA.orderId, orderB.orderId], [variant.variantId]);
    expect(before.stocks[0].reserved).toBe(5);
    const response = await completeViaStatus(request, orderA.fulfillmentId);
    expect(response.ok()).toBeTruthy();
    const after = await captureSnapshot([orderA.orderId, orderB.orderId], [variant.variantId]);
    results.scenarios.sharedVariant = { before, after };

    expect(after.stocks[0]).toMatchObject({ onHand: 18, reserved: 3 });
    expect(after.orders.find((order) => order.id === orderA.orderId)?.status).toBe("FULFILLED");
    expect(after.orders.find((order) => order.id === orderB.orderId)?.status).toBe("CONFIRMED");
    expect(after.items.find((item) => item.salesOrderId === orderB.orderId)?.fulfillQty).toBe(0);
  });

  test("partial quantity deducts only the new delta and keeps remaining reservation", async ({
    request,
  }) => {
    const variant = await createVariant("partial", 12);
    const order = await createOrderWithFulfillment({
      label: "partial",
      lines: [{ variant, quantity: 5 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await request.patch(`/api/fulfillment-items/${order.fulfillmentItemIds[0]}`, {
      headers: authHeaders(),
      data: { fulfilledQty: 2 },
    });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.partialQuantity = { before, after };

    expect(after.stocks[0]).toMatchObject({ onHand: 10, reserved: 3 });
    expect(after.items[0].fulfillQty).toBe(2);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(2);
    expect(after.movements).toHaveLength(1);
    expect(movementQty(after, variant.variantId)).toBe(-2);
    expect(after.orders[0].status).toBe("PARTIALLY_FULFILLED");
    expect(after.fulfillments[0].status).toBe("PARTIAL");
  });

  test("DRAFT, QUOTED, and CANCELLED orders cannot be fulfilled and do not mutate", async ({
    request,
  }) => {
    const variant = await createVariant("invalid", 20);
    const statuses = ["DRAFT", "QUOTED", "CANCELLED"] as const;
    for (const status of statuses) {
      const order = await createOrderWithFulfillment({
        label: `invalid-${status.toLowerCase()}`,
        status,
        lines: [{ variant, quantity: 1 }],
      });
      const before = await captureSnapshot([order.orderId], [variant.variantId]);
      const response = await completeViaStatus(request, order.fulfillmentId);
      expect(response.status()).toBe(409);
      const after = await captureSnapshot([order.orderId], [variant.variantId]);
      results.scenarios[`invalidStatus${status}`] = { before, after };
      expect(after).toEqual(before);
    }
  });

  test("insufficient stock rejects and leaves fulfillment state unchanged", async ({ request }) => {
    const variant = await createVariant("insufficient", 3);
    const order = await createOrderWithFulfillment({
      label: "insufficient",
      lines: [{ variant, quantity: 3 }],
    });
    await prisma.inventoryStock.update({
      where: { variantId: variant.variantId },
      data: { onHand: 2 },
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await completeViaStatus(request, order.fulfillmentId);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.insufficientStock = {
      before,
      after,
      extra: { status: response.status(), body: await response.json().catch(() => null) },
    };

    expect(response.status()).toBe(400);
    expect(after).toEqual(before);
  });

  test("failure after an intermediate line rolls back stock, movement, status and money", async ({
    request,
  }) => {
    const first = await createVariant("rollback-first", 5);
    const second = await createVariant("rollback-second", 2);
    const order = await createOrderWithFulfillment({
      label: "rollback",
      lines: [
        { variant: first, quantity: 1 },
        { variant: second, quantity: 2 },
      ],
    });
    await prisma.inventoryStock.update({
      where: { variantId: second.variantId },
      data: { onHand: 1 },
    });
    const before = await captureSnapshot(
      [order.orderId],
      [first.variantId, second.variantId],
    );
    const response = await completeViaStatus(request, order.fulfillmentId);
    const after = await captureSnapshot(
      [order.orderId],
      [first.variantId, second.variantId],
    );
    results.scenarios.transactionRollback = {
      before,
      after,
      extra: { status: response.status(), body: await response.json().catch(() => null) },
    };

    expect(response.status()).toBe(400);
    expect(after).toEqual(before);
  });

  test("legacy Sales Order fulfillment wrapper delegates to canonical completion", async ({
    request,
  }) => {
    const variant = await createVariant("wrapper", 9);
    const order = await createOrderWithFulfillment({
      label: "wrapper",
      lines: [{ variant, quantity: 2 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await request.patch(
      `/api/sales-orders/${order.orderId}/fulfillments/${order.fulfillmentId}`,
      {
        headers: authHeaders(),
        data: { status: "COMPLETED" },
      },
    );
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.legacyWrapper = { before, after };

    expect(after.stocks[0]).toMatchObject({ onHand: 7, reserved: 0 });
    expect(after.movements).toHaveLength(1);
    expect(after.orders[0].status).toBe("FULFILLED");
  });

  test("legacy fulfillment route also delegates to canonical completion", async ({ request }) => {
    const variant = await createVariant("legacy-route", 9);
    const order = await createOrderWithFulfillment({
      label: "legacy-route",
      lines: [{ variant, quantity: 2 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await request.patch(`/api/fulfillment/${order.fulfillmentId}`, {
      headers: authHeaders(),
      data: { status: "completed" },
    });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.legacyFulfillmentRoute = { before, after };

    expect(after.stocks[0]).toMatchObject({ onHand: 7, reserved: 0 });
    expect(after.movements).toHaveLength(1);
    expect(after.orders[0].status).toBe("FULFILLED");
  });

  test("direct Sales Order item fulfillQty edit is rejected without mutation", async ({
    request,
  }) => {
    const variant = await createVariant("direct-item", 10);
    const order = await createOrderWithFulfillment({
      label: "direct-item",
      lines: [{ variant, quantity: 2 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await request.patch(
      `/api/sales-orders/${order.orderId}/items/${order.itemIds[0]}`,
      {
        headers: authHeaders(),
        data: { fulfillQty: 1 },
      },
    );
    expect(response.status()).toBe(409);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.directFulfillQtyRejected = { before, after };

    expect(after).toEqual(before);
  });

  test("direct Sales Order FULFILLED status is rejected without mutation", async ({
    request,
  }) => {
    const variant = await createVariant("direct-status", 10);
    const order = await createOrderWithFulfillment({
      label: "direct-status",
      lines: [{ variant, quantity: 2 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await request.patch(`/api/sales-orders/${order.orderId}/status`, {
      headers: authHeaders(),
      data: { status: "FULFILLED" },
    });
    expect(response.status()).toBe(409);
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.directFulfilledStatusRejected = { before, after };

    expect(after).toEqual(before);
  });

  test("fulfilling one variant does not mutate unrelated variant stock", async ({ request }) => {
    const fulfilledVariant = await createVariant("unrelated-a", 10);
    const unrelatedVariant = await createVariant("unrelated-b", 10);
    const order = await createOrderWithFulfillment({
      label: "unrelated",
      lines: [{ variant: fulfilledVariant, quantity: 2 }],
    });
    const before = await captureSnapshot(
      [order.orderId],
      [fulfilledVariant.variantId, unrelatedVariant.variantId],
    );
    const response = await completeViaStatus(request, order.fulfillmentId);
    expect(response.ok()).toBeTruthy();
    const after = await captureSnapshot(
      [order.orderId],
      [fulfilledVariant.variantId, unrelatedVariant.variantId],
    );
    results.scenarios.unrelatedVariant = { before, after };

    const beforeUnrelated = before.stocks.find((stock) => stock.variantId === unrelatedVariant.variantId);
    const afterUnrelated = after.stocks.find((stock) => stock.variantId === unrelatedVariant.variantId);
    expect(afterUnrelated).toEqual(beforeUnrelated);
  });

  test("financial fields, invoices and payments are not mutated by fulfillment", async ({
    request,
  }) => {
    const variant = await createVariant("financial", 10);
    const order = await createOrderWithFulfillment({
      label: "financial",
      lines: [{ variant, quantity: 2 }],
    });
    await prisma.salesOrder.update({
      where: { id: order.orderId },
      data: {
        discount: 1,
        tax: 0.5,
        total: 19.5,
        paidAmount: 4,
        balanceDue: 15.5,
        paymentStatus: "partial",
      },
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const response = await completeViaStatus(request, order.fulfillmentId);
    expect(response.ok()).toBeTruthy();
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.financialNonMutation = { before, after };

    expect(after.orders[0]).toMatchObject({
      subtotal: before.orders[0].subtotal,
      discount: before.orders[0].discount,
      tax: before.orders[0].tax,
      total: before.orders[0].total,
      paidAmount: before.orders[0].paidAmount,
      balanceDue: before.orders[0].balanceDue,
    });
    expect(after.invoices).toBe(before.invoices);
    expect(after.payments).toBe(before.payments);
  });

  test("concurrent duplicate completion creates one logical deduction only", async ({
    request,
  }) => {
    const variant = await createVariant("double", 10);
    const order = await createOrderWithFulfillment({
      label: "double",
      lines: [{ variant, quantity: 3 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const [first, second] = await Promise.all([
      completeViaStatus(request, order.fulfillmentId),
      completeViaStatus(request, order.fulfillmentId),
    ]);
    expect([first.status(), second.status()].every((status) => status === 200)).toBeTruthy();
    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.concurrentDuplicate = {
      before,
      after,
      extra: { statuses: [first.status(), second.status()] },
    };

    expect(after.stocks[0]).toMatchObject({ onHand: 7, reserved: 0 });
    expect(after.movements).toHaveLength(1);
    expect(movementQty(after, variant.variantId)).toBe(-3);
    expect(after.items[0].fulfillQty).toBe(3);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(3);
  });
});
