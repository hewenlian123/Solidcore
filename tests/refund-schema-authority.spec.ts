import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const MARKER = "SOLIDCORE PHASE4A5A REFUND SCHEMA QA DELETE ME";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for refund schema authority tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run refund schema tests against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase4a5a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type Fixture = {
  customerId: string;
  invoiceId: string;
  salesOrderId: string;
  total: number;
};

function createSessionCookie() {
  const payload = {
    userId: "phase4a5a-test-admin",
    role: "ADMIN",
    name: "Phase 4A-5A Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders(idempotencyKey = `phase4a5a-${randomUUID()}`) {
  return {
    Cookie: createSessionCookie(),
    "Idempotency-Key": idempotencyKey,
    "x-user-role": "ADMIN",
  };
}

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
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

  await prisma.storeCreditApplication.deleteMany({
    where:
      invoiceIds.length || paymentIds.length
        ? {
            OR: [
              ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
              ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
            ],
          }
        : { id: "__none__" },
  });
  await prisma.salesOrderPayment.deleteMany({
    where: paymentIds.length ? { id: { in: paymentIds }, paymentType: "REFUND" } : { id: "__none__" },
  });
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

async function taggedCounts() {
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
  const fulfillments = await prisma.salesOrderFulfillment.findMany({
    where: orderIds.length ? { salesOrderId: { in: orderIds } } : { id: "__none__" },
    select: { id: true },
  });
  const fulfillmentIds = fulfillments.map((fulfillment) => fulfillment.id);

  return {
    customers: customers.length,
    salesOrders: orders.length,
    salesOrderItems: await prisma.salesOrderItem.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    invoices: invoices.length,
    invoiceItems: await prisma.invoiceItem.count({
      where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
    }),
    payments: payments.length,
    storeCredits: await prisma.storeCredit.count({
      where: customerIds.length ? { customerId: { in: customerIds } } : { id: "__none__" },
    }),
    storeCreditApplications: await prisma.storeCreditApplication.count({
      where:
        invoiceIds.length || paymentIds.length
          ? {
              OR: [
                ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
                ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
              ],
            }
          : { id: "__none__" },
    }),
    salesReturns: await prisma.salesReturn.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { id: "__none__" },
    }),
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
      where: fulfillmentIds.length ? { fulfillmentId: { in: fulfillmentIds } } : { id: "__none__" },
    }),
  };
}

