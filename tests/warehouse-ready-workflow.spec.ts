import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSessionToken, getSessionCookieName } from "../lib/auth-session";

const RUN_ID = `phase3a2-ready-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE PHASE3A2 READY QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-phase3a2-ready-results.json";

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
      process.env[key] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

function assertSafeDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required for Phase 3A-2 Ready workflow tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run Phase 3A-2 Ready tests against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();

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
  readyTransition?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
} = {
  runId: RUN_ID,
  marker: QA_MARKER,
};

function sessionCookieValue() {
  return createSessionToken({
    userId: "phase3a2-ready-test-admin",
    role: "ADMIN",
    name: "Phase 3A-2 Ready Test Admin",
  });
}

async function installSession(page: Page) {
  await page.context().addCookies([
    {
      name: getSessionCookieName(),
      value: sessionCookieValue(),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
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
      phone: "808-555-3201",
      email: `${label}-${RUN_ID}@example.com`,
      address: "3201 Ready QA Way",
    },
  });
  createdCustomerIds.add(customer.id);
  return customer;
}

async function createVariant(label: string, reserved = 0) {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${QA_MARKER} ${label} Product ${RUN_ID}`,
      title: `${label} Product`,
      defaultDescription: `${QA_MARKER} ${label}`,
      unit: "PIECE",
      price: 25,
      cost: 10,
      availableStock: 50,
      active: true,
    },
  });
  createdProductIds.add(product.id);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `PH3A2-${label.toUpperCase()}-${RUN_ID}`,
      displayName: `${label} Variant`,
      description: `${QA_MARKER} ${label}`,
      price: 25,
      cost: 10,
      isStockItem: true,
    },
  });
  createdVariantIds.add(variant.id);
  await prisma.inventoryStock.create({
    data: { variantId: variant.id, onHand: 50, reserved },
  });
  return { product, variant };
}

