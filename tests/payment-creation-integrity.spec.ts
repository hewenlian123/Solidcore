import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parsePositivePaymentAmount } from "../lib/payment-creation-integrity";

const MARKER = "SOLIDCORE PHASE4A3 PAYMENT QA DELETE ME";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for payment creation integrity tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run payment creation tests against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase4a3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type Fixture = {
  customerId: string;
  salesOrderId: string;
  invoiceId: string;
  total: number;
};

function createSessionCookie() {
  const payload = {
    userId: "phase4a3-test-admin",
    role: "ADMIN",
    name: "Phase 4A-3 Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders(idempotencyKey?: string | null) {
  const headers: Record<string, string> = {
    Cookie: createSessionCookie(),
    "x-user-role": "ADMIN",
  };
  if (idempotencyKey !== null) {
    headers["Idempotency-Key"] = idempotencyKey ?? `phase4a3-${randomUUID()}`;
  }
  return headers;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function expectMoney(actual: unknown, expected: number, label: string) {
  expect(toNumber(actual), label).toBeCloseTo(expected, 2);
}

async function cleanupTaggedFixtures() {
  const customers = await prisma.salesCustomer.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);
  const orders = await prisma.salesOrder.findMany({
    where: {
      OR: [
        { notes: { contains: MARKER } },
        { projectName: { contains: MARKER } },
        ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { notes: { contains: MARKER } },
        ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = await prisma.salesOrderPayment.findMany({
    where:
      orderIds.length || invoiceIds.length
        ? {
            OR: [
              ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
              ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
            ],
          }
        : { id: "__none__" },
    select: { id: true },
  });
  const paymentIds = payments.map((payment) => payment.id);

  await prisma.salesOrderPayment.deleteMany({
    where: paymentIds.length ? { id: { in: paymentIds } } : { id: "__none__" },
  });
  await prisma.invoiceItem.deleteMany({
    where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
  });
  await prisma.invoice.deleteMany({
    where: invoiceIds.length ? { id: { in: invoiceIds } } : { id: "__none__" },
  });
  await prisma.salesOrderItem.deleteMany({
    where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
  });
  await prisma.salesOrder.deleteMany({
    where: orderIds.length ? { id: { in: orderIds } } : { id: "__none__" },
  });
  await prisma.customerNote.deleteMany({
    where: customerIds.length ? { customerId: { in: customerIds } } : { customerId: "__none__" },
  });
  await prisma.salesCustomer.deleteMany({
    where: customerIds.length ? { id: { in: customerIds } } : { id: "__none__" },
  });
}

async function countTaggedFixtures() {
  const customers = await prisma.salesCustomer.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);
  const orders = await prisma.salesOrder.findMany({
    where: {
      OR: [
        { notes: { contains: MARKER } },
        { projectName: { contains: MARKER } },
        ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { notes: { contains: MARKER } },
        ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = await prisma.salesOrderPayment.findMany({
    where:
      orderIds.length || invoiceIds.length
        ? {
            OR: [
              ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
              ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
            ],
          }
        : { id: "__none__" },
    select: { id: true },
  });
  const paymentIds = payments.map((payment) => payment.id);
  const products = await prisma.salesProduct.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const variants = await prisma.productVariant.findMany({
    where:
      productIds.length
        ? { productId: { in: productIds } }
        : { sku: { contains: MARKER } },
    select: { id: true },
  });
  const variantIds = variants.map((variant) => variant.id);
  const fulfillments = await prisma.salesOrderFulfillment.findMany({
    where: orderIds.length ? { salesOrderId: { in: orderIds } } : { id: "__none__" },
    select: { id: true },
  });
  const fulfillmentIds = fulfillments.map((fulfillment) => fulfillment.id);
  const returns = await prisma.salesReturn.findMany({
    where:
      orderIds.length || invoiceIds.length
        ? {
            OR: [
              ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
              ...(invoiceIds.length ? [{ sourceInvoiceId: { in: invoiceIds } }] : []),
            ],
          }
        : { id: "__none__" },
    select: { id: true },
  });
  const returnIds = returns.map((row) => row.id);

  return {
    customers: customers.length,
    products: products.length,
    variants: variants.length,
    inventoryStock: await prisma.inventoryStock.count({
      where: variantIds.length ? { variantId: { in: variantIds } } : { id: "__none__" },
    }),
    salesOrders: orders.length,
    salesOrderItems: await prisma.salesOrderItem.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { id: "__none__" },
    }),
    invoices: invoices.length,
    invoiceItems: await prisma.invoiceItem.count({
      where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { id: "__none__" },
    }),
    payments: payments.length,
    returns: returns.length,
    afterSalesReturns: await prisma.afterSalesReturn.count({
      where:
        customerIds.length || orderIds.length || invoiceIds.length
          ? {
              OR: [
                ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
                ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
                ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
              ],
            }
          : { id: "__none__" },
    }),
    fulfillments: fulfillments.length,
    fulfillmentItems: await prisma.salesOrderFulfillmentItem.count({
      where: fulfillmentIds.length ? { fulfillmentId: { in: fulfillmentIds } } : { id: "__none__" },
    }),
    inventoryMovements: await prisma.inventoryMovement.count({
      where:
        fulfillmentIds.length || variantIds.length
          ? {
              OR: [
                ...(fulfillmentIds.length ? [{ fulfillmentId: { in: fulfillmentIds } }] : []),
                ...(variantIds.length ? [{ variantId: { in: variantIds } }] : []),
              ],
            }
          : { id: "__none__" },
    }),
  };
}

async function createFixture(label: string, overrides: Partial<{ total: number; status: string }> = {}) {
  const total = overrides.total ?? 100;
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${MARKER} Customer ${label} ${runId}`,
      phone: "808-555-4303",
      email: `${label}-${runId}@example.com`,
      address: "4303 Payment Creation Way",
      billingAddress: "4303 Payment Creation Way",
    },
  });
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH4A3-${label}-${runId}`,
      customerId: customer.id,
      docType: "SALES_ORDER",
      status: "CONFIRMED",
      projectName: runMarker,
      fulfillmentMethod: "PICKUP",
      subtotal: total,
      discount: 0,
      taxRate: 0,
      tax: 0,
      total,
      paidAmount: 0,
      balanceDue: total,
      paymentStatus: "unpaid",
      depositRequired: 0,
      commissionRate: 0,
      commissionAmount: 0,
      notes: runMarker,
      items: {
        create: {
          skuSnapshot: `PH4A3-${label}`,
          titleSnapshot: "Phase 4A-3 Payment Test Item",
          uomSnapshot: "PIECE",
          productSku: `PH4A3-${label}`,
          productTitle: "Phase 4A-3 Payment Test Item",
          lineDescription: runMarker,
          quantity: 1,
          unitPrice: total,
          lineDiscount: 0,
          lineTotal: total,
          fulfillQty: 0,
          notes: runMarker,
        },
      },
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-PH4A3-${label}-${runId}`,
      salesOrderId: order.id,
      customerId: customer.id,
      status: overrides.status ?? "draft",
      subtotal: total,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total,
      billingAddress: "4303 Payment Creation Way",
      notes: runMarker,
      items: {
        create: {
          skuSnapshot: `PH4A3-${label}`,
          titleSnapshot: "Phase 4A-3 Payment Test Item",
          description: runMarker,
          uomSnapshot: "PIECE",
          unitPrice: total,
          qty: 1,
          discount: 0,
          lineTotal: total,
        },
      },
    },
  });
  return { customerId: customer.id, salesOrderId: order.id, invoiceId: invoice.id, total };
}

async function captureFixtureState(fixture: Fixture) {
  const [
    order,
    invoice,
    orderItems,
    invoiceItems,
    payments,
    fulfillments,
    fulfillmentItems,
    inventoryMovements,
    salesReturns,
    afterSalesReturns,
  ] = await Promise.all([
    prisma.salesOrder.findUniqueOrThrow({
      where: { id: fixture.salesOrderId },
      select: {
        id: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paidAmount: true,
        balanceDue: true,
        paymentStatus: true,
        status: true,
      },
    }),
    prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoiceId },
      select: {
        id: true,
        status: true,
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        total: true,
      },
    }),
    prisma.salesOrderItem.findMany({
      where: { salesOrderId: fixture.salesOrderId },
      select: { id: true, quantity: true, unitPrice: true, lineDiscount: true, lineTotal: true },
      orderBy: { id: "asc" },
    }),
    prisma.invoiceItem.findMany({
      where: { invoiceId: fixture.invoiceId },
      select: { id: true, qty: true, unitPrice: true, discount: true, lineTotal: true },
      orderBy: { id: "asc" },
    }),
    prisma.salesOrderPayment.findMany({
      where: { salesOrderId: fixture.salesOrderId },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        method: true,
        paymentType: true,
        status: true,
        idempotencyKey: true,
        idempotencyFingerprint: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.salesOrderFulfillment.findMany({
      where: { salesOrderId: fixture.salesOrderId },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    }),
    prisma.salesOrderFulfillmentItem.findMany({
      where: { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
      select: { id: true, orderedQty: true, fulfilledQty: true },
      orderBy: { id: "asc" },
    }),
    prisma.inventoryMovement.findMany({
      where: {
        OR: [
          { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
          { fulfillmentItem: { is: { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } } } },
        ],
      },
      select: { id: true, qty: true, type: true },
      orderBy: { id: "asc" },
    }),
    prisma.salesReturn.findMany({
      where: {
        OR: [{ salesOrderId: fixture.salesOrderId }, { sourceInvoiceId: fixture.invoiceId }],
      },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    }),
    prisma.afterSalesReturn.findMany({
      where: {
        OR: [
          { customerId: fixture.customerId },
          { salesOrderId: fixture.salesOrderId },
          { invoiceId: fixture.invoiceId },
        ],
      },
      select: { id: true, status: true, refundTotal: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const normalizeMoney = (value: unknown) => Number(value ?? 0).toFixed(2);
  return {
    order: {
      ...order,
      subtotal: normalizeMoney(order.subtotal),
      discount: normalizeMoney(order.discount),
      tax: normalizeMoney(order.tax),
      total: normalizeMoney(order.total),
      paidAmount: normalizeMoney(order.paidAmount),
      balanceDue: normalizeMoney(order.balanceDue),
    },
    invoice: {
      ...invoice,
      subtotal: normalizeMoney(invoice.subtotal),
      discountAmount: normalizeMoney(invoice.discountAmount),
      taxAmount: normalizeMoney(invoice.taxAmount),
      total: normalizeMoney(invoice.total),
    },
    orderItems: orderItems.map((item) => ({
      ...item,
      quantity: normalizeMoney(item.quantity),
      unitPrice: normalizeMoney(item.unitPrice),
      lineDiscount: normalizeMoney(item.lineDiscount),
      lineTotal: normalizeMoney(item.lineTotal),
    })),
    invoiceItems: invoiceItems.map((item) => ({
      ...item,
      qty: normalizeMoney(item.qty),
      unitPrice: normalizeMoney(item.unitPrice),
      discount: normalizeMoney(item.discount),
      lineTotal: normalizeMoney(item.lineTotal),
    })),
    payments: payments.map((payment) => ({
      ...payment,
      amount: normalizeMoney(payment.amount),
    })),
    fulfillments,
    fulfillmentItems: fulfillmentItems.map((item) => ({
      ...item,
      orderedQty: normalizeMoney(item.orderedQty),
      fulfilledQty: normalizeMoney(item.fulfilledQty),
    })),
    inventoryMovements: inventoryMovements.map((movement) => ({
      ...movement,
      qty: normalizeMoney(movement.qty),
    })),
    salesReturns,
    afterSalesReturns: afterSalesReturns.map((row) => ({
      ...row,
      refundTotal: normalizeMoney(row.refundTotal),
    })),
  };
}

async function postOrderPayment(
  request: APIRequestContext,
  fixture: Fixture,
  amount: unknown,
  idempotencyKey: string | null = `phase4a3-order-${randomUUID()}`,
) {
  const response = await request.post(`/api/sales-orders/${fixture.salesOrderId}/payments`, {
    headers: authHeaders(idempotencyKey),
    data: {
      amount,
      method: "CASH",
      type: "DEPOSIT",
      referenceNumber: `ORDER-${runId}`,
      notes: runMarker,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function postInvoicePayment(
  request: APIRequestContext,
  fixture: Fixture,
  amount: unknown,
  idempotencyKey: string | null = `phase4a3-invoice-${randomUUID()}`,
) {
  const response = await request.post(`/api/invoices/${fixture.invoiceId}/payments`, {
    headers: authHeaders(idempotencyKey),
    data: {
      amount,
      method: "CARD",
      type: "FINAL",
      referenceNumber: `INV-${runId}`,
      notes: runMarker,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function paymentRowsForOrder(salesOrderId: string) {
  return prisma.salesOrderPayment.findMany({
    where: { salesOrderId },
    orderBy: { createdAt: "asc" },
  });
}

async function allocatePayment(request: APIRequestContext, fixture: Fixture, paymentId: string) {
  const response = await request.patch(`/api/invoices/${fixture.invoiceId}/payments/${paymentId}/allocate`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function expectRejectedWithoutMutation<T>(
  fixture: Fixture,
  action: () => Promise<T>,
  readStatus: (result: T) => number,
) {
  const before = await captureFixtureState(fixture);
  const result = await action();
  expect(readStatus(result)).toBeGreaterThanOrEqual(400);
  expect(await captureFixtureState(fixture)).toEqual(before);
  return result;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanupTaggedFixtures();
});

test.afterAll(async () => {
  await cleanupTaggedFixtures();
  expect(await countTaggedFixtures()).toEqual({
    customers: 0,
    products: 0,
    variants: 0,
    inventoryStock: 0,
    salesOrders: 0,
    salesOrderItems: 0,
    invoices: 0,
    invoiceItems: 0,
    payments: 0,
    returns: 0,
    afterSalesReturns: 0,
    fulfillments: 0,
    fulfillmentItems: 0,
    inventoryMovements: 0,
  });
  await prisma.$disconnect();
});

test("strict payment amount parser accepts only positive currency-precision values", () => {
  const accepted: Array<[unknown, string]> = [
    [1, "1.00"],
    [1.5, "1.50"],
    ["1", "1.00"],
    ["1.5", "1.50"],
    [" 2.25 ", "2.25"],
    [".50", "0.50"],
  ];
  for (const [input, expected] of accepted) {
    expect(parsePositivePaymentAmount(input), `accepted ${String(input)}`).toMatchObject({
      amount: expected,
    });
  }

  const rejected: unknown[] = [
    true,
    false,
    [2],
    [],
    {},
    null,
    undefined,
    "",
    "   ",
    0,
    "0",
    -1,
    "-1",
    Number.NaN,
    "NaN",
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    "Infinity",
    "abc",
    "1.234",
    "1e2",
    "999999999999999999999.00",
    "$1.00",
    "1,000.00",
  ];
  for (const input of rejected) {
    expect(parsePositivePaymentAmount(input), `rejected ${String(input)}`).toBeNull();
  }
});

test("missing or invalid idempotency keys are rejected without financial mutation", async ({ request }) => {
  const orderFixture = await createFixture("ORDER-MISSING-KEY");
  const orderMissing = await expectRejectedWithoutMutation(
    orderFixture,
    () => postOrderPayment(request, orderFixture, 10, null),
    (result) => result.response.status(),
  );
  expect(orderMissing.response.status(), JSON.stringify(orderMissing.body)).toBe(400);
  expect(orderMissing.body.error).toContain("Idempotency key is required");

  const invoiceFixture = await createFixture("INVOICE-MISSING-KEY");
  const invoiceMissing = await expectRejectedWithoutMutation(
    invoiceFixture,
    () => postInvoicePayment(request, invoiceFixture, 10, null),
    (result) => result.response.status(),
  );
  expect(invoiceMissing.response.status(), JSON.stringify(invoiceMissing.body)).toBe(400);
  expect(invoiceMissing.body.error).toContain("Idempotency key is required");

  const orderInvalid = await expectRejectedWithoutMutation(
    orderFixture,
    () => postOrderPayment(request, orderFixture, 10, "   "),
    (result) => result.response.status(),
  );
  expect(orderInvalid.response.status(), JSON.stringify(orderInvalid.body)).toBe(400);
  expect(orderInvalid.body.error).toContain("cannot be empty");

  const invoiceInvalid = await expectRejectedWithoutMutation(
    invoiceFixture,
    () => postInvoicePayment(request, invoiceFixture, 10, "   "),
    (result) => result.response.status(),
  );
  expect(invoiceInvalid.response.status(), JSON.stringify(invoiceInvalid.body)).toBe(400);
  expect(invoiceInvalid.body.error).toContain("cannot be empty");
});

test("sales order payment creation is idempotent for the same key and conflicts on changed payload", async ({
  request,
}) => {
  const fixture = await createFixture("ORDER-IDEMPOTENCY");
  const key = `phase4a3-order-${runId}`;

  const first = await postOrderPayment(request, fixture, "25.00", key);
  expect(first.response.status(), JSON.stringify(first.body)).toBe(201);

  const replay = await postOrderPayment(request, fixture, "25.00", key);
  expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
  expect(replay.body.idempotent).toBe(true);

  const conflict = await postOrderPayment(request, fixture, "30.00", key);
  expect(conflict.response.status(), JSON.stringify(conflict.body)).toBe(409);
  expect(conflict.body.error).toContain("Idempotency key");

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expectMoney(payments[0].amount, 25, "same key creates one order payment");
});

test("concurrent same-key order payment replay creates one payment and counts paid once", async ({ request }) => {
  const fixture = await createFixture("CONCURRENT-SAME-KEY", { total: 100 });
  const key = `phase4a3-concurrent-same-${runId}`;

  const [first, second] = await Promise.all([
    postOrderPayment(request, fixture, "35.00", key),
    postOrderPayment(request, fixture, "35.00", key),
  ]);
  const statuses = [first.response.status(), second.response.status()].sort();
  expect(statuses).toEqual([200, 201]);

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expectMoney(payments[0].amount, 35, "same-key concurrent replay stores one payment");
  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.salesOrderId } });
  expectMoney(order.paidAmount, 35, "same-key concurrent replay counts paid once");
  expectMoney(order.balanceDue, 65, "same-key concurrent replay leaves correct balance");
});

test("same idempotency key conflicts when reused across order or invoice scope", async ({ request }) => {
  const orderA = await createFixture("ORDER-SCOPE-A");
  const orderB = await createFixture("ORDER-SCOPE-B");
  const orderKey = `phase4a3-order-scope-${runId}`;
  const firstOrder = await postOrderPayment(request, orderA, 15, orderKey);
  expect(firstOrder.response.status(), JSON.stringify(firstOrder.body)).toBe(201);

  const beforeOrderB = await captureFixtureState(orderB);
  const crossOrder = await postOrderPayment(request, orderB, 15, orderKey);
  expect(crossOrder.response.status(), JSON.stringify(crossOrder.body)).toBe(409);
  expect(await captureFixtureState(orderB)).toEqual(beforeOrderB);

  const invoiceA = await createFixture("INVOICE-SCOPE-A");
  const invoiceB = await createFixture("INVOICE-SCOPE-B");
  const invoiceKey = `phase4a3-invoice-scope-${runId}`;
  const firstInvoice = await postInvoicePayment(request, invoiceA, 15, invoiceKey);
  expect(firstInvoice.response.status(), JSON.stringify(firstInvoice.body)).toBe(201);

  const beforeInvoiceB = await captureFixtureState(invoiceB);
  const crossInvoice = await postInvoicePayment(request, invoiceB, 15, invoiceKey);
  expect(crossInvoice.response.status(), JSON.stringify(crossInvoice.body)).toBe(409);
  expect(await captureFixtureState(invoiceB)).toEqual(beforeInvoiceB);
});

test("different idempotency keys create legitimate same-amount payments within balance", async ({
  request,
}) => {
  const fixture = await createFixture("DIFFERENT-KEYS");
  const first = await postOrderPayment(request, fixture, 20, `phase4a3-different-a-${runId}`);
  const second = await postOrderPayment(request, fixture, 20, `phase4a3-different-b-${runId}`);
  expect(first.response.status(), JSON.stringify(first.body)).toBe(201);
  expect(second.response.status(), JSON.stringify(second.body)).toBe(201);

  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.salesOrderId } });
  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(2);
  expectMoney(order.paidAmount, 40, "different keys preserve legitimate duplicate amount payments");
  expectMoney(order.balanceDue, 60, "order balance remains authoritative after two payments");

  const invoiceFixture = await createFixture("DIFFERENT-INVOICE-KEYS");
  const invoiceFirst = await postInvoicePayment(request, invoiceFixture, 20, `phase4a3-invoice-different-a-${runId}`);
  const invoiceSecond = await postInvoicePayment(request, invoiceFixture, 20, `phase4a3-invoice-different-b-${runId}`);
  expect(invoiceFirst.response.status(), JSON.stringify(invoiceFirst.body)).toBe(201);
  expect(invoiceSecond.response.status(), JSON.stringify(invoiceSecond.body)).toBe(201);
  const invoicePayments = await prisma.salesOrderPayment.findMany({
    where: { invoiceId: invoiceFixture.invoiceId, status: "POSTED" },
  });
  expect(invoicePayments).toHaveLength(2);
  expectMoney(
    invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    40,
    "invoice accepts legitimate same-amount payments with different keys",
  );
});

test("sales order payment overpayment is rejected without creating a payment", async ({ request }) => {
  const fixture = await createFixture("ORDER-OVERPAYMENT", { total: 100 });

  const result = await expectRejectedWithoutMutation(
    fixture,
    () => postOrderPayment(request, fixture, 120, `phase4a3-overpay-${runId}`),
    (response) => response.response.status(),
  );
  expect(result.response.status(), JSON.stringify(result.body)).toBe(400);
  expect(result.body.error).toContain("order balance");
});

test("exact remaining order payment is accepted and failed overpayment key can retry safely", async ({ request }) => {
  const fixture = await createFixture("ORDER-EXACT-REMAINING", { total: 100 });
  const failedKey = `phase4a3-failed-retry-${runId}`;
  const failed = await expectRejectedWithoutMutation(
    fixture,
    () => postOrderPayment(request, fixture, 120, failedKey),
    (result) => result.response.status(),
  );
  expect(failed.response.status(), JSON.stringify(failed.body)).toBe(400);

  const retry = await postOrderPayment(request, fixture, 100, failedKey);
  expect(retry.response.status(), JSON.stringify(retry.body)).toBe(201);

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expectMoney(payments[0].amount, 100, "exact remaining order payment accepted after failed attempt");
  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.salesOrderId } });
  expectMoney(order.paidAmount, 100, "exact remaining order payment updates paid total");
  expectMoney(order.balanceDue, 0, "exact remaining order payment closes balance");
});

test("invoice payment is idempotent and cannot exceed the linked order remaining balance", async ({
  request,
}) => {
  const fixture = await createFixture("INVOICE-IDEMPOTENCY", { total: 100 });
  const key = `phase4a3-invoice-${runId}`;

  const first = await postInvoicePayment(request, fixture, "45.00", key);
  expect(first.response.status(), JSON.stringify(first.body)).toBe(201);

  const replay = await postInvoicePayment(request, fixture, "45.00", key);
  expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
  expect(replay.body.data.idempotent).toBe(true);

  const conflict = await postInvoicePayment(request, fixture, "46.00", key);
  expect(conflict.response.status(), JSON.stringify(conflict.body)).toBe(409);

  let invoicePayments = await prisma.salesOrderPayment.findMany({
    where: { invoiceId: fixture.invoiceId, status: "POSTED" },
  });
  expect(invoicePayments).toHaveLength(1);
  expectMoney(invoicePayments[0].amount, 45, "same invoice key creates one payment");

  const orderPayment = await postOrderPayment(request, fixture, 50, `phase4a3-invoice-order-cap-${runId}`);
  expect(orderPayment.response.status(), JSON.stringify(orderPayment.body)).toBe(201);

  const overOrderRemaining = await postInvoicePayment(
    request,
    fixture,
    10,
    `phase4a3-invoice-over-order-${runId}`,
  );
  expect(overOrderRemaining.response.status(), JSON.stringify(overOrderRemaining.body)).toBe(400);
  expect(overOrderRemaining.body.error).toContain("invoice or order balance");

  invoicePayments = await prisma.salesOrderPayment.findMany({
    where: { invoiceId: fixture.invoiceId, status: "POSTED" },
  });
  expect(invoicePayments).toHaveLength(1);
});

test("concurrent same-key invoice payment replay creates one payment and counts once", async ({ request }) => {
  const fixture = await createFixture("CONCURRENT-INVOICE-SAME-KEY", { total: 100 });
  const key = `phase4a3-concurrent-invoice-same-${runId}`;

  const [first, second] = await Promise.all([
    postInvoicePayment(request, fixture, 35, key),
    postInvoicePayment(request, fixture, 35, key),
  ]);
  const statuses = [first.response.status(), second.response.status()].sort();
  expect(statuses).toEqual([200, 201]);

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expect(payments[0].invoiceId).toBe(fixture.invoiceId);
  expectMoney(payments[0].amount, 35, "same-key concurrent invoice replay stores one payment");
  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.salesOrderId } });
  expectMoney(order.paidAmount, 35, "same-key concurrent invoice replay counts order paid once");
  const invoicePayments = await prisma.salesOrderPayment.findMany({
    where: { invoiceId: fixture.invoiceId, status: "POSTED" },
  });
  expect(invoicePayments).toHaveLength(1);
});

test("invoice payment rejects invoice or order overpayment and accepts exact safe amount", async ({ request }) => {
  const invoiceCap = await createFixture("INVOICE-CAP", { total: 100 });
  const overInvoice = await expectRejectedWithoutMutation(
    invoiceCap,
    () => postInvoicePayment(request, invoiceCap, 101, `phase4a3-invoice-cap-over-${runId}`),
    (result) => result.response.status(),
  );
  expect(overInvoice.response.status(), JSON.stringify(overInvoice.body)).toBe(400);
  expect(overInvoice.body.error).toContain("invoice or order balance");

  const orderCap = await createFixture("INVOICE-ORDER-CAP", { total: 100 });
  const orderPayment = await postOrderPayment(request, orderCap, 70, `phase4a3-invoice-order-cap2-${runId}`);
  expect(orderPayment.response.status(), JSON.stringify(orderPayment.body)).toBe(201);
  const overOrder = await expectRejectedWithoutMutation(
    orderCap,
    () => postInvoicePayment(request, orderCap, 31, `phase4a3-invoice-over-safe-${runId}`),
    (result) => result.response.status(),
  );
  expect(overOrder.response.status(), JSON.stringify(overOrder.body)).toBe(400);
  expect(overOrder.body.error).toContain("invoice or order balance");

  const exact = await postInvoicePayment(request, orderCap, 30, `phase4a3-invoice-exact-safe-${runId}`);
  expect(exact.response.status(), JSON.stringify(exact.body)).toBe(201);
  const payments = await paymentRowsForOrder(orderCap.salesOrderId);
  expect(payments).toHaveLength(2);
  expectMoney(payments.reduce((sum, payment) => sum + Number(payment.amount), 0), 100, "order total paid after exact safe invoice payment");
  const invoicePayments = payments.filter((payment) => payment.invoiceId === orderCap.invoiceId);
  expect(invoicePayments).toHaveLength(1);
  expectMoney(invoicePayments[0].amount, 30, "exact safe invoice payment accepted");
});

test("concurrent different-key order payments cannot overpay the same order", async ({ request }) => {
  const fixture = await createFixture("CONCURRENT-ORDER", { total: 100 });

  const [first, second] = await Promise.all([
    postOrderPayment(request, fixture, 60, `phase4a3-concurrent-a-${runId}`),
    postOrderPayment(request, fixture, 60, `phase4a3-concurrent-b-${runId}`),
  ]);
  const statuses = [first.response.status(), second.response.status()].sort();
  expect(statuses).toEqual([201, 400]);

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expectMoney(payments[0].amount, 60, "only one concurrent order payment posts");
  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.salesOrderId } });
  expectMoney(order.paidAmount, 60, "concurrent loser did not overpay order");
  expectMoney(order.balanceDue, 40, "order remaining balance is preserved after concurrency test");
});

test("concurrent order and invoice payment race cannot overpay shared sales order authority", async ({ request }) => {
  const fixture = await createFixture("CROSS-AUTHORITY-RACE", { total: 100 });

  const [orderResult, invoiceResult] = await Promise.all([
    postOrderPayment(request, fixture, 70, `phase4a3-cross-order-${runId}`),
    postInvoicePayment(request, fixture, 70, `phase4a3-cross-invoice-${runId}`),
  ]);
  const statuses = [orderResult.response.status(), invoiceResult.response.status()].sort();
  expect(statuses).toEqual([201, 400]);

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expectMoney(payments[0].amount, 70, "cross-authority race posts only one payment");
  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: fixture.salesOrderId } });
  expectMoney(order.paidAmount, 70, "cross-authority race does not exceed order total");
  expectMoney(order.balanceDue, 30, "cross-authority race leaves correct order balance");
  const invoicePaid = await prisma.salesOrderPayment.findMany({
    where: { invoiceId: fixture.invoiceId, status: "POSTED" },
  });
  expect(invoicePaid.length).toBeLessThanOrEqual(1);
  expect(invoicePaid.reduce((sum, payment) => sum + Number(payment.amount), 0)).toBeLessThanOrEqual(100);
});

test("order payment replay remains safe after invoice allocation changes mutable invoiceId", async ({ request }) => {
  const fixture = await createFixture("REPLAY-AFTER-ALLOCATION", { total: 100 });
  const key = `phase4a3-replay-after-allocation-${runId}`;

  const created = await postOrderPayment(request, fixture, 40, key);
  expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
  const payment = await prisma.salesOrderPayment.findFirstOrThrow({
    where: { salesOrderId: fixture.salesOrderId, idempotencyKey: key },
  });
  expect(payment.invoiceId).toBeNull();

  const allocated = await allocatePayment(request, fixture, payment.id);
  expect(allocated.response.status(), JSON.stringify(allocated.body)).toBe(200);
  expect(allocated.body.data.payment.id).toBe(payment.id);
  expect(allocated.body.data.payment.invoiceId).toBe(fixture.invoiceId);

  const beforeReplay = await captureFixtureState(fixture);
  const replay = await postOrderPayment(request, fixture, 40, key);
  expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
  expect(replay.body.idempotent).toBe(true);
  expect(await captureFixtureState(fixture)).toEqual(beforeReplay);

  const payments = await paymentRowsForOrder(fixture.salesOrderId);
  expect(payments).toHaveLength(1);
  expect(payments[0].id).toBe(payment.id);
  expect(payments[0].invoiceId).toBe(fixture.invoiceId);
  const invoicePayments = payments.filter((row) => row.invoiceId === fixture.invoiceId && row.status === "POSTED");
  expect(invoicePayments).toHaveLength(1);
  expectMoney(invoicePayments[0].amount, 40, "allocation replay does not double count invoice paid");
});

test("void keeps payment-row idempotency evidence for normal replay safety", async ({ request }) => {
  const fixture = await createFixture("VOID-KEY");
  const key = `phase4a3-void-${runId}`;
  const first = await postOrderPayment(request, fixture, 30, key);
  expect(first.response.status(), JSON.stringify(first.body)).toBe(201);
  const payment = await prisma.salesOrderPayment.findFirstOrThrow({
    where: { salesOrderId: fixture.salesOrderId, idempotencyKey: key },
  });

  const voidResponse = await request.post(`/api/sales-order-payments/${payment.id}/void`, {
    headers: authHeaders(),
  });
  const voidBody = await voidResponse.json().catch(() => ({}));
  expect(voidResponse.status(), JSON.stringify(voidBody)).toBe(200);

  const voided = await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: payment.id } });
  expect(voided.status).toBe("VOIDED");
  expect(voided.idempotencyKey).toBe(key);
  expect(voided.idempotencyFingerprint).toBeTruthy();

  const replay = await postOrderPayment(request, fixture, 30, key);
  expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
  expect(await paymentRowsForOrder(fixture.salesOrderId)).toHaveLength(1);
});

test("invoice void preserves idempotency evidence and hard delete is not a normal lifecycle operation", async ({
  request,
}) => {
  const fixture = await createFixture("INVOICE-VOID-HARD-DELETE");
  const key = `phase4a3-invoice-void-${runId}`;
  const created = await postInvoicePayment(request, fixture, 25, key);
  expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
  const payment = await prisma.salesOrderPayment.findFirstOrThrow({
    where: { invoiceId: fixture.invoiceId, idempotencyKey: key },
  });

  const beforeHardDelete = await captureFixtureState(fixture);
  const hardDelete = await request.delete(`/api/invoices/${fixture.invoiceId}/payments/${payment.id}?hard=true`, {
    headers: authHeaders(),
  });
  const hardDeleteBody = await hardDelete.json().catch(() => ({}));
  expect(hardDelete.status(), JSON.stringify(hardDeleteBody)).toBe(403);
  expect(hardDeleteBody.error).toContain("Hard delete is disabled");
  expect(await captureFixtureState(fixture)).toEqual(beforeHardDelete);

  const voidResponse = await request.delete(`/api/invoices/${fixture.invoiceId}/payments/${payment.id}`, {
    headers: authHeaders(),
  });
  const voidBody = await voidResponse.json().catch(() => ({}));
  expect(voidResponse.status(), JSON.stringify(voidBody)).toBe(200);

  const voided = await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: payment.id } });
  expect(voided.status).toBe("VOIDED");
  expect(voided.idempotencyKey).toBe(key);
  expect(voided.idempotencyFingerprint).toBeTruthy();

  const beforeReplay = await captureFixtureState(fixture);
  const replay = await postInvoicePayment(request, fixture, 25, key);
  expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
  expect(replay.body.data.idempotent).toBe(true);
  expect(await captureFixtureState(fixture)).toEqual(beforeReplay);
  expect(await paymentRowsForOrder(fixture.salesOrderId)).toHaveLength(1);
});
