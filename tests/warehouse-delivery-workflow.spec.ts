import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSessionToken, getSessionCookieName } from "../lib/auth-session";
import { ensureFulfillmentFromSalesOrder } from "../lib/fulfillment";
import { parseHandoffQuantity } from "../lib/fulfillment-handoff";
import {
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "../lib/sales-orders";

const prisma = new PrismaClient();
const RUN_ID = `phase3a4-delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE PHASE3A4 DELIVERY QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-phase3a4-delivery-results.json";

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

type DeliveryLine = {
  variant: FixtureVariant;
  quantity: number;
  special?: boolean;
  linkedPoId?: string;
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
  if (!rawUrl) throw new Error("DATABASE_URL is required for Phase 3A-4 Delivery tests.");
  const url = new URL(rawUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55322" || url.pathname !== "/postgres") {
    throw new Error("Refusing to run Phase 3A-4 Delivery tests outside 127.0.0.1:55322/postgres.");
  }
}

loadLocalEnv();
assertSafeDatabase();

function sessionCookieValue() {
  return createSessionToken({
    userId: "phase3a4-delivery-test-admin",
    role: "ADMIN",
    name: "Phase 3A-4 Delivery Test Admin",
  });
}

function authHeaders() {
  return {
    Cookie: `${getSessionCookieName()}=${sessionCookieValue()}`,
    "x-user-role": "ADMIN",
  };
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
      phone: "808-555-3400",
      email: `${label}-${RUN_ID}@example.com`,
      address: "3400 Delivery QA Way",
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
      title: `${label} delivery product`,
      defaultDescription: `${QA_MARKER} ${label}`,
      unit: "PIECE",
      price: 15,
      cost: 6,
      availableStock: onHand,
      active: true,
    },
  });
  createdProductIds.add(product.id);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `PH3A4-${label.toUpperCase()}-${RUN_ID}`,
      displayName: `${label} delivery variant`,
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
    title: `${label} delivery variant`,
    unit: "PIECE",
    price: Number(product.price),
  };
}

async function createSpecialPurchaseOrder(label: string) {
  const supplier = await prisma.supplier.create({
    data: {
      name: `${QA_MARKER} ${label} Supplier ${RUN_ID}`,
      contactName: "Phase 3A-4 Supplier Contact",
      phone: "808-555-3401",
      category: "Special Order QA",
    },
  });
  createdSupplierIds.add(supplier.id);
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      poNumber: `PO-PH3A4-${RUN_ID}-${label}`,
      supplierId: supplier.id,
      status: "ORDERED",
      orderDate: new Date("2026-07-20T00:00:00.000Z"),
      expectedArrival: new Date("2026-08-15T00:00:00.000Z"),
      totalCost: 30,
      notes: QA_MARKER,
    },
  });
  createdPurchaseOrderIds.add(purchaseOrder.id);
  return { supplier, purchaseOrder };
}

async function createDeliveryOrder(args: {
  label: string;
  lines: DeliveryLine[];
  customerId?: string;
  orderStatus?: "CONFIRMED" | "READY" | "PARTIALLY_FULFILLED";
  fulfillmentStatus?: "DRAFT" | "SCHEDULED" | "READY" | "OUT_FOR_DELIVERY" | "IN_PROGRESS" | "PARTIAL";
  longAddress?: boolean;
  special?: boolean;
}): Promise<FixtureOrder> {
  const customerId = args.customerId ?? (await createCustomer(args.label));
  const total = args.lines.reduce((sum, line) => sum + line.quantity * line.variant.price, 0);
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A4-DELIVERY-${RUN_ID}-${args.label}`,
      customerId,
      docType: "SALES_ORDER",
      status: args.orderStatus ?? "READY",
      fulfillmentMethod: "DELIVERY",
      specialOrder: Boolean(args.special),
      specialOrderStatus: args.special ? "ARRIVED" : null,
      etaDate: args.special ? new Date("2026-08-15T00:00:00.000Z") : null,
      subtotal: total,
      discount: 1,
      tax: 0.75,
      total: total - 0.25,
      paidAmount: 3,
      balanceDue: total - 3.25,
      paymentStatus: "partial",
      requestedDeliveryAt: new Date("2026-07-21T16:00:00.000Z"),
      timeWindow: "9-11am",
      deliveryName: `${QA_MARKER} Delivery Contact`,
      deliveryPhone: "808-555-3402",
      deliveryAddress1: args.longAddress
        ? "3400 Extremely Long Building Materials Jobsite Drive Unit 200 Near The Loading Gate"
        : "3400 Delivery Jobsite Dr",
      deliveryAddress2: args.longAddress ? "Suite 20B - Contractor Entrance" : "Unit 4",
      deliveryCity: "Honolulu",
      deliveryState: "HI",
      deliveryZip: "96819",
      deliveryNotes: `${QA_MARKER} Leave material near staged area`,
      notes: QA_MARKER,
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
          isSpecialOrder: Boolean(line.special),
          specialOrderStatus: line.special ? "ARRIVED" : null,
          linkedPoId: line.linkedPoId ?? null,
          notes: QA_MARKER,
        })),
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  createdOrderIds.add(order.id);

  await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, order.id));

  const ensured = await prisma.$transaction((tx) =>
    ensureFulfillmentFromSalesOrder(tx, {
      salesOrderId: order.id,
      type: "DELIVERY",
    }),
  );
  const fulfillment = await prisma.salesOrderFulfillment.update({
    where: { id: ensured.fulfillment.id },
    data: {
      status: args.fulfillmentStatus ?? "READY",
      driverName: `${QA_MARKER} Driver`,
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

async function createPickupOrder(args: {
  label: string;
  variant: FixtureVariant;
  quantity: number;
}): Promise<FixtureOrder> {
  const customerId = await createCustomer(args.label);
  const total = args.quantity * args.variant.price;
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A4-PICKUP-${RUN_ID}-${args.label}`,
      customerId,
      docType: "SALES_ORDER",
      status: "READY",
      fulfillmentMethod: "PICKUP",
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
          notes: QA_MARKER,
        },
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  createdOrderIds.add(order.id);
  await prisma.$transaction((tx) => syncInventoryReservationForSalesOrder(tx, order.id));
  const ensured = await prisma.$transaction((tx) =>
    ensureFulfillmentFromSalesOrder(tx, { salesOrderId: order.id, type: "PICKUP" }),
  );
  const fulfillment = await prisma.salesOrderFulfillment.update({
    where: { id: ensured.fulfillment.id },
    data: { status: "READY", notes: QA_MARKER },
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
        markedOutAt: true,
        markedDoneAt: true,
        inventoryDeductedAt: true,
        shiptoAddress1: true,
        shiptoPhone: true,
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
    prisma.salesOrderPayment.count({ where: { salesOrderId: { in: orderIds } } }),
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
      markedOut: Boolean(fulfillment.markedOutAt),
      markedDone: Boolean(fulfillment.markedDoneAt),
      inventoryDeducted: Boolean(fulfillment.inventoryDeductedAt),
      markedOutAt: undefined,
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

function stockFor(snapshot: Snapshot, variantId: string) {
  const stock = snapshot.stocks.find((row) => row.variantId === variantId);
  if (!stock) throw new Error(`Missing stock for ${variantId}`);
  return stock;
}

function movementQty(snapshot: Snapshot, variantId: string) {
  return snapshot.movements
    .filter((movement) => movement.variantId === variantId && movement.type === "FULFILLMENT_DEDUCT")
    .reduce((sum, movement) => sum + movement.qty, 0);
}

function orderFinancial(snapshot: Snapshot, orderId: string) {
  const order = snapshot.orders.find((row) => row.id === orderId);
  if (!order) throw new Error(`Missing order ${orderId}`);
  return {
    subtotal: order.subtotal,
    discount: order.discount,
    tax: order.tax,
    total: order.total,
    paidAmount: order.paidAmount,
    balanceDue: order.balanceDue,
    paymentStatus: order.paymentStatus,
  };
}

function deliveryItems(order: FixtureOrder, quantities: Array<string | number>) {
  return order.fulfillmentItemIds.map((id, index) => ({
    id,
    fulfilledQty: quantities[index] ?? quantities[0],
    notes: `${QA_MARKER} delivered ${index}`,
  }));
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow).toBe(false);
}

async function patchDelivery(
  request: APIRequestContext,
  order: FixtureOrder,
  quantities: Array<string | number>,
) {
  return request.patch(`/api/fulfillments/${order.fulfillmentId}/delivery`, {
    headers: authHeaders(),
    data: { items: deliveryItems(order, quantities) },
  });
}

test.describe("Warehouse Delivery workflow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    results.beforeCounts = await tableCounts();
  });

  test.afterAll(async () => {
    const orderIds = Array.from(createdOrderIds);
    const invoiceIds = await prisma.invoice.findMany({
      where: { salesOrderId: { in: orderIds } },
      select: { id: true },
    });
    await prisma.invoiceItem.deleteMany({
      where: { invoiceId: { in: invoiceIds.map((invoice) => invoice.id) } },
    });
    await prisma.salesOrderPayment.deleteMany({
      where: { salesOrderId: { in: orderIds } },
    });
    await prisma.invoice.deleteMany({
      where: { id: { in: invoiceIds.map((invoice) => invoice.id) } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          { variantId: { in: Array.from(createdVariantIds) } },
          { fulfillmentId: { in: Array.from(createdFulfillmentIds) } },
          { fulfillmentItemId: { in: Array.from(createdFulfillmentItemIds) } },
        ],
      },
    });
    await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.inventoryStock.deleteMany({ where: { variantId: { in: Array.from(createdVariantIds) } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: Array.from(createdVariantIds) } } });
    await prisma.salesProduct.deleteMany({ where: { id: { in: Array.from(createdProductIds) } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: Array.from(createdPurchaseOrderIds) } } });
    await prisma.supplier.deleteMany({ where: { id: { in: Array.from(createdSupplierIds) } } });
    await prisma.salesCustomer.deleteMany({ where: { id: { in: Array.from(createdCustomerIds) } } });

    const afterCounts = await tableCounts();
    results.cleanup = {
      afterCounts,
      remainingTaggedOrders: await prisma.salesOrder.count({ where: { orderNumber: { contains: RUN_ID } } }),
      remainingTaggedCustomers: await prisma.salesCustomer.count({ where: { name: { contains: RUN_ID } } }),
      remainingTaggedProducts: await prisma.salesProduct.count({ where: { name: { contains: RUN_ID } } }),
      remainingTaggedVariants: await prisma.productVariant.count({ where: { sku: { contains: RUN_ID } } }),
      remainingTaggedMovements: await prisma.inventoryMovement.count({
        where: {
          OR: [
            { variantId: { in: Array.from(createdVariantIds) } },
            { fulfillmentId: { in: Array.from(createdFulfillmentIds) } },
            { fulfillmentItemId: { in: Array.from(createdFulfillmentItemIds) } },
          ],
        },
      }),
      remainingTaggedPurchaseOrders: await prisma.purchaseOrder.count({ where: { poNumber: { contains: RUN_ID } } }),
      remainingTaggedSuppliers: await prisma.supplier.count({ where: { name: { contains: RUN_ID } } }),
      remainingTaggedInvoices: await prisma.invoice.count({ where: { salesOrderId: { in: orderIds } } }),
      remainingTaggedPayments: await prisma.salesOrderPayment.count({ where: { salesOrderId: { in: orderIds } } }),
    };
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  });

  test("strict handoff quantity parser rejects unsafe non-JSON values", () => {
    for (const value of [1, 1.5, "1", "1.5", " 2.25 "]) {
      expect(parseHandoffQuantity(value)?.toString()).toBe(String(value).trim());
    }
    for (const value of [true, false, [2], [], {}, null, undefined, "", "   ", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "NaN", "Infinity", "abc"]) {
      expect(parseHandoffQuantity(value)).toBeNull();
    }
  });

  test("Delivery details render from Warehouse without automatic writes", async ({ page }) => {
    const variant = await createVariant("readonly", 8);
    const { purchaseOrder } = await createSpecialPurchaseOrder("readonly");
    const order = await createDeliveryOrder({
      label: "readonly-long-address",
      longAddress: true,
      special: true,
      lines: [
        { variant, quantity: 2, special: true, linkedPoId: purchaseOrder.id },
      ],
    });
    const writes: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
        writes.push({ method: request.method(), url: request.url() });
      }
    });

    await installSession(page);
    await page.goto(`/warehouse?method=delivery&section=ready&search=${order.orderNumber}`);
    await expect(page.getByRole("link", { name: order.orderNumber }).first()).toBeVisible();
    await page.locator(`[data-testid="warehouse-primary-action-${order.fulfillmentId}"]:visible`).click();
    await expect(page.getByRole("heading", { name: `Delivery · ${order.orderNumber}` })).toBeVisible();
    await expect(page.getByTestId("delivery-workflow-guidance")).toContainText("Complete Delivery");
    await expect(page.getByTestId("delivery-address")).toContainText("3400 Extremely Long");
    await expect(page.getByTestId("delivery-contact")).toContainText("808-555-3402");
    await expect(page.getByTestId("delivery-special-order-warning")).toContainText("Special Order");
    await expect(page.getByText("Delivery Slip (PDF)")).toBeVisible();
    await expect(page.getByText("Delivered After Delivery")).toBeVisible();
    await expect(page.getByText("Picking")).toHaveCount(0);
    await expect(page.getByText("Packing")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(writes).toEqual([]);
    results.scenarios.readOnlyLoad = { orderNumber: order.orderNumber, writes };
  });

  test("Start Delivery moves Ready to Out for Delivery without inventory or financial mutation", async ({ page }) => {
    const variant = await createVariant("start", 5);
    const order = await createDeliveryOrder({
      label: "start",
      lines: [{ variant, quantity: 1 }],
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    let statusPatchCount = 0;

    await installSession(page);
    await page.route(`**/api/fulfillments/${order.fulfillmentId}/status`, async (route) => {
      statusPatchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    });
    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await page.getByTestId("delivery-start-action").dblclick();
    await expect(page.getByTestId("fulfillment-success")).toContainText("Delivery started.");

    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.startDelivery = { before, after, statusPatchCount };
    expect(statusPatchCount).toBe(1);
    expect(stockFor(after, variant.variantId)).toEqual(stockFor(before, variant.variantId));
    expect(after.movements).toEqual(before.movements);
    expect(after.items[0].fulfillQty).toBe(0);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(0);
    expect(after.fulfillments[0]).toMatchObject({ status: "OUT_FOR_DELIVERY", markedOut: true });
    expect(orderFinancial(after, order.orderId)).toEqual(orderFinancial(before, order.orderId));
    expect(after.invoices).toBe(before.invoices);
    expect(after.payments).toBe(before.payments);
  });

  test("Full Delivery deducts inventory once and preserves other orders and variants", async ({ page }) => {
    const sharedVariant = await createVariant("shared", 15);
    const unrelatedVariant = await createVariant("unrelated", 9);
    const customerId = await createCustomer("shared-customer");
    const orderA = await createDeliveryOrder({
      label: "shared-a",
      customerId,
      lines: [{ variant: sharedVariant, quantity: 2 }],
    });
    const orderB = await createDeliveryOrder({
      label: "shared-b",
      customerId,
      lines: [{ variant: sharedVariant, quantity: 3 }],
    });
    const orderC = await createDeliveryOrder({
      label: "unrelated-control",
      lines: [{ variant: unrelatedVariant, quantity: 4 }],
    });
    const before = await captureSnapshot(
      [orderA.orderId, orderB.orderId, orderC.orderId],
      [sharedVariant.variantId, unrelatedVariant.variantId],
    );
    expect(stockFor(before, sharedVariant.variantId)).toMatchObject({ onHand: 15, reserved: 5 });
    expect(stockFor(before, unrelatedVariant.variantId)).toMatchObject({ onHand: 9, reserved: 4 });

    await installSession(page);
    let deliveryPatchCount = 0;
    await page.route(`**/api/fulfillments/${orderA.fulfillmentId}/delivery`, async (route) => {
      deliveryPatchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    });
    await page.goto(`/fulfillment/${orderA.fulfillmentId}`);
    await page.getByTestId("delivery-complete-action").dblclick();
    await expect(page.getByTestId("fulfillment-success")).toContainText("Delivery completed.");

    const after = await captureSnapshot(
      [orderA.orderId, orderB.orderId, orderC.orderId],
      [sharedVariant.variantId, unrelatedVariant.variantId],
    );
    results.scenarios.fullDelivery = { before, after, deliveryPatchCount };
    expect(deliveryPatchCount).toBe(1);
    expect(stockFor(after, sharedVariant.variantId)).toMatchObject({ onHand: 13, reserved: 3 });
    expect(stockFor(after, unrelatedVariant.variantId)).toEqual(stockFor(before, unrelatedVariant.variantId));
    expect(movementQty(after, sharedVariant.variantId)).toBe(-2);
    expect(after.movements.filter((movement) => movement.fulfillmentId === orderA.fulfillmentId)).toHaveLength(1);
    expect(after.orders.find((order) => order.id === orderA.orderId)?.status).toBe("FULFILLED");
    expect(after.orders.find((order) => order.id === orderB.orderId)?.status).toBe("READY");
    expect(after.orders.find((order) => order.id === orderC.orderId)?.status).toBe("READY");
    expect(after.items.find((item) => item.salesOrderId === orderB.orderId)?.fulfillQty).toBe(0);
    expect(after.fulfillments.find((fulfillment) => fulfillment.id === orderA.fulfillmentId)?.status).toBe("DELIVERED");
    expect(orderFinancial(after, orderA.orderId)).toEqual(orderFinancial(before, orderA.orderId));
    expect(after.invoices).toBe(before.invoices);
    expect(after.payments).toBe(before.payments);
  });

  test("Partial Delivery is cumulative and later completion deducts only the remaining delta", async ({ page }) => {
    const variant = await createVariant("partial", 12);
    const order = await createDeliveryOrder({
      label: "partial",
      lines: [{ variant, quantity: 5 }],
      fulfillmentStatus: "OUT_FOR_DELIVERY",
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);

    await installSession(page);
    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await page.getByTestId(`fulfillment-item-qty-${order.fulfillmentItemIds[0]}`).fill("2.5");
    await page.getByTestId("delivery-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText("Partial delivery recorded.");

    const afterPartial = await captureSnapshot([order.orderId], [variant.variantId]);
    expect(stockFor(afterPartial, variant.variantId)).toMatchObject({ onHand: 9.5, reserved: 2.5 });
    expect(afterPartial.orders[0].status).toBe("PARTIALLY_FULFILLED");
    expect(afterPartial.fulfillments[0].status).toBe("PARTIAL");
    expect(afterPartial.items[0].fulfillQty).toBe(2.5);
    expect(afterPartial.fulfillmentItems[0].fulfilledQty).toBe(2.5);
    expect(movementQty(afterPartial, variant.variantId)).toBe(-2.5);
    const firstEvent = await prisma.salesFulfillmentEvent.findFirst({
      where: { fulfillmentId: order.fulfillmentId },
      include: { items: true },
    });
    expect(firstEvent).toMatchObject({
      method: "DELIVERY",
      actor: "ADMIN",
      address1: "3400 Delivery Jobsite Dr",
    });
    expect(firstEvent?.items).toHaveLength(1);
    expect(Number(firstEvent?.items[0].quantity)).toBe(2.5);
    expect(Number(firstEvent?.items[0].priorFulfilledQty)).toBe(0);
    expect(Number(firstEvent?.items[0].newFulfilledQty)).toBe(2.5);
    expect(Number(firstEvent?.items[0].remainingQty)).toBe(2.5);

    await page.getByTestId("delivery-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText("Delivery completed.");
    const afterComplete = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.partialDelivery = { before, afterPartial, afterComplete };
    expect(stockFor(afterComplete, variant.variantId)).toMatchObject({ onHand: 7, reserved: 0 });
    expect(afterComplete.orders[0].status).toBe("FULFILLED");
    expect(afterComplete.fulfillments[0].status).toBe("DELIVERED");
    expect(movementQty(afterComplete, variant.variantId)).toBe(-5);
    expect(afterComplete.movements).toHaveLength(2);
    const deliveryEvents = await prisma.salesFulfillmentEvent.findMany({
      where: { fulfillmentId: order.fulfillmentId },
      orderBy: { createdAt: "asc" },
      include: { items: true },
    });
    expect(deliveryEvents).toHaveLength(2);
    expect(deliveryEvents.map((event) => Number(event.items[0].quantity))).toEqual([
      2.5,
      2.5,
    ]);
    expect(Number(deliveryEvents[1].items[0].priorFulfilledQty)).toBe(2.5);
    expect(Number(deliveryEvents[1].items[0].newFulfilledQty)).toBe(5);
    expect(Number(deliveryEvents[1].items[0].remainingQty)).toBe(0);
    expect(orderFinancial(afterComplete, order.orderId)).toEqual(orderFinancial(before, order.orderId));
  });

  test("Delivery validation and failure paths do not mutate persisted records", async ({ page, request }) => {
    const variant = await createVariant("failure", 4);
    const order = await createDeliveryOrder({
      label: "failure",
      lines: [{ variant, quantity: 4 }],
    });
    await prisma.inventoryStock.update({
      where: { variantId: variant.variantId },
      data: { onHand: 1 },
    });
    const beforeFailure = await captureSnapshot([order.orderId], [variant.variantId]);

    await installSession(page);
    await page.goto(`/fulfillment/${order.fulfillmentId}`);
    await page.getByTestId(`fulfillment-item-qty-${order.fulfillmentItemIds[0]}`).fill("0");
    await page.getByTestId("delivery-complete-action").click();
    await expect(page.getByTestId("fulfillment-error")).toContainText("Enter at least one delivery quantity");
    expect(await captureSnapshot([order.orderId], [variant.variantId])).toEqual(beforeFailure);

    await page.getByTestId(`fulfillment-item-qty-${order.fulfillmentItemIds[0]}`).fill("4");
    await page.getByTestId("delivery-complete-action").click();
    await expect(page.getByTestId("fulfillment-error")).toContainText("Insufficient stock");
    await expect(page.getByTestId("delivery-complete-action")).toBeEnabled();
    const afterInsufficient = await captureSnapshot([order.orderId], [variant.variantId]);
    expect(afterInsufficient).toEqual(beforeFailure);

    const invalidBodies = [
      { items: [] },
      { items: [{ id: order.fulfillmentItemIds[0] }] },
      { items: [{ id: order.fulfillmentItemIds[0], fulfilledQty: "" }] },
      { items: [{ id: order.fulfillmentItemIds[0], fulfilledQty: "   " }] },
      { items: [{ id: order.fulfillmentItemIds[0], fulfilledQty: -1 }] },
      { items: [{ id: order.fulfillmentItemIds[0], fulfilledQty: "abc" }] },
      { items: [{ id: order.fulfillmentItemIds[0], fulfilledQty: 5 }] },
    ];
    for (const body of invalidBodies) {
      const response = await request.patch(`/api/fulfillments/${order.fulfillmentId}/delivery`, {
        headers: authHeaders(),
        data: body,
      });
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(await captureSnapshot([order.orderId], [variant.variantId])).toEqual(beforeFailure);
    }

    await prisma.inventoryStock.update({
      where: { variantId: variant.variantId },
      data: { onHand: 4 },
    });
    await page.getByTestId("delivery-complete-action").click();
    await expect(page.getByTestId("fulfillment-success")).toContainText("Delivery completed.");
    const afterRetry = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.failureRetry = { beforeFailure, afterInsufficient, afterRetry };
    expect(stockFor(afterRetry, variant.variantId)).toMatchObject({ onHand: 0, reserved: 0 });
    expect(afterRetry.movements).toHaveLength(1);
    expect(afterRetry.orders[0].status).toBe("FULFILLED");
  });

  test("Delivery endpoint rejects invalid status and wrong Pickup type without mutation", async ({ request }) => {
    const deliveryVariant = await createVariant("invalid-status", 6);
    const invalidOrder = await createDeliveryOrder({
      label: "invalid-status",
      lines: [{ variant: deliveryVariant, quantity: 1 }],
      fulfillmentStatus: "SCHEDULED",
    });
    const beforeInvalidStatus = await captureSnapshot([invalidOrder.orderId], [deliveryVariant.variantId]);
    const invalidStatusResponse = await patchDelivery(request, invalidOrder, [1]);
    expect(invalidStatusResponse.status()).toBe(409);
    expect(await captureSnapshot([invalidOrder.orderId], [deliveryVariant.variantId])).toEqual(beforeInvalidStatus);

    const pickupVariant = await createVariant("wrong-pickup-type", 6);
    const pickupOrder = await createPickupOrder({
      label: "wrong-pickup-type",
      variant: pickupVariant,
      quantity: 1,
    });
    const beforeWrongType = await captureSnapshot([pickupOrder.orderId], [pickupVariant.variantId]);
    const wrongTypeResponse = await patchDelivery(request, pickupOrder, [1]);
    expect(wrongTypeResponse.status()).toBe(409);
    expect(await captureSnapshot([pickupOrder.orderId], [pickupVariant.variantId])).toEqual(beforeWrongType);
    results.scenarios.invalidStatusAndWrongType = {
      beforeInvalidStatus,
      beforeWrongType,
    };
  });

  test("Repeated and near-concurrent Delivery requests are idempotent for inventory deduction", async ({ request }) => {
    const variant = await createVariant("concurrent", 8);
    const order = await createDeliveryOrder({
      label: "concurrent",
      lines: [{ variant, quantity: 2 }],
      fulfillmentStatus: "OUT_FOR_DELIVERY",
    });
    const before = await captureSnapshot([order.orderId], [variant.variantId]);
    const payload = {
      headers: authHeaders(),
      data: { items: deliveryItems(order, [2]) },
    };

    const [first, second] = await Promise.all([
      request.patch(`/api/fulfillments/${order.fulfillmentId}/delivery`, payload),
      request.patch(`/api/fulfillments/${order.fulfillmentId}/delivery`, payload),
    ]);
    expect([first.status(), second.status()].every((status) => status === 200)).toBe(true);
    const repeated = await request.patch(`/api/fulfillments/${order.fulfillmentId}/delivery`, payload);
    expect(repeated.status()).toBe(200);

    const after = await captureSnapshot([order.orderId], [variant.variantId]);
    results.scenarios.idempotency = { before, after, statuses: [first.status(), second.status(), repeated.status()] };
    expect(stockFor(after, variant.variantId)).toMatchObject({ onHand: 6, reserved: 0 });
    expect(after.movements).toHaveLength(1);
    expect(movementQty(after, variant.variantId)).toBe(-2);
    expect(after.fulfillmentItems[0].fulfilledQty).toBe(2);
    expect(after.orders[0].status).toBe("FULFILLED");
    await expect(
      prisma.salesFulfillmentEvent.count({
        where: { fulfillmentId: order.fulfillmentId },
      }),
    ).resolves.toBe(1);
  });

  test("Delivery Slip response remains available through the existing PDF route", async ({ request }) => {
    const variant = await createVariant("slip", 3);
    const order = await createDeliveryOrder({
      label: "slip",
      lines: [{ variant, quantity: 1 }],
    });
    const response = await request.get(`/api/fulfillments/${order.fulfillmentId}/pdf?type=slip&download=true`, {
      headers: authHeaders(),
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["content-disposition"]).toContain("delivery-slip");
    expect((await response.body()).byteLength).toBeGreaterThan(1000);
    results.scenarios.deliverySlip = { orderNumber: order.orderNumber };
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet landscape", width: 1180, height: 820 },
    { name: "tablet portrait", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`Delivery detail remains usable without horizontal overflow at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      const variant = await createVariant(`responsive-${viewport.name.replace(/\s+/g, "-")}`, 3);
      const order = await createDeliveryOrder({
        label: `responsive-${viewport.width}`,
        longAddress: true,
        lines: [{ variant, quantity: 1 }],
      });
      const writes: Array<{ method: string; url: string }> = [];
      page.on("request", (request) => {
        if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
          writes.push({ method: request.method(), url: request.url() });
        }
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installSession(page);
      await page.goto(`/fulfillment/${order.fulfillmentId}`);
      await expect(page.getByRole("heading", { name: `Delivery · ${order.orderNumber}` })).toBeVisible();
      await expect(page.getByTestId("delivery-start-action")).toBeVisible();
      await expect(page.getByTestId("delivery-complete-action")).toBeVisible();
      await expect(page.getByTestId("delivery-address")).toBeVisible();
      await expect(page.getByText("Delivery Slip (PDF)")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(writes).toEqual([]);
    });
  }
});
