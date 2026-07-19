import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSessionToken, getSessionCookieName } from "../lib/auth-session";
import {
  countWarehouseMethodSnapshot,
  countWarehouseStages,
  getWarehouseStatusStage,
  isDeliveryHandoffStatus,
  isClosedWarehouseStatus,
  isRowInWarehouseStage,
  rowMatchesWarehouseMethod,
  type WarehouseFulfillmentStatus,
  type WarehouseFulfillmentType,
  type WarehouseStageId,
} from "../lib/warehouse-queue";

const RUN_ID = `phase3a1b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE PHASE3A1B WAREHOUSE QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-phase3a1b-results.json";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for Phase 3A-1.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run Phase 3A-1 against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();

type WriteRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

type MockRow = {
  id: string;
  type: WarehouseFulfillmentType;
  status: WarehouseFulfillmentStatus;
  scheduledAt: string | null;
  timeWindow: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
  itemCount: number;
  itemsCompleted: number;
  orderedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  hasSpecialOrder: boolean;
  specialOrderSummary: {
    status: string | null;
    supplierName: string | null;
    eta: string | null;
    lineCount: number;
  } | null;
  items: Array<{
    id: string;
    title: string;
    sku: string;
    unit: string;
    orderedQty: string;
    fulfilledQty: string;
    remainingQty: string;
    isSpecialOrder: boolean;
    specialOrderStatus: string | null;
    linkedPoNumber: string | null;
    linkedPoStatus: string | null;
    linkedPoEta: string | null;
    supplierName: string | null;
  }>;
};

const createdCustomerIds = new Set<string>();
const createdSupplierIds = new Set<string>();
const createdPurchaseOrderIds = new Set<string>();
const createdProductIds = new Set<string>();
const createdVariantIds = new Set<string>();
const createdOrderIds = new Set<string>();
const createdFulfillmentIds = new Set<string>();
const createdFulfillmentItemIds = new Set<string>();

const results: {
  runId: string;
  marker: string;
  beforeCounts?: Record<string, number>;
  realDatabase?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
} = {
  runId: RUN_ID,
  marker: QA_MARKER,
};

function sessionCookieValue() {
  return createSessionToken({
    userId: "phase3a1b-test-admin",
    role: "ADMIN",
    name: "Phase 3A-1 Test Admin",
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

function mockItem(args: {
  id: string;
  sku: string;
  title: string;
  orderedQty?: string;
  fulfilledQty?: string;
  special?: boolean;
  specialStatus?: string | null;
  supplierName?: string | null;
  eta?: string | null;
}) {
  const ordered = Number(args.orderedQty ?? "1");
  const fulfilled = Number(args.fulfilledQty ?? "0");
  return {
    id: args.id,
    title: args.title,
    sku: args.sku,
    unit: "PIECE",
    orderedQty: args.orderedQty ?? "1",
    fulfilledQty: args.fulfilledQty ?? "0",
    remainingQty: String(Math.max(ordered - fulfilled, 0)),
    isSpecialOrder: Boolean(args.special),
    specialOrderStatus: args.specialStatus ?? null,
    linkedPoNumber: args.special ? "PO-WH-SPECIAL-001" : null,
    linkedPoStatus: args.special ? "ORDERED" : null,
    linkedPoEta: args.eta ?? null,
    supplierName: args.supplierName ?? null,
  };
}

function mockRow(args: {
  id: string;
  type: WarehouseFulfillmentType;
  status: WarehouseFulfillmentStatus;
  orderNumber: string;
  customerName: string;
  item: ReturnType<typeof mockItem>;
  scheduledAt?: string | null;
  timeWindow?: string | null;
  address?: string;
}) {
  const ordered = Number(args.item.orderedQty);
  const fulfilled = Number(args.item.fulfilledQty);
  const hasSpecialOrder = args.item.isSpecialOrder;
  return {
    id: args.id,
    type: args.type,
    status: args.status,
    scheduledAt: args.scheduledAt ?? "2026-07-20T15:00:00.000Z",
    timeWindow: args.timeWindow ?? "8-10 AM",
    salesOrderId: `order-${args.id}`,
    salesOrderNumber: args.orderNumber,
    customerName: args.customerName,
    address: args.address ?? "100 Warehouse Test Way, Honolulu, HI 96813",
    itemCount: 1,
    itemsCompleted: fulfilled >= ordered ? 1 : 0,
    orderedQty: String(ordered),
    fulfilledQty: String(fulfilled),
    remainingQty: String(Math.max(ordered - fulfilled, 0)),
    hasSpecialOrder,
    specialOrderSummary: hasSpecialOrder
      ? {
          status: args.item.specialOrderStatus,
          supplierName: args.item.supplierName,
          eta: args.item.linkedPoEta,
          lineCount: 1,
        }
      : null,
    items: [args.item],
  } satisfies MockRow;
}

function mockRows() {
  return [
    mockRow({
      id: "to-pick-pickup",
      type: "PICKUP",
      status: "DRAFT",
      orderNumber: "SO-WH-TOPICK-PICKUP",
      customerName: "Counter Pickup Account",
      item: mockItem({ id: "item-pickup", sku: "WH-PICK-001", title: "In Stock Door Casing" }),
    }),
    mockRow({
      id: "to-pick-delivery",
      type: "DELIVERY",
      status: "SCHEDULED",
      orderNumber: "SO-WH-TOPICK-DELIVERY",
      customerName: "Delivery Builder Account",
      item: mockItem({ id: "item-delivery", sku: "WH-DEL-001", title: "Window Trim Bundle" }),
    }),
    mockRow({
      id: "picking",
      type: "PICKUP",
      status: "PACKING",
      orderNumber: "SO-WH-PACKING",
      customerName: "Packing Customer",
      item: mockItem({ id: "item-packing", sku: "WH-PACK-001", title: "Casing Pack", orderedQty: "4", fulfilledQty: "2" }),
    }),
    mockRow({
      id: "ready-pickup-special",
      type: "PICKUP",
      status: "READY",
      orderNumber: "SO-WH-SPECIAL",
      customerName: "Special Pickup Customer",
      item: mockItem({
        id: "item-special",
        sku: "WH-SPECIAL-777",
        title: "Custom Patio Door",
        special: true,
        specialStatus: "ARRIVED",
        supplierName: "Pacific Materials Supply",
        eta: "2026-08-15T00:00:00.000Z",
      }),
    }),
    mockRow({
      id: "ready-delivery",
      type: "DELIVERY",
      status: "READY",
      orderNumber: "SO-WH-READY-DELIVERY",
      customerName: "Ready Delivery Customer",
      item: mockItem({ id: "item-ready-delivery", sku: "WH-READY-001", title: "Floor Transition Kit" }),
    }),
    mockRow({
      id: "out-delivery",
      type: "DELIVERY",
      status: "OUT_FOR_DELIVERY",
      orderNumber: "SO-WH-OUT-DELIVERY",
      customerName: "Out Delivery Customer",
      item: mockItem({ id: "item-out-delivery", sku: "WH-OUT-001", title: "Delivery Door Slab" }),
    }),
  ];
}

async function mockWarehouseApis(page: Page, options: { rows?: MockRow[]; fail?: boolean; delayMs?: number } = {}) {
  const writes: WriteRequest[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      let body: unknown = null;
      const rawBody = request.postData();
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }
      writes.push({ method, pathname: url.pathname, body });
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Write request not allowed in Warehouse workspace test" }),
      });
      return;
    }

    if (url.pathname === "/api/auth/session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { userId: "test-admin", name: "Test Admin", role: "ADMIN" },
        }),
      });
      return;
    }

    if (url.pathname === "/api/fulfillments/outbound") {
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (options.fail) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Warehouse queue unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: options.rows ?? mockRows() }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });
  return writes;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow).toBe(false);
}

async function tableCounts() {
  const [
    customers,
    suppliers,
    purchaseOrders,
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
  ] = await Promise.all([
    prisma.salesCustomer.count(),
    prisma.supplier.count(),
    prisma.purchaseOrder.count(),
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
  ]);
  return {
    customers,
    suppliers,
    purchaseOrders,
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
  };
}

async function createCustomer(label: string) {
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${QA_MARKER} ${label} ${RUN_ID}`,
      phone: "808-555-3101",
      email: `${label}-${RUN_ID}@example.com`,
      address: "3101 Warehouse QA Way",
    },
  });
  createdCustomerIds.add(customer.id);
  return customer;
}

