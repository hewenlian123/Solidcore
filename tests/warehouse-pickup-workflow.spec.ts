import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSessionToken, getSessionCookieName } from "../lib/auth-session";
import { ensureFulfillmentFromSalesOrder } from "../lib/fulfillment";
import {
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "../lib/sales-orders";

const prisma = new PrismaClient();
const RUN_ID = `phase3a3-pickup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE PHASE3A3 PICKUP QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-phase3a3-pickup-results.json";

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
  orderNumber: string;
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
const createdSupplierIds = new Set<string>();
const createdPurchaseOrderIds = new Set<string>();

const results: {
  runId: string;
  marker: string;
  beforeCounts?: Record<string, number>;
  scenarios: Record<string, Record<string, unknown>>;
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
      process.env[key] = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

function assertSafeDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl)
    throw new Error(
      "DATABASE_URL is required for Phase 3A-3 Pickup workflow tests.",
    );
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error(
      "Refusing to run Phase 3A-3 pickup tests against a non-local, non-test database.",
    );
  }
}

loadLocalEnv();
assertSafeDatabase();

function sessionCookieValue() {
  return createSessionToken({
    userId: "phase3a3-pickup-test-admin",
    role: "ADMIN",
    name: "Phase 3A-3 Pickup Test Admin",
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
    suppliers,
    purchaseOrders,
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
    prisma.supplier.count(),
    prisma.purchaseOrder.count(),
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
    suppliers,
    purchaseOrders,
  };
}

async function createCustomer(label: string) {
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${QA_MARKER} ${label} ${RUN_ID}`,
      phone: "808-555-3300",
      email: `${label}-${RUN_ID}@example.com`,
      address: "3300 Pickup QA Way",
      taxExempt: false,
      taxRate: 0,
    },
  });
  createdCustomerIds.add(customer.id);
  return customer.id;
}

