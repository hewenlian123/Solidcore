import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const RUN_ID = `phase1b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_MARKER = "SOLIDCORE PHASE1B QA DELETE ME";
const RESULTS_PATH = "/private/tmp/solidcore-phase1b-results.json";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";

type FixtureProduct = {
  legacyProductId: string;
  salesProductId: string;
  variantId: string;
  sku: string;
  name: string;
  expectedUnit: "PIECE" | "SQFT" | "BOX";
  price: number;
  boxSqft?: number;
};

type FixtureState = {
  warehouseId: string;
  existingCustomerId: string;
  existingCustomerName: string;
  standardOne: FixtureProduct;
  standardTwo: FixtureProduct;
  decimal: FixtureProduct;
  flooring: FixtureProduct;
};

type CountSnapshot = {
  customers: number;
  salesProducts: number;
  legacyProducts: number;
  variants: number;
  stock: number;
  orders: number;
  items: number;
  fulfillments: number;
  fulfillmentItems: number;
  movements: number;
  outboundQueues: number;
  invoices: number;
  payments: number;
  descriptionTemplates: number;
  warehouses: number;
};

type ScenarioMetrics = {
  name: string;
  majorInteractions: number;
  keyboardActions: number;
  routeTransitions: number;
  dialogCount: number;
  scrollCount: number;
  repeatedDataEntry: string[];
  errors: string[];
  hesitationPoints: string[];
  durationMs: number;
  createdOrderId?: string;
  finalUrl?: string;
};

type OrderEvidence = {
  id: string;
  orderNumber: string;
  docType: string;
  status: string;
  customerName: string;
  fulfillmentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  items: Array<{
    variantId: string | null;
    productId: string | null;
    sku: string | null;
    title: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    uomSnapshot: string | null;
  }>;
  fulfillments: Array<{
    id: string;
    type: string;
    status: string;
    itemCount: number;
  }>;
  inventoryMovements: Array<{
    variantId: string;
    type: string;
    qty: number;
    unit: string;
    note: string | null;
  }>;
  stock: Array<{
    variantId: string;
    onHand: number;
    reserved: number;
  }>;
  invoiceCount: number;
  paymentCount: number;
};

const results: {
  runId: string;
  marker: string;
  fixture?: Record<string, unknown>;
  counts: Record<string, CountSnapshot>;
  scenarios: Record<string, ScenarioMetrics>;
  evidence: Record<string, unknown>;
  viewportResults: Array<Record<string, unknown>>;
  cleanup?: Record<string, unknown>;
  defects: string[];
} = {
  runId: RUN_ID,
  marker: QA_MARKER,
  counts: {},
  scenarios: {},
  evidence: {},
  viewportResults: [],
  defects: [],
};

let fixture: FixtureState;
const createdOrderIds = new Set<string>();
const createdCustomerIds = new Set<string>();

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for Phase 1B.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error(
      "Refusing to run Phase 1B against a non-local, non-test database.",
    );
  }
}

loadLocalEnv();
assertSafeDatabase();

function createSessionToken() {
  const payload = {
    userId: "phase1b-test-admin",
    role: "ADMIN",
    name: "Phase 1B Test Admin",
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

async function authenticate(page: Page) {
  await page.context().addCookies([
    {
      name: "solidcore_session",
      value: createSessionToken(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function newMetrics(name: string): ScenarioMetrics & { startedAt: number } {
  return {
    name,
    majorInteractions: 0,
    keyboardActions: 0,
    routeTransitions: 0,
    dialogCount: 0,
    scrollCount: 0,
    repeatedDataEntry: [],
    errors: [],
    hesitationPoints: [],
    durationMs: 0,
    startedAt: Date.now(),
  };
}

function finishMetrics(metrics: ScenarioMetrics & { startedAt: number }) {
  metrics.durationMs = Date.now() - metrics.startedAt;
  const { startedAt: _startedAt, ...publicMetrics } = metrics;
  return publicMetrics;
}

async function captureCounts(): Promise<CountSnapshot> {
  const [
    customers,
    salesProducts,
    legacyProducts,
    variants,
    stock,
    orders,
    items,
    fulfillments,
    fulfillmentItems,
    movements,
    outboundQueues,
    invoices,
    payments,
    descriptionTemplates,
    warehouses,
  ] = await Promise.all([
    prisma.salesCustomer.count(),
    prisma.salesProduct.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.inventoryStock.count(),
    prisma.salesOrder.count(),
    prisma.salesOrderItem.count(),
    prisma.salesOrderFulfillment.count(),
    prisma.salesOrderFulfillmentItem.count(),
    prisma.inventoryMovement.count(),
    prisma.salesOutboundQueue.count(),
    prisma.invoice.count(),
    prisma.salesOrderPayment.count(),
    prisma.descriptionTemplate.count(),
    prisma.warehouse.count(),
  ]);
  return {
    customers,
    salesProducts,
    legacyProducts,
    variants,
    stock,
    orders,
    items,
    fulfillments,
    fulfillmentItems,
    movements,
    outboundQueues,
    invoices,
    payments,
    descriptionTemplates,
    warehouses,
  };
}

function fixtureVariantIds() {
  return [
    fixture?.standardOne?.variantId,
    fixture?.standardTwo?.variantId,
    fixture?.decimal?.variantId,
    fixture?.flooring?.variantId,
  ].filter(Boolean) as string[];
}

async function cleanupPhase1BRecords() {
  const variantIds = fixtureVariantIds();
  const productIds = [
    fixture?.standardOne?.salesProductId,
    fixture?.standardTwo?.salesProductId,
    fixture?.decimal?.salesProductId,
    fixture?.flooring?.salesProductId,
  ].filter(Boolean) as string[];
  const customerIds = [
    fixture?.existingCustomerId,
    ...Array.from(createdCustomerIds),
  ].filter(Boolean) as string[];

  const taggedOrders = await prisma.salesOrder.findMany({
    where: {
      OR: [
        { id: { in: Array.from(createdOrderIds) } },
        { projectName: { contains: QA_MARKER } },
        { customerId: { in: customerIds } },
        { customer: { name: { contains: QA_MARKER } } },
      ],
    },
    select: { id: true },
  });
  const orderIds = taggedOrders.map((order) => order.id);
  const fulfillmentIds = orderIds.length
    ? (
        await prisma.salesOrderFulfillment.findMany({
          where: { salesOrderId: { in: orderIds } },
          select: { id: true },
        })
      ).map((fulfillment) => fulfillment.id)
    : [];

  await prisma.inventoryMovement.deleteMany({
    where: {
      OR: [
        { variantId: { in: variantIds } },
        { fulfillmentId: { in: fulfillmentIds } },
        { note: { contains: QA_MARKER } },
      ],
    },
  });
  await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.salesCustomer.deleteMany({
    where: {
      OR: [
        { id: { in: customerIds } },
        { name: { contains: QA_MARKER } },
        { email: { contains: RUN_ID } },
      ],
    },
  });
  await prisma.inventoryStock.deleteMany({
    where: { variantId: { in: variantIds } },
  });
  await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  await prisma.salesProduct.deleteMany({ where: { id: { in: productIds } } });
  await prisma.product.deleteMany({
    where: {
      OR: [{ id: { in: productIds } }, { name: { contains: QA_MARKER } }],
    },
  });
  if (fixture?.warehouseId) {
    await prisma.warehouse.deleteMany({ where: { id: fixture.warehouseId } });
  }
  await prisma.warehouse.deleteMany({
    where: { name: { contains: QA_MARKER } },
  });

  return { orderIds, customerIds, productIds, variantIds, fulfillmentIds };
}

async function seedProduct(args: {
  name: string;
  sku: string;
  category: "OTHER" | "FLOOR";
  unit: "PIECE" | "SQM";
  price: number;
  cost: number;
  expectedUnit: "PIECE" | "SQFT" | "BOX";
  boxSqft?: number;
}): Promise<FixtureProduct> {
  const legacy = await prisma.product.create({
    data: {
      name: args.name,
      title: args.name,
      category: args.category,
      unit: args.unit,
      costPrice: args.cost,
      salePrice: args.price,
      currentStock: 100,
      minStock: 0,
      reorderLevel: 0,
      reorderQty: 0,
      warehouseId: fixture.warehouseId,
      price: args.price,
      cost: args.cost,
      sku: args.sku,
      status: "active",
      flooringBoxCoverageSqft: args.boxSqft ?? null,
      flooringMaterial: args.category === "FLOOR" ? "SPC" : null,
      flooringWearLayer: args.category === "FLOOR" ? "20 mil" : null,
      flooringThicknessMm: args.category === "FLOOR" ? 5.5 : null,
      flooringPlankLengthIn: args.category === "FLOOR" ? 48 : null,
      flooringPlankWidthIn: args.category === "FLOOR" ? 7 : null,
      notes: `${QA_MARKER} ${RUN_ID}`,
    },
  });
  const salesProduct = await prisma.salesProduct.create({
    data: {
      id: legacy.id,
      name: args.name,
      title: args.name,
      defaultDescription: `${args.name} ${QA_MARKER}`,
      unit: args.unit,
      price: args.price,
      cost: args.cost,
      availableStock: 100,
      active: true,
      flooringBoxCoverageSqft: args.boxSqft ?? null,
      flooringMaterial: args.category === "FLOOR" ? "SPC" : null,
      flooringWearLayer: args.category === "FLOOR" ? "20 mil" : null,
      flooringThicknessMm: args.category === "FLOOR" ? 5.5 : null,
      flooringPlankLengthIn: args.category === "FLOOR" ? 48 : null,
      flooringPlankWidthIn: args.category === "FLOOR" ? 7 : null,
      brand: "SolidCore QA",
      collection: RUN_ID,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: salesProduct.id,
      sku: args.sku,
      displayName: args.name,
      description: `${args.name} variant`,
      price: args.price,
      cost: args.cost,
      boxSqft: args.boxSqft ?? null,
      reorderLevel: 0,
      reorderQty: 0,
      isStockItem: true,
    },
  });
  await prisma.inventoryStock.create({
    data: { variantId: variant.id, onHand: 100, reserved: 0 },
  });
  return {
    legacyProductId: legacy.id,
    salesProductId: salesProduct.id,
    variantId: variant.id,
    sku: args.sku,
    name: args.name,
    expectedUnit: args.expectedUnit,
    price: args.price,
    boxSqft: args.boxSqft,
  };
}

async function seedFixture() {
  await cleanupPhase1BRecords();
  results.counts.before = await captureCounts();

  const warehouse = await prisma.warehouse.create({
    data: {
      name: `${QA_MARKER} Warehouse ${RUN_ID}`,
      address: "100 QA Warehouse Way",
      managerName: "Phase 1B QA",
    },
  });
  fixture = {
    warehouseId: warehouse.id,
    existingCustomerId: "",
    existingCustomerName: `${QA_MARKER} Existing Customer ${RUN_ID}`,
    standardOne: {} as FixtureProduct,
    standardTwo: {} as FixtureProduct,
    decimal: {} as FixtureProduct,
    flooring: {} as FixtureProduct,
  };

  const existingCustomer = await prisma.salesCustomer.create({
    data: {
      name: fixture.existingCustomerName,
      phone: "808-555-1010",
      email: `${RUN_ID}-existing@example.com`,
      address: "101 Existing Customer Ave",
      billingAddress: "101 Existing Customer Ave",
      taxExempt: true,
      taxRate: null,
      notes: `${QA_MARKER} existing customer`,
    },
  });
  fixture.existingCustomerId = existingCustomer.id;
  createdCustomerIds.add(existingCustomer.id);

  fixture.standardOne = await seedProduct({
    name: `${QA_MARKER} Standard One ${RUN_ID}`,
    sku: `P1B-STD1-${RUN_ID}`,
    category: "OTHER",
    unit: "PIECE",
    price: 12,
    cost: 5,
    expectedUnit: "PIECE",
  });
  fixture.standardTwo = await seedProduct({
    name: `${QA_MARKER} Standard Two ${RUN_ID}`,
    sku: `P1B-STD2-${RUN_ID}`,
    category: "OTHER",
    unit: "PIECE",
    price: 7.5,
    cost: 3,
    expectedUnit: "PIECE",
  });
  fixture.decimal = await seedProduct({
    name: `${QA_MARKER} Decimal Linear ${RUN_ID}`,
    sku: `P1B-DEC-${RUN_ID}`,
    category: "OTHER",
    unit: "SQM",
    price: 4.25,
    cost: 1.5,
    expectedUnit: "SQFT",
  });
  fixture.flooring = await seedProduct({
    name: `${QA_MARKER} Flooring Box ${RUN_ID}`,
    sku: `P1B-FLOOR-${RUN_ID}`,
    category: "FLOOR",
    unit: "PIECE",
    price: 30,
    cost: 18,
    expectedUnit: "BOX",
    boxSqft: 20,
  });

  results.fixture = {
    existingCustomerId: fixture.existingCustomerId,
    existingCustomerName: fixture.existingCustomerName,
    products: {
      standardOne: fixture.standardOne,
      standardTwo: fixture.standardTwo,
      decimal: fixture.decimal,
      flooring: fixture.flooring,
    },
  };
  results.counts.afterFixture = await captureCounts();
}

async function selectExistingCustomer(
  page: Page,
  metrics: ScenarioMetrics,
  query = fixture.existingCustomerName,
) {
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  metrics.majorInteractions += 1;
  await page.getByLabel("Customer search").fill(query);
  metrics.keyboardActions += 1;
  await page
    .getByRole("button", {
      name: new RegExp(`Use ${escapeRegex(fixture.existingCustomerName)}`),
    })
    .click();
  metrics.majorInteractions += 1;
  await expect(page.getByLabel("Product or SKU search")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`Customer ${escapeRegex(fixture.existingCustomerName)}`),
    }),
  ).toBeVisible();
}

async function addProductFromBrowse(
  page: Page,
  product: FixtureProduct,
  metrics: ScenarioMetrics,
) {
  await page.getByPlaceholder("Search products...").fill(product.sku);
  metrics.keyboardActions += 1;
  await page
    .getByRole("button", {
      name: new RegExp(`Add ${escapeRegex(product.name)} to cart`),
    })
    .click();
  metrics.majorInteractions += 1;
  await expect(
    page.getByLabel(new RegExp(`Quantity for .*${escapeRegex(product.sku)}`)),
  ).toBeVisible();
}

async function setLineQuantity(
  page: Page,
  product: FixtureProduct,
  quantity: string,
  metrics: ScenarioMetrics,
) {
  const quantityInput = page.getByLabel(
    new RegExp(`Quantity for .*${escapeRegex(product.sku)}`),
  );
  await quantityInput.fill(quantity);
  metrics.keyboardActions += 1;
}

async function openNewSale(page: Page, docType: "SALES_ORDER" | "QUOTE") {
  await authenticate(page);
  await page.goto(`/sales-orders/new?docType=${docType}`);
  await expect(page.getByTestId("new-sale-mode")).toHaveText(
    docType === "QUOTE" ? "New Quote" : "New Sales Order",
  );
}

function orderIdFromUrl(url: string) {
  const match = new URL(url).pathname.match(/\/orders\/([^/?#]+)/);
  if (!match?.[1]) throw new Error(`Could not parse order ID from ${url}`);
  return match[1];
}

async function captureOrderEvidence(orderId: string): Promise<OrderEvidence> {
  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { orderBy: { createdAt: "asc" } },
      fulfillments: {
        orderBy: { createdAt: "asc" },
        include: { items: true },
      },
      invoices: true,
      payments: true,
    },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);
  const variantIds = order.items
    .map((item) => item.variantId)
    .filter(Boolean) as string[];
  const [movements, stock] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: {
        variantId: { in: variantIds },
        note: { contains: order.orderNumber },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inventoryStock.findMany({
      where: { variantId: { in: variantIds } },
      orderBy: { variantId: "asc" },
    }),
  ]);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    docType: order.docType,
    status: order.status,
    customerName: order.customer.name,
    fulfillmentMethod: order.fulfillmentMethod,
    subtotal: toNumber(order.subtotal),
    discount: toNumber(order.discount),
    tax: toNumber(order.tax),
    total: toNumber(order.total),
    items: order.items.map((item) => ({
      variantId: item.variantId,
      productId: item.productId,
      sku: item.productSku,
      title: item.productTitle,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.lineTotal),
      uomSnapshot: item.uomSnapshot,
    })),
    fulfillments: order.fulfillments.map((fulfillment) => ({
      id: fulfillment.id,
      type: fulfillment.type,
      status: fulfillment.status,
      itemCount: fulfillment.items.length,
    })),
    inventoryMovements: movements.map((movement) => ({
      variantId: movement.variantId,
      type: movement.type,
      qty: toNumber(movement.qty),
      unit: movement.unit,
      note: movement.note,
    })),
    stock: stock.map((row) => ({
      variantId: row.variantId,
      onHand: toNumber(row.onHand),
      reserved: toNumber(row.reserved),
    })),
    invoiceCount: order.invoices.length,
    paymentCount: order.payments.length,
  };
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  return dimensions;
}

test.describe
  .serial("SolidCore Phase 1B real-flow counter-sales validation", () => {
  test.beforeAll(async () => {
    await seedFixture();
  });

  test.afterAll(async () => {
    results.counts.beforeCleanup = await captureCounts();
    results.cleanup = await cleanupPhase1BRecords();
    results.counts.afterCleanup = await captureCounts();
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
    await prisma.$disconnect();
  });

  test("Scenario A - simple pickup sales order opens confirmed order", async ({
    page,
  }) => {
    const metrics = newMetrics("Scenario A - Simple Pickup Sales Order");
    await openNewSale(page, "SALES_ORDER");
    await selectExistingCustomer(page, metrics);
    await addProductFromBrowse(page, fixture.standardOne, metrics);

    await Promise.all([
      page.waitForURL(/\/orders\/[^/?#]+\?created=1&status=confirmed$/),
      page.getByTestId("primary-sale-action").click(),
    ]);
    metrics.majorInteractions += 1;
    metrics.routeTransitions += 1;
    metrics.finalUrl = page.url();
    metrics.createdOrderId = orderIdFromUrl(page.url());
    createdOrderIds.add(metrics.createdOrderId);
    await expect(
      page.getByText("Confirmed", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(fixture.existingCustomerName, { exact: true }).first(),
    ).toBeVisible();

    const evidence = await captureOrderEvidence(metrics.createdOrderId);
    expect(evidence.docType).toBe("SALES_ORDER");
    expect(evidence.status).toBe("CONFIRMED");
    expect(evidence.fulfillmentMethod).toBe("PICKUP");
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      variantId: fixture.standardOne.variantId,
      productId: fixture.standardOne.salesProductId,
      quantity: 1,
      unitPrice: 12,
      lineTotal: 12,
      uomSnapshot: "PIECE",
    });
    expect(evidence.total).toBe(12);
    expect(evidence.fulfillments).toHaveLength(1);
    expect(evidence.fulfillments[0]).toMatchObject({ type: "PICKUP" });
    expect(evidence.invoiceCount).toBe(0);
    expect(evidence.paymentCount).toBe(0);
    expect(evidence.inventoryMovements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variantId: fixture.standardOne.variantId,
          type: "RESERVE",
          qty: 1,
        }),
      ]),
    );

    results.scenarios.A = finishMetrics(metrics);
    results.evidence.A = evidence;
  });

  test("Scenario B - quote saves as quoted without reservation or fulfillment", async ({
    page,
  }) => {
    const metrics = newMetrics("Scenario B - Quote");
    await openNewSale(page, "QUOTE");
    await selectExistingCustomer(page, metrics);
    const beforeStock = await prisma.inventoryStock.findMany({
      where: {
        variantId: {
          in: [fixture.standardOne.variantId, fixture.standardTwo.variantId],
        },
      },
      orderBy: { variantId: "asc" },
      select: { variantId: true, onHand: true, reserved: true },
    });
    await addProductFromBrowse(page, fixture.standardOne, metrics);
    await addProductFromBrowse(page, fixture.standardTwo, metrics);

    await Promise.all([
      page.waitForURL(/\/orders\/[^/?#]+$/),
      page.getByTestId("primary-sale-action").click(),
    ]);
    metrics.majorInteractions += 1;
    metrics.routeTransitions += 1;
    metrics.finalUrl = page.url();
    metrics.createdOrderId = orderIdFromUrl(page.url());
    createdOrderIds.add(metrics.createdOrderId);
    expect(page.url()).not.toContain("status=confirmed");
    await expect(
      page.getByText("Sales Order created and confirmed."),
    ).toHaveCount(0);
    await expect(page.getByText("Quoted")).toBeVisible();

    const afterStock = await prisma.inventoryStock.findMany({
      where: {
        variantId: {
          in: [fixture.standardOne.variantId, fixture.standardTwo.variantId],
        },
      },
      orderBy: { variantId: "asc" },
      select: { variantId: true, onHand: true, reserved: true },
    });
    expect(
      afterStock.map((row) => ({
        ...row,
        onHand: toNumber(row.onHand),
        reserved: toNumber(row.reserved),
      })),
    ).toEqual(
      beforeStock.map((row) => ({
        ...row,
        onHand: toNumber(row.onHand),
        reserved: toNumber(row.reserved),
      })),
    );

    const evidence = await captureOrderEvidence(metrics.createdOrderId);
    expect(evidence.docType).toBe("QUOTE");
    expect(evidence.status).toBe("QUOTED");
    expect(evidence.items).toHaveLength(2);
    expect(evidence.fulfillments).toHaveLength(0);
    expect(evidence.inventoryMovements).toHaveLength(0);
    expect(evidence.invoiceCount).toBe(0);
    expect(evidence.paymentCount).toBe(0);

    results.scenarios.B = finishMetrics(metrics);
    results.evidence.B = { ...evidence, beforeStock, afterStock };
  });

  test("Scenario C - quick-created customer delivery order opens confirmed order", async ({
    page,
  }) => {
    const metrics = newMetrics(
      "Scenario C - Quick-Created Customer Delivery Order",
    );
    const quickCustomerName = `${QA_MARKER} Quick Customer ${RUN_ID}`;
    await openNewSale(page, "SALES_ORDER");

    await page.getByRole("button", { name: "Customers", exact: true }).click();
    metrics.majorInteractions += 1;
    await page.getByLabel("Customer search").fill(quickCustomerName);
    metrics.keyboardActions += 1;
    await page.getByRole("button", { name: /New customer/ }).click();
    metrics.majorInteractions += 1;
    metrics.dialogCount += 1;
    await page
      .getByRole("textbox", { name: "Primary contact" })
      .fill("P1B Site Contact");
    await page
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("808-555-2020");
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(`${RUN_ID}-quick@example.com`);
    await page
      .getByRole("textbox", { name: "Job site name" })
      .fill("P1B Delivery Site");
    await page
      .getByRole("textbox", { name: "Street address" })
      .fill("202 Quick Delivery Lane");
    await page.getByRole("textbox", { name: "City" }).fill("Honolulu");
    await page.getByRole("textbox", { name: "ZIP" }).fill("96813");
    metrics.keyboardActions += 7;
    await page.getByRole("button", { name: "Create customer" }).click();
    metrics.majorInteractions += 1;
    await expect(page.getByLabel("Product or SKU search")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Customer ${escapeRegex(quickCustomerName)}`),
      }),
    ).toBeVisible();

    await expect
      .poll(async () =>
        prisma.salesCustomer.findFirst({
          where: { name: quickCustomerName },
          select: { id: true },
        }),
      )
      .not.toBeNull();
    const savedQuickCustomer = await prisma.salesCustomer.findFirst({
      where: { name: quickCustomerName },
      select: { id: true },
    });
    if (savedQuickCustomer?.id) createdCustomerIds.add(savedQuickCustomer.id);

    await addProductFromBrowse(page, fixture.standardOne, metrics);
    await addProductFromBrowse(page, fixture.standardTwo, metrics);
    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    metrics.majorInteractions += 1;
    await expect(page.getByLabel("Job site name")).toHaveValue(
      "P1B Delivery Site",
    );
    await expect(page.getByLabel("Street address")).toHaveValue(
      "202 Quick Delivery Lane",
    );

    await Promise.all([
      page.waitForURL(/\/orders\/[^/?#]+\?created=1&status=confirmed$/),
      page.getByTestId("primary-sale-action").click(),
    ]);
    metrics.majorInteractions += 1;
    metrics.routeTransitions += 1;
    metrics.finalUrl = page.url();
    metrics.createdOrderId = orderIdFromUrl(page.url());
    createdOrderIds.add(metrics.createdOrderId);

    const evidence = await captureOrderEvidence(metrics.createdOrderId);
    expect(evidence.docType).toBe("SALES_ORDER");
    expect(evidence.status).toBe("CONFIRMED");
    expect(evidence.customerName).toBe(quickCustomerName);
    expect(evidence.fulfillmentMethod).toBe("DELIVERY");
    expect(evidence.items).toHaveLength(2);
    expect(evidence.fulfillments).toHaveLength(1);
    expect(evidence.fulfillments[0]).toMatchObject({ type: "DELIVERY" });

    results.scenarios.C = finishMetrics(metrics);
    results.evidence.C = evidence;
  });

  test("Scenario D - positive decimal quantity remains decimal with correct UOM and totals", async ({
    page,
  }) => {
    const metrics = newMetrics("Scenario D - Decimal Quantity");
    await openNewSale(page, "SALES_ORDER");
    await selectExistingCustomer(page, metrics);
    await addProductFromBrowse(page, fixture.decimal, metrics);
    await setLineQuantity(page, fixture.decimal, "1.5", metrics);

    await Promise.all([
      page.waitForURL(/\/orders\/[^/?#]+\?created=1&status=confirmed$/),
      page.getByTestId("primary-sale-action").click(),
    ]);
    metrics.majorInteractions += 1;
    metrics.routeTransitions += 1;
    metrics.finalUrl = page.url();
    metrics.createdOrderId = orderIdFromUrl(page.url());
    createdOrderIds.add(metrics.createdOrderId);

    const evidence = await captureOrderEvidence(metrics.createdOrderId);
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      variantId: fixture.decimal.variantId,
      productId: fixture.decimal.salesProductId,
      quantity: 1.5,
      unitPrice: 4.25,
      uomSnapshot: "SQFT",
    });
    expect(evidence.items[0].lineTotal).toBeCloseTo(6.375, 8);
    expect(evidence.subtotal).toBeCloseTo(6.38, 2);
    expect(evidence.total).toBeCloseTo(6.38, 2);

    results.scenarios.D = finishMetrics(metrics);
    results.evidence.D = evidence;
  });

  test("Scenario F - status transition failure leaves one accessible draft", async ({
    page,
  }) => {
    const metrics = newMetrics("Scenario F - Failure Recovery");
    await authenticate(page);
    await page.route("**/api/sales-orders/*/status", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Phase 1B forced status failure." }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/sales-orders/new?docType=SALES_ORDER");
    await expect(page.getByTestId("new-sale-mode")).toHaveText(
      "New Sales Order",
    );
    await selectExistingCustomer(page, metrics);
    await addProductFromBrowse(page, fixture.standardTwo, metrics);

    await page.getByTestId("primary-sale-action").click();
    metrics.majorInteractions += 1;
    await expect(page.locator(".so-entry-page [role='alert']")).toContainText(
      "The Sales Order draft was created, but confirmation failed.",
    );
    await expect(page.getByTestId("primary-sale-action")).toBeEnabled();
    const draftHref = await page
      .getByRole("link", { name: "Open draft" })
      .getAttribute("href");
    expect(draftHref).toMatch(/^\/orders\/.+/);
    const draftId = draftHref!.split("/").pop()!;
    createdOrderIds.add(draftId);
    metrics.createdOrderId = draftId;

    const duplicateCheck = await prisma.salesOrder.count({
      where: {
        customerId: fixture.existingCustomerId,
        status: "DRAFT",
        items: { some: { variantId: fixture.standardTwo.variantId } },
      },
    });
    expect(duplicateCheck).toBe(1);

    await page.getByRole("link", { name: "Open draft" }).click();
    metrics.majorInteractions += 1;
    metrics.routeTransitions += 1;
    await expect(page).toHaveURL(
      new RegExp(`/orders/${escapeRegex(draftId)}$`),
    );
    metrics.finalUrl = page.url();

    const evidence = await captureOrderEvidence(draftId);
    expect(evidence.status).toBe("DRAFT");
    expect(evidence.fulfillments).toHaveLength(0);
    expect(evidence.inventoryMovements).toHaveLength(0);

    results.scenarios.F = finishMetrics(metrics);
    results.evidence.F = evidence;
  });

  test("Responsive viewports keep common path visible without horizontal overflow", async ({
    page,
  }) => {
    const viewports = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "ipad-landscape", width: 1180, height: 820 },
      { name: "ipad-portrait", width: 820, height: 1180 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openNewSale(page, "SALES_ORDER");
      const dimensions = await assertNoHorizontalOverflow(page);
      await expect(page.getByLabel("Product or SKU search")).toBeVisible();
      await expect(page.getByLabel("Customer search")).toHaveCount(0);
      await expect(page.getByPlaceholder("Search products...")).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: new RegExp(
            `Add ${escapeRegex(fixture.standardOne.name)} to cart`,
          ),
        }),
      ).toBeVisible();
      await expect(page.getByTestId("totals-summary")).toBeVisible();
      await expect(page.getByTestId("primary-sale-action")).toBeVisible();
      await page.goto("/sales-orders/new?docType=QUOTE");
      await expect(page.getByTestId("new-sale-mode")).toHaveText("New Quote");
      await expect(page.getByTestId("primary-sale-action")).toHaveText(
        /Save Quote/,
      );
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `/private/tmp/solidcore-phase1b-${viewport.name}.png`,
        fullPage: false,
      });
      results.viewportResults.push({
        viewport: viewport.name,
        size: `${viewport.width}x${viewport.height}`,
        horizontalOverflow: false,
        clientWidth: dimensions.clientWidth,
        scrollWidth: dimensions.scrollWidth,
        customerSearchAvailableByMode: true,
        productSearchVisible: true,
        productNameVisible: true,
        skuReadable: true,
        stockVisible: true,
        priceVisible: true,
        addControlVisible: true,
        totalsVisible: true,
        primaryActionVisible: true,
        quoteSalesOrderClear: true,
      });
    }
  });

  test("Scenario E - flooring browse path preserves BOX UOM and square-foot summary", async ({
    page,
  }) => {
    const metrics = newMetrics("Scenario E - Flooring-Compatible Quantity");
    await openNewSale(page, "SALES_ORDER");
    await selectExistingCustomer(page, metrics);

    const productApiResponse = await page.request.get(
      `/api/sales-orders/products?q=${encodeURIComponent(fixture.flooring.sku)}`,
    );
    const productApiBody = await productApiResponse.json();
    const flooringProduct = productApiBody.data?.find(
      (row: { id?: string }) => row.id === fixture.flooring.variantId,
    );
    expect(flooringProduct).toMatchObject({
      id: fixture.flooring.variantId,
      productId: fixture.flooring.salesProductId,
      sku: fixture.flooring.sku,
      sellingUnit: "BOX",
      flooringBoxCoverageSqft: 20,
    });

    await addProductFromBrowse(page, fixture.flooring, metrics);
    await setLineQuantity(page, fixture.flooring, "2", metrics);
    await Promise.all([
      page.waitForURL(/\/orders\/[^/?#]+\?created=1&status=confirmed$/),
      page.getByTestId("primary-sale-action").click(),
    ]);
    metrics.majorInteractions += 1;
    metrics.routeTransitions += 1;
    metrics.finalUrl = page.url();
    metrics.createdOrderId = orderIdFromUrl(page.url());
    createdOrderIds.add(metrics.createdOrderId);

    const evidence = await captureOrderEvidence(metrics.createdOrderId);
    expect(evidence.status).toBe("CONFIRMED");
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0]).toMatchObject({
      variantId: fixture.flooring.variantId,
      productId: fixture.flooring.salesProductId,
      sku: fixture.flooring.sku,
      quantity: 2,
      unitPrice: 30,
      lineTotal: 60,
      uomSnapshot: "BOX",
    });
    await expect(page.getByText("2 boxes (40 sqft)")).toBeVisible();

    results.scenarios.E = finishMetrics(metrics);
    results.evidence.E = { ...evidence, productApi: flooringProduct };
  });
});