async function createVariant(label: string) {
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
      sku: `PH3A1B-${label.toUpperCase()}-${RUN_ID}`,
      displayName: `${label} Variant`,
      description: `${QA_MARKER} ${label}`,
      price: 25,
      cost: 10,
      isStockItem: true,
    },
  });
  createdVariantIds.add(variant.id);
  await prisma.inventoryStock.create({
    data: { variantId: variant.id, onHand: 50, reserved: 0 },
  });
  return { product, variant };
}

async function createSupplierFixture() {
  const supplier = await prisma.supplier.create({
    data: {
      name: `${QA_MARKER} Supplier ${RUN_ID}`,
      contactName: "Warehouse Supplier",
      phone: "808-555-3199",
      category: "Special Order",
    },
  });
  createdSupplierIds.add(supplier.id);
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: `PO-PH3A1B-${RUN_ID}`,
      supplierId: supplier.id,
      status: "ORDERED",
      orderDate: new Date("2026-07-18T00:00:00.000Z"),
      expectedArrival: new Date("2026-08-15T00:00:00.000Z"),
      notes: QA_MARKER,
    },
  });
  createdPurchaseOrderIds.add(po.id);
  return { supplier, po };
}

async function createOrderWithFulfillment(args: {
  label: string;
  type: WarehouseFulfillmentType;
  status: WarehouseFulfillmentStatus;
  special?: boolean;
  closedControl?: boolean;
}) {
  const customer = await createCustomer(args.label);
  const { product, variant } = await createVariant(args.label);
  const supplierFixture = args.special ? await createSupplierFixture() : null;
  const total = args.special ? 75 : 50;
  const quantity = args.special ? 3 : 2;
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A1B-${RUN_ID}-${args.label}`,
      customerId: customer.id,
      docType: "SALES_ORDER",
      status: args.closedControl ? "FULFILLED" : args.status === "DRAFT" || args.status === "SCHEDULED" ? "CONFIRMED" : "READY",
      specialOrder: Boolean(args.special),
      supplierId: supplierFixture?.supplier.id ?? null,
      etaDate: supplierFixture?.po.expectedArrival ?? null,
      specialOrderStatus: args.special ? "ORDERED" : null,
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
          productId: product.id,
          variantId: variant.id,
          productSku: variant.sku,
          productTitle: product.title,
          skuSnapshot: variant.sku,
          titleSnapshot: product.title,
          uomSnapshot: "PIECE",
          lineDescription: product.title ?? product.name,
          quantity,
          unitPrice: 25,
          lineDiscount: 0,
          lineTotal: total,
          isSpecialOrder: Boolean(args.special),
          specialOrderStatus: args.special ? "ARRIVED" : null,
          linkedPoId: supplierFixture?.po.id ?? null,
          specialFollowupDate: args.special ? new Date("2026-08-10T00:00:00.000Z") : null,
        },
      },
    },
    include: { items: true },
  });
  createdOrderIds.add(order.id);
  const fulfillment = await prisma.salesOrderFulfillment.create({
    data: {
      salesOrderId: order.id,
      customerId: customer.id,
      type: args.type,
      status: args.status,
      scheduledAt: new Date("2026-07-20T15:00:00.000Z"),
      scheduledDate: new Date("2026-07-20T00:00:00.000Z"),
      timeWindow: "8-10 AM",
      pickupContact: args.type === "PICKUP" ? customer.name : null,
      shiptoName: args.type === "DELIVERY" ? customer.name : null,
      shiptoPhone: args.type === "DELIVERY" ? customer.phone : null,
      shiptoAddress1: args.type === "DELIVERY" ? "3101 Warehouse QA Way" : null,
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
          fulfilledQty: args.status === "PARTIAL" ? 1 : 0,
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
    variantId: variant.id,
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

test.describe("Warehouse operations queue mapping", () => {
  test("maps actual fulfillment statuses into exclusive Warehouse stages", () => {
    const cases: Array<[WarehouseFulfillmentStatus, WarehouseFulfillmentType, WarehouseStageId | null]> = [
      ["DRAFT", "PICKUP", "toPick"],
      ["SCHEDULED", "DELIVERY", "toPick"],
      ["PACKING", "PICKUP", "picking"],
      ["PARTIAL", "PICKUP", "picking"],
      ["IN_PROGRESS", "DELIVERY", null],
      ["OUT", "DELIVERY", null],
      ["READY", "PICKUP", "ready"],
      ["OUT_FOR_DELIVERY", "DELIVERY", null],
      ["DELIVERED", "DELIVERY", null],
      ["PICKED_UP", "PICKUP", null],
      ["COMPLETED", "PICKUP", null],
      ["CANCELLED", "DELIVERY", null],
    ];

    for (const [status, type, expected] of cases) {
      expect(getWarehouseStatusStage(status)).toBe(expected);
      const stageMemberships = (["toPick", "picking", "ready"] as WarehouseStageId[]).filter((stageId) =>
        isRowInWarehouseStage({ type, status }, stageId),
      );
      expect(stageMemberships).toEqual(expected ? [expected] : []);
    }

    expect(rowMatchesWarehouseMethod({ type: "PICKUP", status: "READY" }, "pickup")).toBe(true);
    expect(rowMatchesWarehouseMethod({ type: "DELIVERY", status: "READY" }, "delivery")).toBe(true);
    expect(isDeliveryHandoffStatus("OUT_FOR_DELIVERY")).toBe(true);
    expect(isDeliveryHandoffStatus("OUT")).toBe(true);
    expect(isDeliveryHandoffStatus("IN_PROGRESS")).toBe(true);
    expect(isClosedWarehouseStatus("DELIVERED")).toBe(true);
  });
});

test.describe("Warehouse Operations workspace UI", () => {
  test("renders exclusive stage counts, method filters, search, special order warning, and one primary action", async ({ page }) => {
    const writes = await mockWarehouseApis(page);
    await page.goto("/warehouse");
    await expect(page.getByTestId("warehouse-operations-workspace")).toBeVisible();

    await expect(page.getByTestId("warehouse-stage-tab-toPick")).toContainText("2");
    await expect(page.getByTestId("warehouse-stage-tab-picking")).toContainText("1");
    await expect(page.getByTestId("warehouse-stage-tab-ready")).toContainText("2");
    await expect(page.getByTestId("warehouse-method-summary-pickup-ready")).toHaveText("1");
    await expect(page.getByTestId("warehouse-method-summary-delivery-active")).toHaveText("1");
    await expect(page.getByTestId("warehouse-visible-count")).toHaveText("2 visible");
    await expect(page.getByRole("link", { name: "SO-WH-TOPICK-PICKUP" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "SO-WH-TOPICK-DELIVERY" }).first()).toBeVisible();
    await expect(page.getByTestId("warehouse-primary-action-to-pick-pickup").first()).toHaveAttribute("href", "/warehouse/picking");

    await page.getByTestId("warehouse-method-filter-delivery").click();
    await expect(page).toHaveURL(/\/warehouse\?stage=toPick&method=delivery$/);
    await expect(page.getByTestId("warehouse-stage-tab-toPick")).toContainText("2");
    await expect(page.getByTestId("warehouse-visible-count")).toHaveText("1 visible");
    await expect(page.getByRole("link", { name: "SO-WH-TOPICK-DELIVERY" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "SO-WH-TOPICK-PICKUP" })).toHaveCount(0);

    await page.getByTestId("warehouse-method-filter-all").click();
    await page.getByTestId("warehouse-stage-tab-picking").click();
    await expect(page).toHaveURL(/\/warehouse\?stage=picking&method=all$/);
    await expect(page.getByTestId("warehouse-visible-count")).toHaveText("1 visible");
    await expect(page.getByRole("link", { name: "SO-WH-PACKING" }).first()).toBeVisible();
    await expect(page.getByTestId("warehouse-primary-action-picking").first()).toHaveAttribute("href", "/warehouse/packing");

    await page.getByTestId("warehouse-stage-tab-ready").click();
    await page.getByTestId("warehouse-method-filter-pickup").click();
    await page.getByLabel("Search orders, customers, SKU, product").fill("WH-SPECIAL-777");
    await expect(page.getByTestId("warehouse-visible-count")).toHaveText("1 visible");
    await expect(page.getByRole("link", { name: "SO-WH-SPECIAL" }).first()).toBeVisible();
    await expect(page.getByText("ARRIVED - Pacific Materials Supply - ETA Aug 15, 2026").first()).toBeVisible();
    await expect(page.getByTestId("warehouse-primary-action-ready-pickup-special").first()).toHaveAttribute(
      "href",
      "/fulfillment/ready-pickup-special",
    );

    await page.getByLabel("Search orders, customers, SKU, product").fill("");
    await page.getByTestId("warehouse-method-filter-delivery").click();
    await expect(page.getByRole("link", { name: "SO-WH-READY-DELIVERY" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "SO-WH-OUT-DELIVERY" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "SO-WH-SPECIAL" })).toHaveCount(0);

    await expect(page.getByRole("button", { name: /Mark Completed/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Mark Delivered/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Mark Picked Up/i })).toHaveCount(0);
    await expect(page.locator('input[type="number"]')).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("preserves URL state, supports legacy queue links, and falls back safely on invalid query values", async ({ page }) => {
    await mockWarehouseApis(page);
    await page.goto("/warehouse?stage=ready&method=delivery&search=READY");
    await expect(page.getByTestId("warehouse-visible-count")).toHaveText("1 visible");
    await expect(page.getByRole("link", { name: "SO-WH-READY-DELIVERY" }).first()).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/warehouse\?stage=ready&method=delivery&search=READY$/);
    await expect(page.getByRole("link", { name: "SO-WH-READY-DELIVERY" }).first()).toBeVisible();

    await page.getByTestId("warehouse-stage-tab-toPick").click();
    await page.getByTestId("warehouse-stage-tab-picking").click();
    await page.goBack();
    await expect(page).toHaveURL(/\/warehouse\?stage=toPick&method=delivery&search=READY$/);

    await page.goto("/warehouse?queue=pickup");
    await expect(page).toHaveURL(/\/warehouse\?stage=ready&method=pickup$/);
    await expect(page.getByRole("link", { name: "SO-WH-SPECIAL" }).first()).toBeVisible();

    await page.goto("/warehouse?stage=bad&method=wrong");
    await expect(page).toHaveURL(/\/warehouse\?stage=toPick&method=all$/);
    await expect(page.getByRole("link", { name: "SO-WH-TOPICK-PICKUP" }).first()).toBeVisible();
  });

  test("shows loading, empty, API failure, and search no-result states", async ({ page }) => {
    await mockWarehouseApis(page, { rows: [], delayMs: 300 });
    await page.goto("/warehouse");
    await expect(page.getByText("Loading Warehouse queue...").first()).toBeVisible();
    await expect(page.getByText("No Warehouse tasks match the current search or filters.").first()).toBeVisible();

    const errorPage = await page.context().newPage();
    await mockWarehouseApis(errorPage, { fail: true });
    await errorPage.goto("/warehouse");
    await expect(errorPage.getByTestId("warehouse-error")).toContainText("Warehouse queue unavailable");
    await errorPage.close();

    const noResultPage = await page.context().newPage();
    await mockWarehouseApis(noResultPage);
    await noResultPage.goto("/warehouse");
    await noResultPage.getByLabel("Search orders, customers, SKU, product").fill("NO-SUCH-SKU");
    await expect(noResultPage.getByText("No Warehouse tasks match the current search or filters.").first()).toBeVisible();
    await noResultPage.close();
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet landscape", width: 1180, height: 820 },
    { name: "tablet portrait", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`is usable without horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const writes = await mockWarehouseApis(page);
      await page.goto("/warehouse");
      await expect(page.getByRole("heading", { name: "Operations Workspace" })).toBeVisible();
      await expect(page.getByLabel("Search orders, customers, SKU, product")).toBeVisible();
      await expect(page.getByTestId("warehouse-stage-tab-toPick")).toBeVisible();
      await expect(page.getByTestId("warehouse-method-filter-all")).toBeVisible();
      await expect(page.locator('[data-testid="warehouse-primary-action-to-pick-pickup"]:visible')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(writes).toEqual([]);
    });
  }
});