async function createOrderWithFulfillment(args: {
  label: string;
  customerId: string;
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  type: "PICKUP" | "DELIVERY";
  fulfillmentStatus: "DRAFT" | "SCHEDULED" | "READY";
  quantity: number;
}) {
  const total = args.quantity * 25;
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A2-READY-${RUN_ID}-${args.label}`,
      customerId: args.customerId,
      docType: "SALES_ORDER",
      status: args.fulfillmentStatus === "READY" ? "READY" : "CONFIRMED",
      fulfillmentMethod: args.type,
      subtotal: total,
      discount: 0,
      tax: 0,
      total,
      paidAmount: 0,
      balanceDue: total,
      paymentStatus: "unpaid",
      notes: QA_MARKER,
      items: {
        create: {
          productId: args.productId,
          variantId: args.variantId,
          productSku: args.sku,
          productTitle: args.title,
          skuSnapshot: args.sku,
          titleSnapshot: args.title,
          uomSnapshot: "PIECE",
          lineDescription: args.title,
          quantity: args.quantity,
          unitPrice: 25,
          lineDiscount: 0,
          lineTotal: total,
        },
      },
    },
    include: { items: true },
  });
  createdOrderIds.add(order.id);
  const fulfillment = await prisma.salesOrderFulfillment.create({
    data: {
      salesOrderId: order.id,
      customerId: args.customerId,
      type: args.type,
      status: args.fulfillmentStatus,
      scheduledAt: new Date("2026-07-20T15:00:00.000Z"),
      scheduledDate: new Date("2026-07-20T00:00:00.000Z"),
      timeWindow: "8-10 AM",
      pickupContact: args.type === "PICKUP" ? `${QA_MARKER} Pickup Contact` : null,
      shiptoName: args.type === "DELIVERY" ? `${QA_MARKER} Ship To` : null,
      shiptoPhone: args.type === "DELIVERY" ? "808-555-3202" : null,
      shiptoAddress1: args.type === "DELIVERY" ? "3201 Ready QA Way" : null,
      shiptoCity: args.type === "DELIVERY" ? "Honolulu" : null,
      shiptoState: args.type === "DELIVERY" ? "HI" : null,
      shiptoZip: args.type === "DELIVERY" ? "96813" : null,
      notes: QA_MARKER,
      items: {
        create: order.items.map((item) => ({
          salesOrderItemId: item.id,
          variantId: item.variantId,
          title: item.titleSnapshot ?? item.lineDescription,
          sku: item.skuSnapshot ?? "-",
          unit: item.uomSnapshot ?? "PIECE",
          orderedQty: item.quantity,
          fulfilledQty: 0,
          notes: QA_MARKER,
        })),
      },
    },
    include: { items: true },
  });
  createdFulfillmentIds.add(fulfillment.id);
  fulfillment.items.forEach((item) => createdFulfillmentItemIds.add(item.id));
  return {
    orderId: order.id,
    fulfillmentId: fulfillment.id,
    orderNumber: order.orderNumber,
  };
}

async function captureSnapshot(orderIds: string[], variantIds: string[]) {
  const [orders, items, fulfillments, fulfillmentItems, stocks, movements, invoices, payments] =
    await Promise.all([
      prisma.salesOrder.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderNumber: true,
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
        select: { id: true, salesOrderId: true, quantity: true, fulfillQty: true, lineTotal: true },
        orderBy: [{ salesOrderId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.salesOrderFulfillment.findMany({
        where: { salesOrderId: { in: orderIds } },
        select: { id: true, salesOrderId: true, status: true, markedDoneAt: true, inventoryDeductedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.salesOrderFulfillmentItem.findMany({
        where: { fulfillment: { salesOrderId: { in: orderIds } } },
        select: { id: true, fulfillmentId: true, orderedQty: true, fulfilledQty: true },
        orderBy: [{ fulfillmentId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.inventoryStock.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, onHand: true, reserved: true },
        orderBy: { variantId: "asc" },
      }),
      prisma.inventoryMovement.findMany({
        where: { variantId: { in: variantIds } },
        select: { id: true, variantId: true, fulfillmentId: true, fulfillmentItemId: true, type: true, qty: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.invoice.count({ where: { salesOrderId: { in: orderIds } } }),
      prisma.salesOrderPayment.count({ where: { salesOrderId: { in: orderIds } } }),
    ]);
  return {
    orders: orders.map((order) => ({
      ...order,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      tax: Number(order.tax),
      total: Number(order.total),
      paidAmount: Number(order.paidAmount),
      balanceDue: Number(order.balanceDue),
    })),
    items: items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      fulfillQty: Number(item.fulfillQty),
      lineTotal: Number(item.lineTotal),
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
      orderedQty: Number(item.orderedQty),
      fulfilledQty: Number(item.fulfilledQty),
    })),
    stocks: stocks.map((stock) => ({
      variantId: stock.variantId,
      onHand: Number(stock.onHand),
      reserved: Number(stock.reserved),
    })),
    movements: movements.map((movement) => ({ ...movement, qty: Number(movement.qty) })),
    invoices,
    payments,
  };
}

test.describe("Warehouse Ready workflow real local database integrity", () => {
  test.beforeAll(async () => {
    results.beforeCounts = await tableCounts();
  });

  test.afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          { variantId: { in: Array.from(createdVariantIds) } },
          { fulfillmentId: { in: Array.from(createdFulfillmentIds) } },
          { fulfillmentItemId: { in: Array.from(createdFulfillmentItemIds) } },
        ],
      },
    });
    await prisma.salesOrder.deleteMany({ where: { id: { in: Array.from(createdOrderIds) } } });
    await prisma.inventoryStock.deleteMany({ where: { variantId: { in: Array.from(createdVariantIds) } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: Array.from(createdVariantIds) } } });
    await prisma.salesProduct.deleteMany({ where: { id: { in: Array.from(createdProductIds) } } });
    await prisma.salesCustomer.deleteMany({ where: { id: { in: Array.from(createdCustomerIds) } } });

    const afterCounts = await tableCounts();
    results.cleanup = {
      afterCounts,
      remainingTaggedOrders: await prisma.salesOrder.count({ where: { orderNumber: { contains: RUN_ID } } }),
      remainingTaggedFulfillments: await prisma.salesOrderFulfillment.count({
        where: { id: { in: Array.from(createdFulfillmentIds) } },
      }),
      remainingTaggedItems: await prisma.salesOrderItem.count({
        where: { salesOrderId: { in: Array.from(createdOrderIds) } },
      }),
      remainingTaggedStocks: await prisma.inventoryStock.count({
        where: { variantId: { in: Array.from(createdVariantIds) } },
      }),
      remainingTaggedMovements: await prisma.inventoryMovement.count({
        where: { variantId: { in: Array.from(createdVariantIds) } },
      }),
      remainingTaggedCustomers: await prisma.salesCustomer.count({ where: { name: { contains: RUN_ID } } }),
      remainingTaggedProducts: await prisma.salesProduct.count({ where: { name: { contains: RUN_ID } } }),
      remainingTaggedVariants: await prisma.productVariant.count({ where: { sku: { contains: RUN_ID } } }),
    };
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  });

  test("Mark Ready changes only fulfillment and canonical Sales Order status", async ({ page }) => {
    const customerA = await createCustomer("A");
    const customerB = await createCustomer("B");
    const customerControl = await createCustomer("Control");
    const shared = await createVariant("Shared", 5);
    const control = await createVariant("Control", 1);

    const orderA = await createOrderWithFulfillment({
      label: "pickup-a",
      customerId: customerA.id,
      productId: shared.product.id,
      variantId: shared.variant.id,
      sku: shared.variant.sku,
      title: shared.product.title ?? shared.product.name,
      type: "PICKUP",
      fulfillmentStatus: "SCHEDULED",
      quantity: 2,
    });
    const orderB = await createOrderWithFulfillment({
      label: "delivery-b",
      customerId: customerB.id,
      productId: shared.product.id,
      variantId: shared.variant.id,
      sku: shared.variant.sku,
      title: shared.product.title ?? shared.product.name,
      type: "DELIVERY",
      fulfillmentStatus: "SCHEDULED",
      quantity: 3,
    });
    const controlOrder = await createOrderWithFulfillment({
      label: "control",
      customerId: customerControl.id,
      productId: control.product.id,
      variantId: control.variant.id,
      sku: control.variant.sku,
      title: control.product.title ?? control.product.name,
      type: "PICKUP",
      fulfillmentStatus: "READY",
      quantity: 1,
    });

    const orderIds = [orderA.orderId, orderB.orderId, controlOrder.orderId];
    const variantIds = [shared.variant.id, control.variant.id];
    const before = await captureSnapshot(orderIds, variantIds);

    await installSession(page);
    await page.goto(`/warehouse?method=pickup&section=needsReady&search=${RUN_ID}`);
    await expect(page.getByText(orderA.orderNumber).first()).toBeVisible();
    const writes: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
        writes.push({ method: request.method(), url: request.url() });
      }
    });

    await page.locator(`[data-testid="warehouse-primary-action-${orderA.fulfillmentId}"]:visible`).click();
    await expect(page.getByTestId("warehouse-action-status")).toContainText(`${orderA.orderNumber} marked Ready.`);

    const afterReady = await captureSnapshot(orderIds, variantIds);
    const repeat = await page.request.patch(`/api/fulfillments/${orderA.fulfillmentId}`, {
      headers: { "x-user-role": "ADMIN" },
      data: { status: "ready" },
    });
    expect(repeat.ok()).toBe(true);
    const afterRepeat = await captureSnapshot(orderIds, variantIds);
    const invalid = await page.request.patch(`/api/fulfillments/${orderA.fulfillmentId}`, {
      headers: { "x-user-role": "ADMIN" },
      data: { status: "packing" },
    });
    expect(invalid.status()).toBe(400);
    const afterInvalid = await captureSnapshot(orderIds, variantIds);

    const orderAAfter = afterReady.orders.find((order) => order.id === orderA.orderId);
    const fulfillmentAAfter = afterReady.fulfillments.find((fulfillment) => fulfillment.id === orderA.fulfillmentId);
    expect(orderAAfter?.status).toBe("READY");
    expect(fulfillmentAAfter?.status).toBe("READY");

    const normalizeAllowedReadyChange = (snapshot: Awaited<ReturnType<typeof captureSnapshot>>) => ({
      ...snapshot,
      orders: snapshot.orders.map((order) =>
        order.id === orderA.orderId ? { ...order, status: "STATUS_ALLOWED_TO_CHANGE" } : order,
      ),
      fulfillments: snapshot.fulfillments.map((fulfillment) =>
        fulfillment.id === orderA.fulfillmentId ? { ...fulfillment, status: "STATUS_ALLOWED_TO_CHANGE" } : fulfillment,
      ),
    });

    expect(normalizeAllowedReadyChange(afterReady)).toEqual(normalizeAllowedReadyChange(before));
    expect(afterRepeat).toEqual(afterReady);
    expect(afterInvalid).toEqual(afterReady);
    expect(afterReady.stocks).toEqual(before.stocks);
    expect(afterReady.movements).toEqual(before.movements);
    expect(afterReady.items).toEqual(before.items);
    expect(afterReady.fulfillmentItems).toEqual(before.fulfillmentItems);
    expect(afterReady.invoices).toBe(0);
    expect(afterReady.payments).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toContain(`/api/fulfillments/${orderA.fulfillmentId}`);

    results.readyTransition = {
      orderIds,
      variantIds,
      fulfillmentIds: [orderA.fulfillmentId, orderB.fulfillmentId, controlOrder.fulfillmentId],
      before,
      afterReady,
      afterRepeat,
      afterInvalid,
      writes,
      resultsPath: RESULTS_PATH,
    };
  });
});