async function createVariant(
  label: string,
  onHand = 25,
): Promise<FixtureVariant> {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${QA_MARKER} ${label} product ${RUN_ID}`,
      title: `${label} product`,
      defaultDescription: `${QA_MARKER} ${label}`,
      unit: "PIECE",
      price: 12,
      cost: 5,
      availableStock: onHand,
      active: true,
    },
  });
  createdProductIds.add(product.id);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `PH3A3-${label.toUpperCase()}-${RUN_ID}`,
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

async function createSpecialPurchaseOrder(label: string) {
  const supplier = await prisma.supplier.create({
    data: {
      name: `${QA_MARKER} ${label} Supplier ${RUN_ID}`,
      contactName: "Phase 3A-3 Supplier Contact",
      phone: "808-555-3301",
      category: "Special Order QA",
    },
  });
  createdSupplierIds.add(supplier.id);
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      poNumber: `PO-PH3A3-${RUN_ID}-${label}`,
      supplierId: supplier.id,
      status: "ORDERED",
      orderDate: new Date("2026-07-20T00:00:00.000Z"),
      expectedArrival: new Date("2026-08-15T00:00:00.000Z"),
      totalCost: 24,
      notes: QA_MARKER,
    },
  });
  createdPurchaseOrderIds.add(purchaseOrder.id);
  return { supplier, purchaseOrder };
}

async function createPickupOrder(args: {
  label: string;
  variant: FixtureVariant;
  quantity: number;
  customerId?: string;
  orderStatus?: "CONFIRMED" | "READY" | "PARTIALLY_FULFILLED";
  fulfillmentStatus?: "DRAFT" | "SCHEDULED" | "READY" | "PARTIAL";
  special?: boolean;
  linkedPoId?: string;
}): Promise<FixtureOrder> {
  const customerId = args.customerId ?? (await createCustomer(args.label));
  const total = args.quantity * args.variant.price;
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A3-PICKUP-${RUN_ID}-${args.label}`,
      customerId,
      docType: "SALES_ORDER",
      status: args.orderStatus ?? "READY",
      fulfillmentMethod: "PICKUP",
      specialOrder: Boolean(args.special),
      specialOrderStatus: args.special ? "ARRIVED" : null,
      etaDate: args.special ? new Date("2026-08-15T00:00:00.000Z") : null,
      subtotal: total,
      discount: 1,
      tax: 0.5,
      total: total - 0.5,
      paidAmount: 2,
      balanceDue: total - 2.5,
      paymentStatus: "partial",
      notes: QA_MARKER,
      items: {
        create: {
          productId: args.variant.productId,
          variantId: args.variant.variantId,
          productSku: args.variant.sku,
          productTitle: args.variant.title,
          skuSnapshot: args.variant.sku,
          titleSnapshot: args.variant.title,
          uomSnapshot: args.variant.unit,
          lineDescription: args.variant.title,
          quantity: args.quantity,
          unitPrice: args.variant.price,
          lineDiscount: 0,
          lineTotal: total,
          isSpecialOrder: Boolean(args.special),
          specialOrderStatus: args.special ? "ARRIVED" : null,
          linkedPoId: args.linkedPoId ?? null,
          notes: QA_MARKER,
        },
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  createdOrderIds.add(order.id);
  await prisma.$transaction((tx) =>
    syncInventoryReservationForSalesOrder(tx, order.id),
  );

  const ensured = await prisma.$transaction((tx) =>
    ensureFulfillmentFromSalesOrder(tx, {
      salesOrderId: order.id,
      type: "PICKUP",
    }),
  );
  const fulfillment = await prisma.salesOrderFulfillment.update({
    where: { id: ensured.fulfillment.id },
    data: {
      status: args.fulfillmentStatus ?? "READY",
      scheduledAt: new Date("2026-07-20T15:00:00.000Z"),
      scheduledDate: new Date("2026-07-20T00:00:00.000Z"),
      pickupContact: `${QA_MARKER} Pickup Contact`,
      notes: QA_MARKER,
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  createdFulfillmentIds.add(fulfillment.id);
  fulfillment.items.forEach((item) => createdFulfillmentItemIds.add(item.id));
  await prisma.$transaction((tx) => syncSalesOutboundQueue(tx, order.id));

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    fulfillmentId: fulfillment.id,
    fulfillmentItemIds: fulfillment.items.map((item) => item.id),
  };
}

async function captureSnapshot(orderIds: string[], variantIds: string[]) {
  const [
    orders,
    items,
    fulfillments,
    fulfillmentItems,
    stocks,
    movements,
    invoices,
    payments,
    purchaseOrders,
  ] = await Promise.all([
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
        paymentStatus: true,
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
        isSpecialOrder: true,
        specialOrderStatus: true,
        linkedPoId: true,
      },
      orderBy: [{ salesOrderId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.salesOrderFulfillment.findMany({
      where: { salesOrderId: { in: orderIds } },
      select: {
        id: true,
        salesOrderId: true,
        type: true,
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
    prisma.inventoryStock.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, onHand: true, reserved: true },
      orderBy: { variantId: "asc" },
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
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invoice.count({ where: { salesOrderId: { in: orderIds } } }),
    prisma.salesOrderPayment.count({
      where: { salesOrderId: { in: orderIds } },
    }),
    prisma.purchaseOrder.findMany({
      where: { id: { in: Array.from(createdPurchaseOrderIds) } },
      select: {
        id: true,
        poNumber: true,
        status: true,
        expectedArrival: true,
        totalCost: true,
        supplierId: true,
      },
      orderBy: { poNumber: "asc" },
    }),
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
    stocks: stocks.map((stock) => ({
      variantId: stock.variantId,
      onHand: toNumber(stock.onHand),
      reserved: toNumber(stock.reserved),
    })),
    movements: movements.map((movement) => ({
      ...movement,
      qty: toNumber(movement.qty),
    })),
    invoices,
    payments,
    purchaseOrders: purchaseOrders.map((po) => ({
      ...po,
      totalCost: toNumber(po.totalCost),
      expectedArrival: po.expectedArrival?.toISOString() ?? null,
    })),
  };
}

function movementQty(snapshot: Snapshot, variantId: string) {
  return snapshot.movements
    .filter(
      (movement) =>
        movement.variantId === variantId &&
        movement.type === "FULFILLMENT_DEDUCT",
    )
    .reduce((sum, movement) => sum + movement.qty, 0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow).toBe(false);
}

test.describe("Warehouse Pickup workflow", () => {
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
    await prisma.salesOrder.deleteMany({
      where: { id: { in: Array.from(createdOrderIds) } },
    });
    await prisma.inventoryStock.deleteMany({
      where: { variantId: { in: Array.from(createdVariantIds) } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: Array.from(createdVariantIds) } },
    });
    await prisma.salesProduct.deleteMany({
      where: { id: { in: Array.from(createdProductIds) } },
    });
    await prisma.purchaseOrder.deleteMany({
      where: { id: { in: Array.from(createdPurchaseOrderIds) } },
    });
    await prisma.supplier.deleteMany({
      where: { id: { in: Array.from(createdSupplierIds) } },
    });
    await prisma.salesCustomer.deleteMany({
      where: { id: { in: Array.from(createdCustomerIds) } },
    });

    const afterCounts = await tableCounts();
    results.cleanup = {
      afterCounts,
      remainingTaggedOrders: await prisma.salesOrder.count({
        where: { orderNumber: { contains: RUN_ID } },
      }),
      remainingTaggedCustomers: await prisma.salesCustomer.count({
        where: { name: { contains: RUN_ID } },
      }),
      remainingTaggedProducts: await prisma.salesProduct.count({
        where: { name: { contains: RUN_ID } },
      }),
      remainingTaggedVariants: await prisma.productVariant.count({
        where: { sku: { contains: RUN_ID } },
      }),
      remainingTaggedMovements: await prisma.inventoryMovement.count({
        where: {
          OR: [
            { variantId: { in: Array.from(createdVariantIds) } },
            { fulfillmentId: { in: Array.from(createdFulfillmentIds) } },
            {
              fulfillmentItemId: { in: Array.from(createdFulfillmentItemIds) },
            },
          ],
        },
      }),
      remainingTaggedPurchaseOrders: await prisma.purchaseOrder.count({
        where: { poNumber: { contains: RUN_ID } },
      }),
      remainingTaggedSuppliers: await prisma.supplier.count({
        where: { name: { contains: RUN_ID } },
      }),
    };
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  });

  test("Ready Pickup opens from Warehouse and Complete Pickup deducts inventory once", async ({
    page,
  }) => {
    const variant = await createVariant("shared", 15);
    const customerId = await createCustomer("shared-customer");
    const orderA = await createPickupOrder({
      label: "shared-a",
      customerId,
      variant,
      quantity: 2,
    });
    const orderB = await createPickupOrder({
      label: "shared-b",
      customerId,
      variant,
      quantity: 3,
      orderStatus: "CONFIRMED",
      fulfillmentStatus: "READY",
    });
    const before = await captureSnapshot(
      [orderA.orderId, orderB.orderId],
      [variant.variantId],
    );
    expect(before.stocks[0]).toMatchObject({ onHand: 15, reserved: 5 });

    await installSession(page);
    const writes: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
        writes.push({ method: request.method(), url: request.url() });
      }
    });

    await page.goto(
      `/warehouse?method=pickup&section=ready&search=${orderA.orderNumber}`,
    );
    await expect(
      page.getByRole("link", { name: orderA.orderNumber }).first(),
    ).toBeVisible();
    await page
      .locator(
        `[data-testid="warehouse-primary-action-${orderA.fulfillmentId}"]:visible`,
      )
      .click();
    await expect(
      page.getByRole("heading", { name: `Pickup · ${orderA.orderNumber}` }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pickup-complete-action")).toBeVisible();
    await page.getByTestId("pickup-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText(
      "Pickup completed.",
    );

    const after = await captureSnapshot(
      [orderA.orderId, orderB.orderId],
      [variant.variantId],
    );
    results.scenarios.readyComplete = { before, after, writes };

    expect(after.stocks[0]).toMatchObject({ onHand: 13, reserved: 3 });
    expect(movementQty(after, variant.variantId)).toBe(-2);
    expect(
      after.movements.filter(
        (movement) => movement.fulfillmentId === orderA.fulfillmentId,
      ),
    ).toHaveLength(1);
    expect(
      after.orders.find((order) => order.id === orderA.orderId)?.status,
    ).toBe("FULFILLED");
    expect(
      after.orders.find((order) => order.id === orderB.orderId)?.status,
    ).toBe("CONFIRMED");
    expect(
      after.fulfillments.find(
        (fulfillment) => fulfillment.id === orderA.fulfillmentId,
      )?.status,
    ).toBe("PICKED_UP");
    expect(
      after.items.find((item) => item.salesOrderId === orderB.orderId)
        ?.fulfillQty,
    ).toBe(0);
    expect(
      after.orders.find((order) => order.id === orderA.orderId),
    ).toMatchObject({
      subtotal: before.orders.find((order) => order.id === orderA.orderId)
        ?.subtotal,
      discount: before.orders.find((order) => order.id === orderA.orderId)
        ?.discount,
      tax: before.orders.find((order) => order.id === orderA.orderId)?.tax,
      total: before.orders.find((order) => order.id === orderA.orderId)?.total,
      paidAmount: before.orders.find((order) => order.id === orderA.orderId)
        ?.paidAmount,
      balanceDue: before.orders.find((order) => order.id === orderA.orderId)
        ?.balanceDue,
    });
    expect(after.invoices).toBe(before.invoices);
    expect(after.payments).toBe(before.payments);
    expect(
      writes.filter((write) =>
        write.url.includes(`/api/fulfillments/${orderA.fulfillmentId}/pickup`),
      ),
    ).toHaveLength(1);
  });

  test("partial pickup deducts entered quantity only and keeps the remaining reservation", async ({
    page,
  }) => {
    const variant = await createVariant("partial", 12);
    const order = await createPickupOrder({
      label: "partial",
      variant,
      quantity: 5,
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);

    await installSession(page);
    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await expect(page.getByTestId("pickup-complete-action")).toBeVisible();
    await page
      .getByTestId(`fulfillment-item-qty-${order.fulfillmentItemIds[0]}`)
      .fill("2");
    await page.getByTestId("pickup-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText(
      "Partial pickup recorded.",
    );

    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.partialPickup = { before, after };

    expect(after.stocks[0]).toMatchObject({ onHand: 10, reserved: 3 });
    expect(movementQty(after, variant.variantId)).toBe(-2);
    expect(after.items[0].fulfillQty).toBe(2);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(2);
    expect(after.orders[0].status).toBe("PARTIALLY_FULFILLED");
    expect(after.fulfillments[0].status).toBe("PARTIAL");

    await page.goto(
      `/warehouse?method=pickup&section=needsReady&search=${order.orderNumber}`,
    );
    await expect(
      page.getByRole("link", { name: order.orderNumber }).first(),
    ).toBeVisible();
  });

  test("duplicate Complete Pickup clicks produce one logical fulfillment", async ({
    page,
  }) => {
    const variant = await createVariant("duplicate", 5);
    const order = await createPickupOrder({
      label: "duplicate",
      variant,
      quantity: 1,
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);

    await installSession(page);
    let pickupPatchCount = 0;
    await page.route(
      `**/api/fulfillments/${order.fulfillmentId}/pickup`,
      async (route) => {
        pickupPatchCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        await route.continue();
      },
    );

    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await page.getByTestId("pickup-complete-action").dblclick();
    await expect(page.getByTestId("fulfillment-success")).toContainText(
      "Pickup completed.",
    );

    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.duplicateClick = { before, after, pickupPatchCount };

    expect(pickupPatchCount).toBe(1);
    expect(after.stocks[0]).toMatchObject({ onHand: 4, reserved: 0 });
    expect(after.movements).toHaveLength(1);
    expect(movementQty(after, variant.variantId)).toBe(-1);
    await expect(
      prisma.salesFulfillmentEvent.count({
        where: { fulfillmentId: order.fulfillmentId },
      }),
    ).resolves.toBe(1);
  });

  test("insufficient stock fails without mutation and retry can complete the draft", async ({
    page,
  }) => {
    const variant = await createVariant("retry", 4);
    const order = await createPickupOrder({
      label: "retry",
      variant,
      quantity: 4,
    });
    await prisma.inventoryStock.update({
      where: { variantId: variant.variantId },
      data: { onHand: 1 },
    });
    const beforeFailure = await captureSnapshot(
      [order.orderId],
      [variant.variantId],
    );

    await installSession(page);
    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await page.getByTestId("pickup-complete-action").click();
    await expect(page.getByTestId("fulfillment-error")).toContainText(
      "Insufficient stock",
    );
    await expect(page.getByTestId("pickup-complete-action")).toBeEnabled();
    const afterFailure = await captureSnapshot(
      [order.orderId],
      [variant.variantId],
    );
    expect(afterFailure).toEqual(beforeFailure);

    await prisma.inventoryStock.update({
      where: { variantId: variant.variantId },
      data: { onHand: 4 },
    });
    await page.getByTestId("pickup-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText(
      "Pickup completed.",
    );
    const afterRetry = await captureSnapshot(
      [order.orderId],
      [variant.variantId],
    );
    results.scenarios.failureRetry = {
      beforeFailure,
      afterFailure,
      afterRetry,
    };

    expect(afterRetry.stocks[0]).toMatchObject({ onHand: 0, reserved: 0 });
    expect(afterRetry.movements).toHaveLength(1);
    expect(afterRetry.orders[0].status).toBe("FULFILLED");
  });

  test("Special Order warning is informational and pickup does not mutate purchasing", async ({
    page,
  }) => {
    const variant = await createVariant("special", 4);
    const { purchaseOrder } = await createSpecialPurchaseOrder("special");
    const order = await createPickupOrder({
      label: "special",
      variant,
      quantity: 2,
      special: true,
      linkedPoId: purchaseOrder.id,
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);

    await installSession(page);
    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await expect(
      page.getByTestId("pickup-special-order-warning"),
    ).toContainText("Special Order");
    await expect(
      page.getByTestId("pickup-special-order-warning"),
    ).toContainText("ARRIVED");
    await page.getByTestId("pickup-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText(
      "Pickup completed.",
    );

    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.specialOrderSafety = { before, after };

    expect(after.purchaseOrders).toEqual(before.purchaseOrders);
    expect(after.items[0]).toMatchObject({
      isSpecialOrder: true,
      specialOrderStatus: "ARRIVED",
      linkedPoId: purchaseOrder.id,
    });
    expect(after.stocks[0]).toMatchObject({ onHand: 2, reserved: 0 });
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet landscape", width: 1180, height: 820 },
    { name: "tablet portrait", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`Pickup detail remains usable without horizontal overflow at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      const variant = await createVariant(
        `responsive-${viewport.name.replace(/\s+/g, "-")}`,
        3,
      );
      const order = await createPickupOrder({
        label: `responsive-${viewport.width}`,
        variant,
        quantity: 1,
      });
      const writes: Array<{ method: string; url: string }> = [];
      page.on("request", (request) => {
        if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
          writes.push({ method: request.method(), url: request.url() });
        }
      });
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await installSession(page);
      await page.goto(`/fulfillment/${order.fulfillmentId}`);
      await expect(
        page.getByRole("heading", { name: `Pickup · ${order.orderNumber}` }),
      ).toBeVisible();
      await expect(page.getByTestId("pickup-complete-action")).toBeVisible();
      await expect(page.getByText("Preparation List (PDF)")).toBeVisible();
      await expect(page.getByText("Fulfilled After Pickup")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(writes).toEqual([]);
    });
  }
});