test.describe("Warehouse Operations workspace real local database read-only validation", () => {
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
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: Array.from(createdPurchaseOrderIds) } } });
    await prisma.inventoryStock.deleteMany({ where: { variantId: { in: Array.from(createdVariantIds) } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: Array.from(createdVariantIds) } } });
    await prisma.salesProduct.deleteMany({ where: { id: { in: Array.from(createdProductIds) } } });
    await prisma.supplier.deleteMany({ where: { id: { in: Array.from(createdSupplierIds) } } });
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
      remainingTaggedSuppliers: await prisma.supplier.count({ where: { name: { contains: RUN_ID } } }),
    };
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  });

  test("page load, queue navigation, and search do not mutate financial, fulfillment, or inventory data", async ({ page }) => {
    const fixtures = await Promise.all([
      createOrderWithFulfillment({ label: "to-pick-pickup", type: "PICKUP", status: "DRAFT" }),
      createOrderWithFulfillment({ label: "to-pick-delivery", type: "DELIVERY", status: "SCHEDULED" }),
      createOrderWithFulfillment({ label: "packing", type: "PICKUP", status: "PACKING" }),
      createOrderWithFulfillment({ label: "ready-special", type: "PICKUP", status: "READY", special: true }),
      createOrderWithFulfillment({ label: "ready-delivery", type: "DELIVERY", status: "READY" }),
      createOrderWithFulfillment({ label: "out-delivery", type: "DELIVERY", status: "OUT_FOR_DELIVERY" }),
      createOrderWithFulfillment({ label: "closed-control", type: "PICKUP", status: "COMPLETED", closedControl: true }),
    ]);
    const orderIds = fixtures.map((fixture) => fixture.orderId);
    const variantIds = fixtures.map((fixture) => fixture.variantId);
    const before = await captureSnapshot(orderIds, variantIds);
    const writeRequests: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
        writeRequests.push({ method: request.method(), url: request.url() });
      }
    });

    await installSession(page);
    await page.goto("/warehouse?stage=toPick&method=all");
    await expect(page.getByRole("heading", { name: "Operations Workspace" })).toBeVisible();
    await page.getByLabel("Search orders, customers, SKU, product").fill(RUN_ID);
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-to-pick-pickup` }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-to-pick-delivery` }).first()).toBeVisible();
    await page.getByTestId("warehouse-method-filter-delivery").click();
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-to-pick-delivery` }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-to-pick-pickup` })).toHaveCount(0);
    await page.getByTestId("warehouse-stage-tab-ready").click();
    await page.getByTestId("warehouse-method-filter-pickup").click();
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-ready-special` }).first()).toBeVisible();
    await expect(page.getByText(/ARRIVED/).first()).toBeVisible();
    await page.getByTestId("warehouse-method-filter-delivery").click();
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-ready-delivery` }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-out-delivery` })).toHaveCount(0);
    await expect(page.getByTestId("warehouse-method-summary-delivery-active")).toContainText("1");
    await page.getByTestId("warehouse-method-filter-pickup").click();
    await page.getByLabel("Search orders, customers, SKU, product").fill(`PH3A1B-READY-SPECIAL-${RUN_ID}`);
    await expect(page.getByRole("link", { name: `SO-PH3A1B-${RUN_ID}-ready-special` }).first()).toBeVisible();

    const after = await captureSnapshot(orderIds, variantIds);
    results.realDatabase = {
      orderIds,
      variantIds,
      fulfillmentIds: fixtures.map((fixture) => fixture.fulfillmentId),
      before,
      after,
      writeRequests,
      stageCounts: countWarehouseStages([
        { type: "PICKUP", status: "DRAFT" },
        { type: "DELIVERY", status: "SCHEDULED" },
        { type: "PICKUP", status: "PACKING" },
        { type: "PICKUP", status: "READY" },
        { type: "DELIVERY", status: "READY" },
        { type: "DELIVERY", status: "OUT_FOR_DELIVERY" },
      ]),
      methodSnapshot: countWarehouseMethodSnapshot([
        { type: "PICKUP", status: "DRAFT" },
        { type: "DELIVERY", status: "SCHEDULED" },
        { type: "PICKUP", status: "PACKING" },
        { type: "PICKUP", status: "READY" },
        { type: "DELIVERY", status: "READY" },
        { type: "DELIVERY", status: "OUT_FOR_DELIVERY" },
      ]),
    };

    expect(writeRequests).toEqual([]);
    expect(after).toEqual(before);
  });
});