async function createFixture(label: string, total = 120): Promise<Fixture> {
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${MARKER} Customer ${label} ${runId}`,
      phone: "808-555-4505",
      email: `${label}-${runId}@example.com`,
      address: "4505 Refund Authority Way",
      billingAddress: "4505 Refund Authority Way",
    },
  });
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH4A5A-${label}-${runId}`,
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
          skuSnapshot: `PH4A5A-${label}`,
          titleSnapshot: "Phase 4A-5A Refund Schema Test Item",
          uomSnapshot: "PIECE",
          productSku: `PH4A5A-${label}`,
          productTitle: "Phase 4A-5A Refund Schema Test Item",
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
      invoiceNumber: `INV-PH4A5A-${label}-${runId}`,
      salesOrderId: order.id,
      customerId: customer.id,
      status: "draft",
      subtotal: total,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total,
      billingAddress: "4505 Refund Authority Way",
      notes: runMarker,
      items: {
        create: {
          skuSnapshot: `PH4A5A-${label}`,
          titleSnapshot: "Phase 4A-5A Refund Schema Test Item",
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
  return { customerId: customer.id, invoiceId: invoice.id, salesOrderId: order.id, total };
}

async function createPostedPayment(
  fixture: Fixture,
  args: { amount?: number; invoiceId?: string | null; paymentType?: "DEPOSIT" | "FINAL" },
) {
  return prisma.salesOrderPayment.create({
    data: {
      salesOrderId: fixture.salesOrderId,
      invoiceId: args.invoiceId ?? null,
      amount: args.amount ?? 50,
      method: "CASH",
      paymentType: args.paymentType ?? "FINAL",
      status: "POSTED",
      referenceNumber: `PH4A5A-${runId}`,
      notes: runMarker,
    },
  });
}

async function createRefundPayment(fixture: Fixture, originalPaymentId: string, amount: number) {
  return prisma.salesOrderPayment.create({
    data: {
      salesOrderId: fixture.salesOrderId,
      invoiceId: null,
      amount,
      method: "CARD",
      paymentType: "REFUND",
      refundOfPaymentId: originalPaymentId,
      status: "POSTED",
      referenceNumber: `REF-PH4A5A-${runId}`,
      notes: runMarker,
    },
  });
}

async function captureState(fixture: Fixture) {
  const [order, invoice, payments, storeCredits, storeCreditApplications, fulfillments, fulfillmentItems, movements] =
    await Promise.all([
      prisma.salesOrder.findUniqueOrThrow({
        where: { id: fixture.salesOrderId },
        select: {
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
          status: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          total: true,
        },
      }),
      prisma.salesOrderPayment.findMany({
        where: { salesOrderId: fixture.salesOrderId },
        select: {
          id: true,
          invoiceId: true,
          refundOfPaymentId: true,
          amount: true,
          method: true,
          paymentType: true,
          status: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.storeCredit.count({ where: { customerId: fixture.customerId } }),
      prisma.storeCreditApplication.count({ where: { invoiceId: fixture.invoiceId } }),
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
        where: { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
        select: { id: true, qty: true, type: true },
        orderBy: { id: "asc" },
      }),
    ]);

  return {
    order: {
      ...order,
      subtotal: money(order.subtotal),
      discount: money(order.discount),
      tax: money(order.tax),
      total: money(order.total),
      paidAmount: money(order.paidAmount),
      balanceDue: money(order.balanceDue),
    },
    invoice: {
      ...invoice,
      subtotal: money(invoice.subtotal),
      discountAmount: money(invoice.discountAmount),
      taxAmount: money(invoice.taxAmount),
      total: money(invoice.total),
    },
    payments: payments.map((payment) => ({
      ...payment,
      amount: money(payment.amount),
    })),
    storeCredits,
    storeCreditApplications,
    fulfillments,
    fulfillmentItems: fulfillmentItems.map((item) => ({
      ...item,
      orderedQty: money(item.orderedQty),
      fulfilledQty: money(item.fulfilledQty),
    })),
    movements: movements.map((movement) => ({
      ...movement,
      qty: money(movement.qty),
    })),
  };
}

async function postOrderPayment(
  request: APIRequestContext,
  fixture: Fixture,
  type: "DEPOSIT" | "FINAL" | "REFUND",
  amount = 25,
) {
  const response = await request.post(`/api/sales-orders/${fixture.salesOrderId}/payments`, {
    headers: authHeaders(),
    data: {
      amount,
      method: "CASH",
      type,
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
  type: "DEPOSIT" | "FINAL" | "REFUND",
  amount = 30,
) {
  const response = await request.post(`/api/invoices/${fixture.invoiceId}/payments`, {
    headers: authHeaders(),
    data: {
      amount,
      method: "CARD",
      type,
      referenceNumber: `INV-${runId}`,
      notes: runMarker,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function allocatePayment(request: APIRequestContext, fixture: Fixture, paymentId: string) {
  const response = await request.patch(`/api/invoices/${fixture.invoiceId}/payments/${paymentId}/allocate`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanupTaggedFixtures();
});

test.afterAll(async () => {
  await cleanupTaggedFixtures();
  expect(await taggedCounts()).toEqual({
    afterSalesReturns: 0,
    customers: 0,
    fulfillmentItems: 0,
    fulfillments: 0,
    inventoryMovements: 0,
    invoiceItems: 0,
    invoices: 0,
    payments: 0,
    salesOrderItems: 0,
    salesOrders: 0,
    salesReturns: 0,
    storeCreditApplications: 0,
    storeCredits: 0,
  });
  await prisma.$disconnect();
});

test("REFUND requires an original payment relation", async () => {
  const fixture = await createFixture("REFUND-REQUIRES-ORIGINAL");
  const before = await captureState(fixture);

  await expect(
    prisma.salesOrderPayment.create({
      data: {
        salesOrderId: fixture.salesOrderId,
        amount: 10,
        method: "CASH",
        paymentType: "REFUND",
        status: "POSTED",
        referenceNumber: `REF-${runId}`,
        notes: runMarker,
      },
    }),
  ).rejects.toThrow();

  expect(await captureState(fixture)).toEqual(before);
});

test("non-REFUND payments cannot reference an original payment", async () => {
  const fixture = await createFixture("NON-REFUND-NO-ORIGINAL");
  const original = await createPostedPayment(fixture, { amount: 40 });
  const before = await captureState(fixture);

  await expect(
    prisma.salesOrderPayment.create({
      data: {
        salesOrderId: fixture.salesOrderId,
        amount: 5,
        method: "CASH",
        paymentType: "FINAL",
        refundOfPaymentId: original.id,
        status: "POSTED",
        referenceNumber: `FINAL-REF-LINK-${runId}`,
        notes: runMarker,
      },
    }),
  ).rejects.toThrow();

  expect(await captureState(fixture)).toEqual(before);
});

test("a payment cannot refund itself", async () => {
  const fixture = await createFixture("REFUND-NOT-SELF");
  const paymentId = randomUUID();
  const before = await captureState(fixture);

  await expect(
    prisma.salesOrderPayment.create({
      data: {
        id: paymentId,
        salesOrderId: fixture.salesOrderId,
        refundOfPaymentId: paymentId,
        amount: 5,
        method: "CARD",
        paymentType: "REFUND",
        status: "POSTED",
        referenceNumber: `SELF-${runId}`,
        notes: runMarker,
      },
    }),
  ).rejects.toThrow();

  expect(await captureState(fixture)).toEqual(before);
});

test("multiple partial REFUND rows can reference the same original payment", async () => {
  const fixture = await createFixture("MULTIPLE-PARTIAL");
  const original = await createPostedPayment(fixture, { amount: 80, paymentType: "FINAL" });

  const firstRefund = await createRefundPayment(fixture, original.id, 15);
  const secondRefund = await createRefundPayment(fixture, original.id, 20);

  const refunds = await prisma.salesOrderPayment.findMany({
    where: { refundOfPaymentId: original.id, paymentType: "REFUND" },
    orderBy: { amount: "asc" },
    select: { amount: true, refundOfPaymentId: true, paymentType: true },
  });
  expect([firstRefund.id, secondRefund.id].every(Boolean)).toBe(true);
  expect(refunds.map((refund) => money(refund.amount))).toEqual(["15.00", "20.00"]);
  expect(refunds.every((refund) => refund.refundOfPaymentId === original.id)).toBe(true);
});

test("generic sales order payment route rejects REFUND without mutation", async ({ request }) => {
  const fixture = await createFixture("ORDER-ROUTE-REFUND");
  const before = await captureState(fixture);

  const result = await postOrderPayment(request, fixture, "REFUND", 10);
  expect(result.response.status(), JSON.stringify(result.body)).toBe(400);
  expect(result.body.error).toContain("dedicated refund workflow");
  expect(await captureState(fixture)).toEqual(before);
});

test("generic invoice payment route rejects REFUND without mutation", async ({ request }) => {
  const fixture = await createFixture("INVOICE-ROUTE-REFUND");
  const before = await captureState(fixture);

  const result = await postInvoicePayment(request, fixture, "REFUND", 10);
  expect(result.response.status(), JSON.stringify(result.body)).toBe(400);
  expect(result.body.error).toContain("dedicated refund workflow");
  expect(await captureState(fixture)).toEqual(before);
});

test("payment allocation route rejects REFUND rows without mutation", async ({ request }) => {
  const fixture = await createFixture("ALLOCATE-REFUND");
  const original = await createPostedPayment(fixture, { amount: 80, paymentType: "FINAL" });
  const refund = await createRefundPayment(fixture, original.id, 10);
  const before = await captureState(fixture);

  const result = await allocatePayment(request, fixture, refund.id);
  expect(result.response.status(), JSON.stringify(result.body)).toBe(400);
  expect(result.body.error).toContain("dedicated refund workflow");
  expect(await captureState(fixture)).toEqual(before);
  const currentRefund = await prisma.salesOrderPayment.findUniqueOrThrow({
    where: { id: refund.id },
    select: { invoiceId: true, refundOfPaymentId: true },
  });
  expect(currentRefund.invoiceId).toBeNull();
  expect(currentRefund.refundOfPaymentId).toBe(original.id);
});

test("DEPOSIT and FINAL routes remain valid and do not create refund or store-credit rows", async ({
  request,
}) => {
  const fixture = await createFixture("VALID-DEPOSIT-FINAL", 120);

  const orderPayment = await postOrderPayment(request, fixture, "DEPOSIT", 25);
  expect(orderPayment.response.status(), JSON.stringify(orderPayment.body)).toBe(201);

  const invoicePayment = await postInvoicePayment(request, fixture, "FINAL", 30);
  expect(invoicePayment.response.status(), JSON.stringify(invoicePayment.body)).toBe(201);

  const state = await captureState(fixture);
  expect(state.payments).toHaveLength(2);
  expect(state.payments.every((payment) => payment.refundOfPaymentId === null)).toBe(true);
  expect(state.payments.some((payment) => payment.paymentType === "REFUND")).toBe(false);
  expect(state.storeCredits).toBe(0);
  expect(state.storeCreditApplications).toBe(0);
  expect(state.fulfillments).toEqual([]);
  expect(state.fulfillmentItems).toEqual([]);
  expect(state.movements).toEqual([]);
  expect(state.order.total).toBe("120.00");
  expect(state.invoice.total).toBe("120.00");
});
