import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";

const MARKER = "SOLIDCORE PHASE4A1 INVOICE QA DELETE ME";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for invoice persistence tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run invoice persistence tests against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase4a1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type FixtureVariant = {
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  uom: string;
  price: number;
};

type FixtureState = {
  customerId: string;
  piece: FixtureVariant;
  linear: FixtureVariant;
  flooring: FixtureVariant;
};

type OrderSnapshot = {
  id: string;
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  items: Array<{
    sku: string;
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    uom: string;
    title: string;
  }>;
};

let fixture: FixtureState;

function createSessionCookie() {
  const payload = {
    userId: "phase4a1-test-admin",
    role: "ADMIN",
    name: "Phase 4A-1 Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders() {
  return {
    Cookie: createSessionCookie(),
    "x-user-role": "ADMIN",
  };
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function expectMoney(actual: unknown, expected: number, label: string) {
  expect(toNumber(actual), label).toBeCloseTo(expected, 2);
}

function extractPdfContentText(buffer: Buffer) {
  const chunks = [buffer.toString("latin1")];
  const appendDecoded = (text: string) => {
    chunks.push(text);
    chunks.push(
      text.replace(/<([0-9A-Fa-f]+)>/g, (_match, hex: string) => {
        try {
          return Buffer.from(hex, "hex").toString("utf8");
        } catch {
          return "";
        }
      }),
    );
  };
  const source = buffer.toString("latin1");
  let searchFrom = 0;
  while (searchFrom < buffer.length) {
    const streamIndex = source.indexOf("stream", searchFrom);
    if (streamIndex < 0) break;
    let start = streamIndex + "stream".length;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    else if (buffer[start] === 10 || buffer[start] === 13) start += 1;
    let end = source.indexOf("endstream", start);
    if (end < 0) break;
    while (end > start && (buffer[end - 1] === 10 || buffer[end - 1] === 13)) end -= 1;

    const dictionaryStart = source.lastIndexOf("<<", streamIndex);
    const dictionary = dictionaryStart >= 0 ? source.slice(dictionaryStart, streamIndex) : "";
    const raw = buffer.subarray(start, end);
    if (dictionary.includes("/FlateDecode")) {
      try {
        appendDecoded(inflateSync(raw).toString("latin1"));
      } catch {
        appendDecoded(raw.toString("latin1"));
      }
    } else {
      appendDecoded(raw.toString("latin1"));
    }
    searchFrom = end + "endstream".length;
  }
  return chunks.join("\n");
}

function variantIds() {
  return [fixture?.piece?.variantId, fixture?.linear?.variantId, fixture?.flooring?.variantId].filter(
    Boolean,
  ) as string[];
}

function productIds() {
  return [fixture?.piece?.productId, fixture?.linear?.productId, fixture?.flooring?.productId].filter(
    Boolean,
  ) as string[];
}

async function cleanupTaggedFixtures() {
  const customers = await prisma.salesCustomer.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);
  const products = await prisma.salesProduct.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const foundProductIds = products.map((product) => product.id);
  const variantWhere = foundProductIds.length
    ? {
        OR: [
          { sku: { contains: "PH4A1-" } },
          { productId: { in: foundProductIds } },
        ],
      }
    : { sku: { contains: "PH4A1-" } };
  const variants = await prisma.productVariant.findMany({
    where: variantWhere,
    select: { id: true },
  });
  const foundVariantIds = variants.map((variant) => variant.id);
  const orderWhere = {
    OR: [
      { notes: { contains: MARKER } },
      { projectName: { contains: MARKER } },
      ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
    ],
  };
  const orders = await prisma.salesOrder.findMany({
    where: orderWhere,
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const invoiceWhere = {
    OR: [
      { notes: { contains: MARKER } },
      ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
    ],
  };
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    select: { id: true },
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const fulfillments = await prisma.salesOrderFulfillment.findMany({
    where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    select: { id: true },
  });
  const fulfillmentIds = fulfillments.map((fulfillment) => fulfillment.id);
  const paymentWhere = [
    ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
    ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
  ];
  const movementWhere = [
    ...(foundVariantIds.length ? [{ variantId: { in: foundVariantIds } }] : []),
    ...(fulfillmentIds.length ? [{ fulfillmentId: { in: fulfillmentIds } }] : []),
  ];

  await prisma.salesOrderPayment.deleteMany({
    where: paymentWhere.length ? { OR: paymentWhere } : { id: "__none__" },
  });
  await prisma.invoiceItem.deleteMany({
    where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
  });
  await prisma.invoice.deleteMany({
    where: invoiceIds.length ? { id: { in: invoiceIds } } : { id: "__none__" },
  });
  await prisma.inventoryMovement.deleteMany({
    where: movementWhere.length ? { OR: movementWhere } : { id: "__none__" },
  });
  await prisma.salesOrderFulfillmentItem.deleteMany({
    where: fulfillmentIds.length ? { fulfillmentId: { in: fulfillmentIds } } : { fulfillmentId: "__none__" },
  });
  await prisma.salesOrderFulfillment.deleteMany({
    where: orderIds.length ? { id: { in: fulfillmentIds } } : { id: "__none__" },
  });
  await prisma.salesOrder.deleteMany({
    where: orderIds.length ? { id: { in: orderIds } } : { id: "__none__" },
  });
  await prisma.inventoryStock.deleteMany({
    where: foundVariantIds.length ? { variantId: { in: foundVariantIds } } : { variantId: "__none__" },
  });
  await prisma.productVariant.deleteMany({
    where: foundVariantIds.length ? { id: { in: foundVariantIds } } : { id: "__none__" },
  });
  await prisma.salesProduct.deleteMany({
    where: foundProductIds.length ? { id: { in: foundProductIds } } : { id: "__none__" },
  });
  await prisma.customerNote.deleteMany({
    where: customerIds.length ? { customerId: { in: customerIds } } : { customerId: "__none__" },
  });
  await prisma.salesCustomer.deleteMany({
    where: customerIds.length ? { id: { in: customerIds } } : { id: "__none__" },
  });
}

async function taggedCounts() {
  const customers = await prisma.salesCustomer.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);
  const products = await prisma.salesProduct.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const foundProductIds = products.map((product) => product.id);
  const variantWhere = foundProductIds.length
    ? {
        OR: [
          { sku: { contains: "PH4A1-" } },
          { productId: { in: foundProductIds } },
        ],
      }
    : { sku: { contains: "PH4A1-" } };
  const variants = await prisma.productVariant.findMany({
    where: variantWhere,
    select: { id: true },
  });
  const foundVariantIds = variants.map((variant) => variant.id);
  const orderWhere = {
    OR: [
      { notes: { contains: MARKER } },
      { projectName: { contains: MARKER } },
      ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
    ],
  };
  const orders = await prisma.salesOrder.findMany({
    where: orderWhere,
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const invoiceWhere = {
    OR: [
      { notes: { contains: MARKER } },
      ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
    ],
  };
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere,
    select: { id: true },
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const paymentWhere = [
    ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
    ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
  ];

  return {
    customers: customerIds.length,
    products: foundProductIds.length,
    variants: foundVariantIds.length,
    stocks: await prisma.inventoryStock.count({
      where: foundVariantIds.length ? { variantId: { in: foundVariantIds } } : { variantId: "__none__" },
    }),
    orders: orderIds.length,
    items: await prisma.salesOrderItem.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    invoices: invoiceIds.length,
    invoiceItems: await prisma.invoiceItem.count({
      where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
    }),
    payments: await prisma.salesOrderPayment.count({
      where: paymentWhere.length ? { OR: paymentWhere } : { id: "__none__" },
    }),
    returns: await prisma.salesReturn.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    fulfillments: await prisma.salesOrderFulfillment.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    movements: await prisma.inventoryMovement.count({
      where: foundVariantIds.length ? { variantId: { in: foundVariantIds } } : { variantId: "__none__" },
    }),
  };
}

async function createFixtureVariant(args: {
  suffix: string;
  title: string;
  unit: string;
  price: number;
  flooring?: boolean;
}) {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${MARKER} ${args.title} ${runId}`,
      title: args.title,
      defaultDescription: `${runMarker} ${args.title}`,
      unit: args.unit,
      price: args.price,
      cost: Math.max(args.price / 2, 1),
      availableStock: 100,
      flooringMaterial: args.flooring ? "LVP" : null,
      flooringWearLayer: args.flooring ? "20 mil" : null,
      flooringBoxCoverageSqft: args.flooring ? 23.5 : null,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `PH4A1-${args.suffix}-${runId}`,
      displayName: args.title,
      description: `${runMarker} ${args.title}`,
      price: args.price,
      cost: Math.max(args.price / 2, 1),
      boxSqft: args.flooring ? 23.5 : null,
      isStockItem: true,
    },
  });
  await prisma.inventoryStock.create({
    data: {
      variantId: variant.id,
      onHand: 100,
      reserved: 0,
    },
  });
  return {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    title: args.title,
    uom: args.flooring ? "BOX" : args.unit,
    price: args.price,
  };
}

async function createBaseFixtures() {
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${MARKER} Customer ${runId}`,
      phone: "808-555-4101",
      email: `${runId}@example.com`,
      address: "4101 Invoice Snapshot Way",
      billingAddress: "4101 Invoice Snapshot Way",
    },
  });

  const piece = await createFixtureVariant({ suffix: "PIECE", title: "Phase 4A-1 Door Kit", unit: "PIECE", price: 100 });
  const linear = await createFixtureVariant({ suffix: "LF", title: "Phase 4A-1 Trim LF", unit: "LF", price: 20 });
  const flooring = await createFixtureVariant({
    suffix: "FLOOR",
    title: "Phase 4A-1 Flooring Box",
    unit: "PIECE",
    price: 42,
    flooring: true,
  });

  fixture = { customerId: customer.id, piece, linear, flooring };
}

function defaultLines() {
  return [
    {
      variant: fixture.piece,
      qty: 2,
      unitPrice: 100,
      discount: 5,
      lineTotal: 195,
      description: "Door kit with line discount",
    },
    {
      variant: fixture.linear,
      qty: 1.5,
      unitPrice: 20,
      discount: 0,
      lineTotal: 30,
      description: "Linear-foot trim decimal line",
    },
    {
      variant: fixture.flooring,
      qty: 2.5,
      unitPrice: 42,
      discount: 0,
      lineTotal: 105,
      description: "Flooring box decimal line",
    },
  ];
}

async function createSalesOrder(
  suffix: string,
  overrides: Partial<{
    status: "DRAFT" | "CONFIRMED" | "READY" | "PARTIALLY_FULFILLED" | "FULFILLED";
    discount: number;
    tax: number;
    total: number;
    lines: ReturnType<typeof defaultLines>;
  }> = {},
): Promise<OrderSnapshot> {
  const lines = overrides.lines ?? defaultLines();
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discount = overrides.discount ?? 10;
  const taxRate = 4.712;
  const tax = overrides.tax ?? 15.08;
  const total = overrides.total ?? Number((subtotal - discount + tax).toFixed(2));
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH4A1-${suffix}-${runId}`,
      customerId: fixture.customerId,
      docType: "SALES_ORDER",
      status: overrides.status ?? "CONFIRMED",
      projectName: runMarker,
      fulfillmentMethod: "PICKUP",
      subtotal,
      discount,
      taxRate,
      tax,
      total,
      paidAmount: 0,
      balanceDue: total,
      paymentStatus: "unpaid",
      hidePrices: false,
      depositRequired: 0,
      commissionRate: 0,
      commissionAmount: 0,
      notes: runMarker,
    },
  });

  await prisma.salesOrderItem.createMany({
    data: lines.map((line) => ({
      salesOrderId: order.id,
      productId: line.variant.productId,
      variantId: line.variant.variantId,
      productSku: line.variant.sku,
      productTitle: line.variant.title,
      skuSnapshot: line.variant.sku,
      titleSnapshot: line.variant.title,
      uomSnapshot: line.variant.uom,
      lineDescription: line.description,
      description: line.description,
      quantity: line.qty,
      unitPrice: line.unitPrice,
      lineDiscount: line.discount,
      lineTotal: line.lineTotal,
      fulfillQty: 0,
    })),
  });

  return {
    id: order.id,
    subtotal,
    discount,
    taxRate,
    tax,
    total,
    paidAmount: 0,
    balanceDue: total,
    items: lines.map((line) => ({
      sku: line.variant.sku,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discount: line.discount,
      lineTotal: line.lineTotal,
      uom: line.variant.uom,
      title: line.variant.title,
    })),
  };
}

async function postCreateInvoice(request: APIRequestContext, salesOrderId: string) {
  const response = await request.post(`/api/invoices/from-sales-order/${salesOrderId}`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function loadInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  expect(invoice).not.toBeNull();
  return invoice!;
}

async function assertInvoiceSnapshot(invoiceId: string, snapshot: OrderSnapshot) {
  const invoice = await loadInvoice(invoiceId);
  expect(invoice.salesOrderId).toBe(snapshot.id);
  expectMoney(invoice.subtotal, snapshot.subtotal, "invoice subtotal");
  expectMoney(invoice.discountAmount, snapshot.discount, "invoice order-level discount");
  expectMoney(invoice.taxRate, snapshot.taxRate, "invoice tax rate");
  expectMoney(invoice.taxAmount, snapshot.tax, "invoice tax");
  expectMoney(invoice.total, snapshot.total, "invoice total");
  expect(invoice.items).toHaveLength(snapshot.items.length);

  const itemSubtotal = invoice.items.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  expectMoney(itemSubtotal, snapshot.subtotal, "invoice item subtotal");
  expectMoney(
    toNumber(invoice.subtotal) - toNumber(invoice.discountAmount) + toNumber(invoice.taxAmount),
    snapshot.total,
    "invoice header formula",
  );

  for (const expected of snapshot.items) {
    const item = invoice.items.find((row) => row.skuSnapshot === expected.sku);
    expect(item, `invoice item ${expected.sku}`).toBeTruthy();
    expectMoney(item!.qty, expected.qty, `${expected.sku} quantity`);
    expectMoney(item!.unitPrice, expected.unitPrice, `${expected.sku} unit price`);
    expectMoney(item!.discount, expected.discount, `${expected.sku} line discount`);
    expectMoney(item!.lineTotal, expected.lineTotal, `${expected.sku} line total`);
    expect(item!.uomSnapshot).toBe(expected.uom);
    expect(item!.titleSnapshot).toBe(expected.title);
  }

  return invoice;
}

async function captureNonInvoiceState(orderId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      paidAmount: true,
      balanceDue: true,
      paymentStatus: true,
    },
  });
  return {
    order: order
      ? {
          paidAmount: toNumber(order.paidAmount),
          balanceDue: toNumber(order.balanceDue),
          paymentStatus: order.paymentStatus,
        }
      : null,
    payments: await prisma.salesOrderPayment.count({ where: { salesOrderId: orderId } }),
    salesReturns: await prisma.salesReturn.count({ where: { salesOrderId: orderId } }),
    afterSalesReturns: await prisma.afterSalesReturn.count({ where: { salesOrderId: orderId } }),
    fulfillments: await prisma.salesOrderFulfillment.count({ where: { salesOrderId: orderId } }),
    fulfillmentItems: await prisma.salesOrderFulfillmentItem.count(),
    movements: await prisma.inventoryMovement.count({ where: { variantId: { in: variantIds() } } }),
    stocks: await prisma.inventoryStock.findMany({
      where: { variantId: { in: variantIds() } },
      select: { variantId: true, onHand: true, reserved: true },
      orderBy: { variantId: "asc" },
    }),
  };
}

test.describe.serial("invoice snapshot, discount, and immutability integrity", () => {
  test.beforeAll(async () => {
    await cleanupTaggedFixtures();
    await createBaseFixtures();
  });

  test.afterAll(async () => {
    await cleanupTaggedFixtures();
    const remaining = await taggedCounts();
    expect(remaining).toEqual({
      customers: 0,
      products: 0,
      variants: 0,
      stocks: 0,
      orders: 0,
      items: 0,
      invoices: 0,
      invoiceItems: 0,
      payments: 0,
      returns: 0,
      fulfillments: 0,
      movements: 0,
    });
    await prisma.$disconnect();
  });

  test("creates an immutable invoice snapshot with order discount, line discounts, decimals, UOM, and flooring data", async ({
    request,
  }) => {
    const order = await createSalesOrder("SNAPSHOT");
    const before = await captureNonInvoiceState(order.id);

    const { response, body } = await postCreateInvoice(request, order.id);
    expect(response.status(), JSON.stringify(body)).toBe(201);
    expect(body.data?.existed).toBe(false);
    const invoiceId = String(body.data?.invoice?.id ?? "");
    expect(invoiceId).not.toBe("");

    await assertInvoiceSnapshot(invoiceId, order);
    const after = await captureNonInvoiceState(order.id);
    expect(after).toEqual(before);
  });

  test("source order edits and repeated create calls cannot mutate an existing invoice", async ({
    request,
  }) => {
    const order = await createSalesOrder("IMMUTABLE");
    const first = await postCreateInvoice(request, order.id);
    expect(first.response.status(), JSON.stringify(first.body)).toBe(201);
    const invoiceId = String(first.body.data?.invoice?.id ?? "");
    const beforeInvoice = await assertInvoiceSnapshot(invoiceId, order);

    const sourceItem = await prisma.salesOrderItem.findFirstOrThrow({
      where: { salesOrderId: order.id, skuSnapshot: fixture.piece.sku },
    });
    await prisma.salesOrderItem.update({
      where: { id: sourceItem.id },
      data: {
        quantity: 9,
        unitPrice: 77,
        lineDiscount: 3,
        lineTotal: 690,
        lineDescription: `${runMarker} changed source line`,
        description: `${runMarker} changed source line`,
      },
    });
    await prisma.salesOrder.update({
      where: { id: order.id },
      data: {
        subtotal: 825,
        discount: 25,
        tax: 37.7,
        total: 837.7,
        balanceDue: 837.7,
        notes: `${runMarker} changed source order`,
      },
    });
    await prisma.salesOrderItem.create({
      data: {
        salesOrderId: order.id,
        productId: fixture.piece.productId,
        variantId: fixture.piece.variantId,
        productSku: fixture.piece.sku,
        productTitle: fixture.piece.title,
        skuSnapshot: fixture.piece.sku,
        titleSnapshot: `${fixture.piece.title} new source line`,
        uomSnapshot: "PIECE",
        lineDescription: `${runMarker} source-only added line`,
        description: `${runMarker} source-only added line`,
        quantity: 1,
        unitPrice: 1,
        lineDiscount: 0,
        lineTotal: 1,
      },
    });

    const apiResponse = await request.get(`/api/invoices/${invoiceId}`, { headers: authHeaders() });
    const apiBody = await apiResponse.json();
    expect(apiResponse.status(), JSON.stringify(apiBody)).toBe(200);
    expectMoney(apiBody.data.subtotal, order.subtotal, "API subtotal remains invoice snapshot");
    expectMoney(apiBody.data.discountAmount, order.discount, "API discount remains invoice snapshot");
    expectMoney(apiBody.data.taxAmount, order.tax, "API tax remains invoice snapshot");
    expectMoney(apiBody.data.total, order.total, "API total remains invoice snapshot");
    expect(apiBody.data.items).toHaveLength(order.items.length);

    const second = await postCreateInvoice(request, order.id);
    expect(second.response.status(), JSON.stringify(second.body)).toBe(200);
    expect(second.body.data?.existed).toBe(true);
    expect(second.body.data?.invoice?.id).toBe(invoiceId);

    const afterInvoice = await loadInvoice(invoiceId);
    expect(afterInvoice.updatedAt.toISOString()).toBe(beforeInvoice.updatedAt.toISOString());
    await assertInvoiceSnapshot(invoiceId, order);
  });

  test("concurrent create requests produce one authoritative invoice", async ({
    request,
  }) => {
    const order = await createSalesOrder("CONCURRENT");
    const results = await Promise.all([
      postCreateInvoice(request, order.id),
      postCreateInvoice(request, order.id),
    ]);
    const statuses = results.map((result) => result.response.status()).sort();
    expect(statuses).toEqual([200, 201]);
    const invoiceIds = results.map((result) => String(result.body.data?.invoice?.id ?? ""));
    expect(new Set(invoiceIds).size).toBe(1);

    const invoices = await prisma.invoice.findMany({
      where: { salesOrderId: order.id },
      include: { items: true },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].items).toHaveLength(order.items.length);
    await assertInvoiceSnapshot(invoices[0].id, order);
  });

  test("existing issued, paid, and void invoices are returned unchanged", async ({
    request,
  }) => {
    const order = await createSalesOrder("STATUS");
    const first = await postCreateInvoice(request, order.id);
    expect(first.response.status(), JSON.stringify(first.body)).toBe(201);
    const invoiceId = String(first.body.data?.invoice?.id ?? "");

    for (const status of ["sent", "paid", "void"]) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status },
      });
      await prisma.salesOrder.update({
        where: { id: order.id },
        data: {
          subtotal: 999,
          discount: 111,
          tax: 22,
          total: 910,
          notes: `${runMarker} source changed while invoice ${status}`,
        },
      });

      const again = await postCreateInvoice(request, order.id);
      expect(again.response.status(), JSON.stringify(again.body)).toBe(200);
      expect(again.body.data?.invoice?.status).toBe(status);
      await assertInvoiceSnapshot(invoiceId, order);
    }
  });

  test("PDF is generated from persisted invoice values including discount", async ({
    request,
  }) => {
    const order = await createSalesOrder("PDF");
    const created = await postCreateInvoice(request, order.id);
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    const invoiceId = String(created.body.data?.invoice?.id ?? "");
    const invoice = await assertInvoiceSnapshot(invoiceId, order);

    const pdfResponse = await request.get(`/api/pdf/invoice/${invoiceId}`, { headers: authHeaders() });
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    const pdfText = extractPdfContentText(Buffer.from(await pdfResponse.body()));
    expect(pdfText).toContain(invoice.invoiceNumber);
    expect(pdfText).toContain("Discount");
    expect(pdfText).toContain("335.08");
  });

  test("ineligible source order rejection leaves no partial invoice writes", async ({
    request,
  }) => {
    const order = await createSalesOrder("ROLLBACK", { status: "DRAFT" });
    const beforeInvoiceCount = await prisma.invoice.count({ where: { salesOrderId: order.id } });
    const beforeInvoiceItemCount = await prisma.invoiceItem.count();
    const beforeNonInvoice = await captureNonInvoiceState(order.id);

    const failed = await postCreateInvoice(request, order.id);
    const body = failed.body;
    expect(failed.response.status(), JSON.stringify(body)).toBe(400);
    expect(body.error).toContain("Confirm the sales order");

    expect(await prisma.invoice.count({ where: { salesOrderId: order.id } })).toBe(beforeInvoiceCount);
    expect(await prisma.invoiceItem.count()).toBe(beforeInvoiceItemCount);
    expect(await captureNonInvoiceState(order.id)).toEqual(beforeNonInvoice);
  });
});
