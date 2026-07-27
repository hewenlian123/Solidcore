import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { calculateSalesOrderDepositSummary } from "../lib/deposit-summary";

const MARKER = "SOLIDCORE V1 REFUND QA DELETE ME";

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
    throw new Error("DATABASE_URL is required for refund integrity tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error(
      "Refusing to run refund integrity tests against a non-local, non-test database.",
    );
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `v1refund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type Fixture = {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
  salesOrderId: string;
  salesOrderNumber: string;
  total: number;
};

function createSessionCookie(role: "ADMIN" | "SALES" = "ADMIN") {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    name:
      role === "ADMIN"
        ? "SolidCore V1 Refund Test Admin"
        : "SolidCore V1 Refund Test Sales",
    role,
    userId:
      role === "ADMIN"
        ? "solidcore-v1-refund-test-admin"
        : "solidcore-v1-refund-test-sales",
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const secret =
    process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders(
  idempotencyKey?: string | null,
  role: "ADMIN" | "SALES" = "ADMIN",
) {
  const headers: Record<string, string> = {
    Cookie: createSessionCookie(role),
    "x-user-role": role,
  };
  if (idempotencyKey !== null) {
    headers["Idempotency-Key"] = idempotencyKey ?? `v1refund-${randomUUID()}`;
  }
  return headers;
}

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
}

function expectMoney(actual: unknown, expected: number, label: string) {
  expect(Number(actual ?? 0), label).toBeCloseTo(expected, 2);
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
    while (end > start && (buffer[end - 1] === 10 || buffer[end - 1] === 13))
      end -= 1;

    const dictionaryStart = source.lastIndexOf("<<", streamIndex);
    const dictionary =
      dictionaryStart >= 0 ? source.slice(dictionaryStart, streamIndex) : "";
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
              { notes: { contains: MARKER } },
            ],
          }
        : { notes: { contains: MARKER } },
    select: { id: true },
  });
  const paymentIds = payments.map((payment) => payment.id);
  const fulfillments = await prisma.salesOrderFulfillment.findMany({
    where: orderIds.length
      ? { salesOrderId: { in: orderIds } }
      : { id: "__none__" },
    select: { id: true },
  });
  const fulfillmentIds = fulfillments.map((fulfillment) => fulfillment.id);
  const returns = await prisma.salesReturn.findMany({
    where:
      orderIds.length || invoiceIds.length
        ? {
            OR: [
              ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
              ...(invoiceIds.length
                ? [{ sourceInvoiceId: { in: invoiceIds } }]
                : []),
            ],
          }
        : { id: "__none__" },
    select: { id: true },
  });
  const returnIds = returns.map((row) => row.id);
  const afterSalesReturns = await prisma.afterSalesReturn.findMany({
    where:
      customerIds.length || orderIds.length || invoiceIds.length
        ? {
            OR: [
              ...(customerIds.length
                ? [{ customerId: { in: customerIds } }]
                : []),
              ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
              ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
            ],
          }
        : { id: "__none__" },
    select: { id: true },
  });
  const afterSalesReturnIds = afterSalesReturns.map((row) => row.id);

  await prisma.afterSalesReturnItem.deleteMany({
    where: afterSalesReturnIds.length
      ? { returnId: { in: afterSalesReturnIds } }
      : { returnId: "__none__" },
  });
  await prisma.afterSalesReturn.deleteMany({
    where: afterSalesReturnIds.length
      ? { id: { in: afterSalesReturnIds } }
      : { id: "__none__" },
  });
  await prisma.salesReturnItem.deleteMany({
    where: returnIds.length
      ? { returnId: { in: returnIds } }
      : { returnId: "__none__" },
  });
  await prisma.salesReturn.deleteMany({
    where: returnIds.length ? { id: { in: returnIds } } : { id: "__none__" },
  });
  await prisma.inventoryMovement.deleteMany({
    where: fulfillmentIds.length
      ? { fulfillmentId: { in: fulfillmentIds } }
      : { fulfillmentId: "__none__" },
  });
  await prisma.salesOrderFulfillmentItem.deleteMany({
    where: fulfillmentIds.length
      ? { fulfillmentId: { in: fulfillmentIds } }
      : { fulfillmentId: "__none__" },
  });
  await prisma.salesOrderFulfillment.deleteMany({
    where: fulfillmentIds.length
      ? { id: { in: fulfillmentIds } }
      : { id: "__none__" },
  });
  await prisma.salesOrderPayment.deleteMany({
    where: paymentIds.length
      ? { id: { in: paymentIds }, paymentType: "REFUND" }
      : { id: "__none__" },
  });
  await prisma.salesOrderPayment.deleteMany({
    where: paymentIds.length ? { id: { in: paymentIds } } : { id: "__none__" },
  });
  await prisma.invoiceItem.deleteMany({
    where: invoiceIds.length
      ? { invoiceId: { in: invoiceIds } }
      : { invoiceId: "__none__" },
  });
  await prisma.invoice.deleteMany({
    where: invoiceIds.length ? { id: { in: invoiceIds } } : { id: "__none__" },
  });
  await prisma.salesOrderItem.deleteMany({
    where: orderIds.length
      ? { salesOrderId: { in: orderIds } }
      : { salesOrderId: "__none__" },
  });
  await prisma.salesOrder.deleteMany({
    where: orderIds.length ? { id: { in: orderIds } } : { id: "__none__" },
  });
  await prisma.customerNote.deleteMany({
    where: customerIds.length
      ? { customerId: { in: customerIds } }
      : { customerId: "__none__" },
  });
  await prisma.salesCustomer.deleteMany({
    where: customerIds.length
      ? { id: { in: customerIds } }
      : { id: "__none__" },
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
              { notes: { contains: MARKER } },
            ],
          }
        : { notes: { contains: MARKER } },
    select: { id: true },
  });
  const fulfillments = await prisma.salesOrderFulfillment.findMany({
    where: orderIds.length
      ? { salesOrderId: { in: orderIds } }
      : { id: "__none__" },
    select: { id: true },
  });
  const fulfillmentIds = fulfillments.map((fulfillment) => fulfillment.id);

  return {
    afterSalesReturns: await prisma.afterSalesReturn.count({
      where:
        customerIds.length || orderIds.length || invoiceIds.length
          ? {
              OR: [
                ...(customerIds.length
                  ? [{ customerId: { in: customerIds } }]
                  : []),
                ...(orderIds.length
                  ? [{ salesOrderId: { in: orderIds } }]
                  : []),
                ...(invoiceIds.length
                  ? [{ invoiceId: { in: invoiceIds } }]
                  : []),
              ],
            }
          : { id: "__none__" },
    }),
    customers: customers.length,
    fulfillmentItems: await prisma.salesOrderFulfillmentItem.count({
      where: fulfillmentIds.length
        ? { fulfillmentId: { in: fulfillmentIds } }
        : { fulfillmentId: "__none__" },
    }),
    fulfillments: fulfillments.length,
    inventoryMovements: await prisma.inventoryMovement.count({
      where: fulfillmentIds.length
        ? { fulfillmentId: { in: fulfillmentIds } }
        : { fulfillmentId: "__none__" },
    }),
    invoiceItems: await prisma.invoiceItem.count({
      where: invoiceIds.length
        ? { invoiceId: { in: invoiceIds } }
        : { invoiceId: "__none__" },
    }),
    invoices: invoices.length,
    payments: payments.length,
    salesOrderItems: await prisma.salesOrderItem.count({
      where: orderIds.length
        ? { salesOrderId: { in: orderIds } }
        : { salesOrderId: "__none__" },
    }),
    salesOrders: orders.length,
    salesReturns: await prisma.salesReturn.count({
      where: orderIds.length
        ? { salesOrderId: { in: orderIds } }
        : { id: "__none__" },
    }),
  };
}

async function createFixture(
  label: string,
  overrides: Partial<{ depositRequired: number; total: number }> = {},
): Promise<Fixture> {
  const total = overrides.total ?? 120;
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${MARKER} Customer ${label} ${runId}`,
      phone: "808-555-5101",
      email: `${label}-${runId}@example.com`,
      address: "5101 Refund Closure Way",
      billingAddress: "5101 Refund Closure Way",
    },
  });
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-V1REF-${label}-${runId}`,
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
      depositRequired: overrides.depositRequired ?? 0,
      commissionRate: 0,
      commissionAmount: 0,
      notes: runMarker,
      items: {
        create: {
          skuSnapshot: `V1REF-${label}`,
          titleSnapshot: "SolidCore V1 Refund Integrity Item",
          uomSnapshot: "PIECE",
          productSku: `V1REF-${label}`,
          productTitle: "SolidCore V1 Refund Integrity Item",
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
      invoiceNumber: `INV-V1REF-${label}-${runId}`,
      salesOrderId: order.id,
      customerId: customer.id,
      status: "draft",
      subtotal: total,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total,
      billingAddress: "5101 Refund Closure Way",
      notes: runMarker,
      items: {
        create: {
          skuSnapshot: `V1REF-${label}`,
          titleSnapshot: "SolidCore V1 Refund Integrity Item",
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
  return {
    customerId: customer.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    salesOrderId: order.id,
    salesOrderNumber: order.orderNumber,
    total,
  };
}

async function captureState(fixture: Fixture) {
  const [
    order,
    invoice,
    payments,
    fulfillments,
    fulfillmentItems,
    movements,
    salesReturns,
    afterSalesReturns,
  ] = await Promise.all([
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
        depositRequired: true,
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
        referenceNumber: true,
        idempotencyKey: true,
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
      where: { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
      select: { id: true, qty: true, type: true },
      orderBy: { id: "asc" },
    }),
    prisma.salesReturn.findMany({
      where: {
        OR: [
          { salesOrderId: fixture.salesOrderId },
          { sourceInvoiceId: fixture.invoiceId },
        ],
      },
      select: { id: true, status: true, refundMethod: true },
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
      select: { id: true, status: true, refundMethod: true, refundTotal: true },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    afterSalesReturns: afterSalesReturns.map((row) => ({
      ...row,
      refundTotal: money(row.refundTotal),
    })),
    fulfillments,
    fulfillmentItems: fulfillmentItems.map((item) => ({
      ...item,
      fulfilledQty: money(item.fulfilledQty),
      orderedQty: money(item.orderedQty),
    })),
    invoice: {
      ...invoice,
      discountAmount: money(invoice.discountAmount),
      subtotal: money(invoice.subtotal),
      taxAmount: money(invoice.taxAmount),
      total: money(invoice.total),
    },
    movements: movements.map((movement) => ({
      ...movement,
      qty: money(movement.qty),
    })),
    order: {
      ...order,
      balanceDue: money(order.balanceDue),
      depositRequired: money(order.depositRequired),
      discount: money(order.discount),
      paidAmount: money(order.paidAmount),
      subtotal: money(order.subtotal),
      tax: money(order.tax),
      total: money(order.total),
    },
    payments: payments.map((payment) => ({
      ...payment,
      amount: money(payment.amount),
    })),
    salesReturns,
  };
}

function unchangedOperationalState(
  state: Awaited<ReturnType<typeof captureState>>,
) {
  return {
    afterSalesReturns: state.afterSalesReturns,
    fulfillments: state.fulfillments,
    fulfillmentItems: state.fulfillmentItems,
    invoiceBasis: {
      discountAmount: state.invoice.discountAmount,
      subtotal: state.invoice.subtotal,
      taxAmount: state.invoice.taxAmount,
      total: state.invoice.total,
    },
    movements: state.movements,
    orderBasis: {
      discount: state.order.discount,
      subtotal: state.order.subtotal,
      tax: state.order.tax,
      total: state.order.total,
    },
    salesReturns: state.salesReturns,
  };
}

function depositSummaryFromState(
  state: Awaited<ReturnType<typeof captureState>>,
) {
  return calculateSalesOrderDepositSummary({
    depositRequired: state.order.depositRequired,
    payments: state.payments,
  });
}

async function paymentByKey(idempotencyKey: string) {
  return prisma.salesOrderPayment.findUniqueOrThrow({
    where: { idempotencyKey },
  });
}

async function postOrderPayment(
  request: APIRequestContext,
  fixture: Fixture,
  args: { amount: number; idempotencyKey?: string; type: "DEPOSIT" | "FINAL" },
) {
  const key = args.idempotencyKey ?? `v1refund-pay-${randomUUID()}`;
  const response = await request.post(
    `/api/sales-orders/${fixture.salesOrderId}/payments`,
    {
      headers: authHeaders(key),
      data: {
        amount: args.amount,
        method: "CASH",
        referenceNumber: `PAY-${key.slice(0, 8)}`,
        notes: runMarker,
        type: args.type,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  return {
    body,
    key,
    payment: response.ok() ? await paymentByKey(key) : null,
    response,
  };
}

async function postInvoicePayment(
  request: APIRequestContext,
  fixture: Fixture,
  args: { amount: number; idempotencyKey?: string; type: "DEPOSIT" | "FINAL" },
) {
  const key = args.idempotencyKey ?? `v1refund-inv-pay-${randomUUID()}`;
  const response = await request.post(
    `/api/invoices/${fixture.invoiceId}/payments`,
    {
      headers: authHeaders(key),
      data: {
        amount: args.amount,
        method: "CARD",
        referenceNumber: `INV-${key.slice(0, 8)}`,
        notes: runMarker,
        type: args.type,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  return {
    body,
    key,
    payment: response.ok() ? await paymentByKey(key) : null,
    response,
  };
}

async function postRefund(
  request: APIRequestContext,
  fixture: Fixture,
  originalPaymentId: string,
  args: {
    amount: number;
    approvedReturnId?: string;
    idempotencyKey?: string;
    method?: string;
    role?: "ADMIN" | "SALES";
  } = { amount: 1 },
) {
  const key = args.idempotencyKey ?? `v1refund-refund-${randomUUID()}`;
  const response = await request.post(
    `/api/sales-orders/${fixture.salesOrderId}/payments/${originalPaymentId}/refunds`,
    {
      headers: authHeaders(key, args.role),
      data: {
        amount: args.amount,
        approvedReturnId: args.approvedReturnId,
        method: args.method ?? "CASH",
        referenceNumber: `REF-${key.slice(0, 8)}`,
        notes: runMarker,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  return {
    body,
    key,
    payment: response.ok() ? await paymentByKey(key) : null,
    response,
  };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanupTaggedFixtures();
});

test.afterAll(async () => {
  await cleanupTaggedFixtures();
  expect(await countTaggedFixtures()).toEqual({
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
  });
  await prisma.$disconnect();
});

test("full refund creates positive REFUND row and restores order balance", async ({
  request,
}) => {
  const fixture = await createFixture("FULL", { total: 100 });
  const original = await postOrderPayment(request, fixture, {
    amount: 100,
    type: "FINAL",
  });
  expect(original.response.status()).toBe(201);
  expect(original.payment).toBeTruthy();

  const beforeRefund = await captureState(fixture);
  const refund = await postRefund(request, fixture, original.payment!.id, {
    amount: 100,
  });
  expect(refund.response.status()).toBe(201);
  expect(refund.payment).toBeTruthy();
  expect(refund.payment!.paymentType).toBe("REFUND");
  expect(refund.payment!.refundOfPaymentId).toBe(original.payment!.id);
  expect(refund.payment!.refundApprovalActor).toContain(
    "SolidCore V1 Refund Test Admin",
  );
  expect(refund.payment!.refundReviewActor).toContain(
    "SolidCore V1 Refund Test Admin",
  );
  expectMoney(
    refund.payment!.commercialReductionSnapshot,
    0,
    "refund preserves commercial reduction snapshot",
  );
  expect(refund.payment!.invoiceId).toBeNull();
  expectMoney(refund.payment!.amount, 100, "refund row stores positive amount");

  const afterRefund = await captureState(fixture);
  expect(unchangedOperationalState(afterRefund)).toEqual(
    unchangedOperationalState(beforeRefund),
  );
  expectMoney(afterRefund.order.paidAmount, 0, "full refund clears order paid");
  expectMoney(
    afterRefund.order.balanceDue,
    100,
    "full refund restores order balance",
  );
  expect(afterRefund.order.paymentStatus).toBe("unpaid");
  expect(
    afterRefund.payments.filter((payment) => payment.paymentType === "REFUND"),
  ).toHaveLength(1);
});

test("Sales may not post a refund without Owner/Manager approval", async ({
  request,
}) => {
  const fixture = await createFixture("SALES-BLOCKED", { total: 60 });
  const original = await postOrderPayment(request, fixture, {
    amount: 60,
    type: "FINAL",
  });
  const before = await captureState(fixture);
  const blocked = await postRefund(request, fixture, original.payment!.id, {
    amount: 10,
    role: "SALES",
  });
  expect(blocked.response.status()).toBe(403);
  expect(String(blocked.body.error)).toContain("Owner/Manager approval");
  expect(await captureState(fixture)).toEqual(before);
});

test("partial and multiple partial refunds reduce paid authority and reject over-refund without mutation", async ({
  request,
}) => {
  const fixture = await createFixture("PARTIALS", { total: 100 });
  const original = await postOrderPayment(request, fixture, {
    amount: 100,
    type: "FINAL",
  });
  expect(original.response.status()).toBe(201);

  const first = await postRefund(request, fixture, original.payment!.id, {
    amount: 30,
  });
  const second = await postRefund(request, fixture, original.payment!.id, {
    amount: 40,
  });
  expect(first.response.status()).toBe(201);
  expect(second.response.status()).toBe(201);

  const beforeRejected = await captureState(fixture);
  const rejected = await postRefund(request, fixture, original.payment!.id, {
    amount: 31,
  });
  expect(rejected.response.status()).toBe(400);
  expect(String(rejected.body.error)).toContain("remaining refundable");
  expect(await captureState(fixture)).toEqual(beforeRejected);

  const final = await postRefund(request, fixture, original.payment!.id, {
    amount: 30,
  });
  expect(final.response.status()).toBe(201);
  const afterFinal = await captureState(fixture);
  expectMoney(
    afterFinal.order.paidAmount,
    0,
    "multiple partial refunds net to zero paid",
  );
  expectMoney(
    afterFinal.order.balanceDue,
    100,
    "multiple partial refunds reopen balance",
  );
  expect(
    afterFinal.payments.filter((payment) => payment.paymentType === "REFUND"),
  ).toHaveLength(3);
});

test("same-key replay is idempotent and changed payload conflicts without duplicate refund", async ({
  request,
}) => {
  const fixture = await createFixture("IDEMPOTENT", { total: 80 });
  const original = await postOrderPayment(request, fixture, {
    amount: 80,
    type: "FINAL",
  });
  expect(original.response.status()).toBe(201);

  const key = `v1refund-same-key-${randomUUID()}`;
  const first = await postRefund(request, fixture, original.payment!.id, {
    amount: 25,
    idempotencyKey: key,
  });
  const replay = await postRefund(request, fixture, original.payment!.id, {
    amount: 25,
    idempotencyKey: key,
  });
  expect(first.response.status()).toBe(201);
  expect(replay.response.status()).toBe(200);
  expect(replay.body.idempotent).toBe(true);
  expect(replay.body.refundId).toBe(first.body.refundId);

  const conflict = await postRefund(request, fixture, original.payment!.id, {
    amount: 30,
    idempotencyKey: key,
  });
  expect(conflict.response.status()).toBe(409);
  const rows = await prisma.salesOrderPayment.findMany({
    where: { salesOrderId: fixture.salesOrderId, paymentType: "REFUND" },
  });
  expect(rows).toHaveLength(1);
  expectMoney(
    rows[0].amount,
    25,
    "same-key conflict does not add second refund",
  );
});

test("concurrent same-key and different-key refunds cannot duplicate or over-refund", async ({
  request,
}) => {
  const sameKeyFixture = await createFixture("CONCURRENT-SAME", { total: 60 });
  const sameOriginal = await postOrderPayment(request, sameKeyFixture, {
    amount: 60,
    type: "FINAL",
  });
  const key = `v1refund-concurrent-same-${randomUUID()}`;
  const sameResults = await Promise.all([
    postRefund(request, sameKeyFixture, sameOriginal.payment!.id, {
      amount: 20,
      idempotencyKey: key,
    }),
    postRefund(request, sameKeyFixture, sameOriginal.payment!.id, {
      amount: 20,
      idempotencyKey: key,
    }),
  ]);
  expect(sameResults.map((result) => result.response.status()).sort()).toEqual([
    200, 201,
  ]);
  const sameRows = await prisma.salesOrderPayment.findMany({
    where: { salesOrderId: sameKeyFixture.salesOrderId, paymentType: "REFUND" },
  });
  expect(sameRows).toHaveLength(1);

  const overFixture = await createFixture("CONCURRENT-DIFFERENT", {
    total: 50,
  });
  const overOriginal = await postOrderPayment(request, overFixture, {
    amount: 50,
    type: "FINAL",
  });
  const overResults = await Promise.all([
    postRefund(request, overFixture, overOriginal.payment!.id, { amount: 40 }),
    postRefund(request, overFixture, overOriginal.payment!.id, { amount: 40 }),
  ]);
  expect(overResults.map((result) => result.response.status()).sort()).toEqual([
    201, 400,
  ]);
  const overRows = await prisma.salesOrderPayment.findMany({
    where: { salesOrderId: overFixture.salesOrderId, paymentType: "REFUND" },
  });
  expect(overRows).toHaveLength(1);
  expectMoney(
    overRows[0].amount,
    40,
    "different-key race creates only the safe refund",
  );
});

test("wrong order, VOIDED original, and refund-of-refund are rejected without mutation", async ({
  request,
}) => {
  const source = await createFixture("WRONG-SOURCE", { total: 40 });
  const target = await createFixture("WRONG-TARGET", { total: 40 });
  const original = await postOrderPayment(request, source, {
    amount: 40,
    type: "FINAL",
  });
  const beforeSource = await captureState(source);
  const beforeTarget = await captureState(target);
  const wrongOrder = await postRefund(request, target, original.payment!.id, {
    amount: 5,
  });
  expect(wrongOrder.response.status()).toBe(400);
  expect(await captureState(source)).toEqual(beforeSource);
  expect(await captureState(target)).toEqual(beforeTarget);

  const voided = await createFixture("VOIDED", { total: 40 });
  const voidedOriginal = await prisma.salesOrderPayment.create({
    data: {
      amount: 20,
      method: "CASH",
      notes: runMarker,
      paymentType: "FINAL",
      referenceNumber: `VOIDED-${runId}`,
      salesOrderId: voided.salesOrderId,
      status: "VOIDED",
    },
  });
  const beforeVoided = await captureState(voided);
  const voidedRefund = await postRefund(request, voided, voidedOriginal.id, {
    amount: 5,
  });
  expect(voidedRefund.response.status()).toBe(400);
  expect(await captureState(voided)).toEqual(beforeVoided);

  const refundOfRefundFixture = await createFixture("REFUND-OF-REFUND", {
    total: 40,
  });
  const paid = await postOrderPayment(request, refundOfRefundFixture, {
    amount: 40,
    type: "FINAL",
  });
  const refund = await postRefund(
    request,
    refundOfRefundFixture,
    paid.payment!.id,
    { amount: 10 },
  );
  expect(refund.response.status()).toBe(201);
  const beforeRefundOfRefund = await captureState(refundOfRefundFixture);
  const rejected = await postRefund(
    request,
    refundOfRefundFixture,
    refund.payment!.id,
    { amount: 5 },
  );
  expect(rejected.response.status()).toBe(400);
  expect(await captureState(refundOfRefundFixture)).toEqual(
    beforeRefundOfRefund,
  );
});

test("allocated and unallocated refunds reconcile the correct authorities", async ({
  request,
}) => {
  const allocated = await createFixture("ALLOCATED", { total: 100 });
  const allocatedPayment = await postInvoicePayment(request, allocated, {
    amount: 100,
    type: "FINAL",
  });
  expect(allocatedPayment.response.status()).toBe(201);
  const allocatedRefund = await postRefund(
    request,
    allocated,
    allocatedPayment.payment!.id,
    { amount: 40 },
  );
  expect(allocatedRefund.response.status()).toBe(201);
  expect(allocatedRefund.payment!.invoiceId).toBe(allocated.invoiceId);

  const allocatedState = await captureState(allocated);
  expectMoney(
    allocatedState.order.paidAmount,
    60,
    "allocated refund lowers order paid",
  );
  expectMoney(
    allocatedState.order.balanceDue,
    40,
    "allocated refund reopens order balance",
  );
  expectMoney(
    (allocatedRefund.body.data?.payments ?? [])[0]?.amount,
    40,
    "API includes refund row amount",
  );
  expect(allocatedState.invoice.status).toBe("partially_paid");

  const unallocated = await createFixture("UNALLOCATED", { total: 100 });
  const beforeInvoice = (await captureState(unallocated)).invoice;
  const unallocatedPayment = await postOrderPayment(request, unallocated, {
    amount: 100,
    type: "FINAL",
  });
  expect(unallocatedPayment.response.status()).toBe(201);
  const unallocatedRefund = await postRefund(
    request,
    unallocated,
    unallocatedPayment.payment!.id,
    { amount: 25 },
  );
  expect(unallocatedRefund.response.status()).toBe(201);
  expect(unallocatedRefund.payment!.invoiceId).toBeNull();

  const unallocatedState = await captureState(unallocated);
  expect(unallocatedState.invoice).toEqual(beforeInvoice);
  expectMoney(
    unallocatedState.order.paidAmount,
    75,
    "unallocated refund lowers order paid only",
  );
  expectMoney(
    unallocatedState.order.balanceDue,
    25,
    "unallocated refund reopens order balance only",
  );
});

test("DEPOSIT refunds reopen deposit due while FINAL refunds do not change deposit received", async ({
  request,
}) => {
  const fixture = await createFixture("DEPOSIT-REOPEN", {
    depositRequired: 50,
    total: 100,
  });
  const deposit = await postOrderPayment(request, fixture, {
    amount: 50,
    type: "DEPOSIT",
  });
  const final = await postOrderPayment(request, fixture, {
    amount: 40,
    type: "FINAL",
  });
  expect(deposit.response.status()).toBe(201);
  expect(final.response.status()).toBe(201);

  const beforeRefund = await captureState(fixture);
  expect(depositSummaryFromState(beforeRefund)).toMatchObject({
    depositDue: "0.00",
    depositReceived: "50.00",
  });

  const finalRefund = await postRefund(request, fixture, final.payment!.id, {
    amount: 10,
  });
  expect(finalRefund.response.status()).toBe(201);
  const afterFinalRefund = await captureState(fixture);
  expect(depositSummaryFromState(afterFinalRefund)).toMatchObject({
    depositDue: "0.00",
    depositReceived: "50.00",
  });

  const depositRefund = await postRefund(
    request,
    fixture,
    deposit.payment!.id,
    { amount: 20 },
  );
  expect(depositRefund.response.status()).toBe(201);
  const afterDepositRefund = await captureState(fixture);
  expect(depositSummaryFromState(afterDepositRefund)).toMatchObject({
    depositDue: "20.00",
    depositReceived: "30.00",
  });
  expectMoney(
    afterDepositRefund.order.paidAmount,
    60,
    "deposit and final refunds both lower paid authority",
  );
  expectMoney(
    afterDepositRefund.order.balanceDue,
    40,
    "deposit refund reopens balance due",
  );
});

test("refund receipt page and PDF show refund authority without writes", async ({
  request,
}) => {
  const fixture = await createFixture("RECEIPT", {
    depositRequired: 50,
    total: 100,
  });
  const original = await postInvoicePayment(request, fixture, {
    amount: 50,
    type: "DEPOSIT",
  });
  const approvedReturn = await prisma.afterSalesReturn.create({
    data: {
      returnNumber: `RET-V1REF-RECEIPT-${runId}`,
      customerId: fixture.customerId,
      salesOrderId: fixture.salesOrderId,
      invoiceId: fixture.invoiceId,
      status: "APPROVED",
      refundMethod: "REFUND_PAYMENT",
      refundTotal: 20,
      notes: runMarker,
    },
  });
  const refund = await postRefund(request, fixture, original.payment!.id, {
    amount: 20,
    approvedReturnId: approvedReturn.id,
  });
  expect(refund.response.status()).toBe(201);
  const refundPaymentId = refund.payment!.id;
  const beforeReads = await captureState(fixture);

  const receipt = await request.get(
    `/sales-orders/${fixture.salesOrderId}/payments/${refundPaymentId}/receipt`,
    { headers: authHeaders(null) },
  );
  expect(receipt.status()).toBe(200);
  const html = await receipt.text();
  expect(html).toContain("Payment Type:");
  expect(html).toContain("Refund");
  expect(html).toContain("Allocation:");
  expect(html).toContain(`Applied to Invoice ${fixture.invoiceNumber}`);
  expect(html).toContain("Refund Authority");
  expect(html).toContain("Refund Receipt");
  expect(html).toContain("Refund Event ID:");
  expect(html).toContain("Original Payment Event ID:");
  expect(html).toContain("Approved Return ID:");
  expect(html).toContain(approvedReturn.id);
  expect(html).toContain("Approval Actor:");
  expect(html).toContain("Accounting Review:");
  expect(html).toContain("Commercial Reduction Source:");
  expect(html).toContain("Refund Method:");
  expect(html).toContain("Resulting Financial Position:");
  expect(html).toContain("Refunded Total:");
  expect(html).toContain("Remaining Refundable:");
  expect(html).toContain("Sales Order #:");
  expect(html).not.toContain("Store Credit");

  const pdf = await request.get(
    `/api/pdf/payment/${refundPaymentId}?download=true`,
    {
      headers: authHeaders(null),
    },
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain(
    `payment-${refundPaymentId.slice(0, 8)}.pdf`,
  );
  const pdfText = extractPdfContentText(Buffer.from(await pdf.body()));
  expect(pdfText).toContain("Payment Type: Refund");
  expect(pdfText).toContain(
    `Allocation: Applied to Invoice ${fixture.invoiceNumber}`,
  );
  expect(pdfText).toContain("REFUND RECEIPT");
  expect(pdfText).toContain("Refund Event ID:");
  expect(pdfText).toContain("Original Payment Event ID:");
  expect(pdfText).toContain("Approved Return ID:");
  expect(pdfText).toContain(approvedReturn.id);
  expect(pdfText).toContain("Approval Actor:");
  expect(pdfText).toContain("Accounting Review:");
  expect(pdfText).toContain("Commercial Reduction Source:");
  expect(pdfText).toContain("Refund Method:");
  expect(pdfText).toContain("Resulting Financial Position:");
  expect(pdfText).toContain("Refunded Total:");
  expect(pdfText).toContain("Remaining Refundable:");
  expect(pdfText).not.toContain("Store Credit");

  const refreshed = await request.get(
    `/sales-orders/${fixture.salesOrderId}/payments/${refundPaymentId}/receipt`,
    { headers: authHeaders(null) },
  );
  expect(refreshed.status()).toBe(200);
  expect(await captureState(fixture)).toEqual(beforeReads);
});

test("Store Credit tables, enum values, and reachable routes are absent without mutation", async ({
  request,
}) => {
  const fixture = await createFixture("NO-STORE-CREDIT", { total: 75 });
  const before = await captureState(fixture);
  const [schema] = await prisma.$queryRaw<
    Array<{
      after_sales_store_credit: number;
      payment_method_store_credit: number;
      store_credit_applications_table: string | null;
      store_credits_table: string | null;
    }>
  >`
    SELECT
      to_regclass('public.store_credits')::text AS store_credits_table,
      to_regclass('public.store_credit_applications')::text AS store_credit_applications_table,
      (
        SELECT COUNT(*)::int
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'SalesPaymentMethod'
          AND enum_value.enumlabel = 'STORE_CREDIT'
      ) AS payment_method_store_credit,
      (
        SELECT COUNT(*)::int
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'AfterSalesRefundMethod'
          AND enum_value.enumlabel = 'STORE_CREDIT'
      ) AS after_sales_store_credit
  `;
  expect(schema).toEqual({
    after_sales_store_credit: 0,
    payment_method_store_credit: 0,
    store_credit_applications_table: null,
    store_credits_table: null,
  });

  const deletedRoutes = await Promise.all([
    request.get("/store-credit", { headers: authHeaders(null) }),
    request.get("/after-sales/store-credit", { headers: authHeaders(null) }),
    request.get(`/api/customers/${fixture.customerId}/store-credits`, {
      headers: authHeaders(null),
    }),
    request.post("/api/store-credits", {
      headers: authHeaders(null),
      data: { amount: 1 },
    }),
    request.post(`/api/invoices/${fixture.invoiceId}/apply-store-credit`, {
      headers: authHeaders(null),
      data: { amount: 1 },
    }),
  ]);
  for (const response of deletedRoutes) {
    expect([404, 405]).toContain(response.status());
  }
  expect(await captureState(fixture)).toEqual(before);
});
