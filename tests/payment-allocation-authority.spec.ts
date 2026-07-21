import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";

const MARKER = "SOLIDCORE PHASE4A2 PAYMENT QA DELETE ME";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for payment allocation tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run payment allocation tests against a non-local, non-test database.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase4a2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type Fixture = {
  customerId: string;
  salesOrderId: string;
  invoiceId: string;
  total: number;
};

function createSessionCookie() {
  const payload = {
    userId: "phase4a2-test-admin",
    role: "ADMIN",
    name: "Phase 4A-2 Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders(idempotencyKey?: string) {
  return {
    Cookie: createSessionCookie(),
    "Idempotency-Key": idempotencyKey ?? `phase4a2-${randomUUID()}`,
    "x-user-role": "ADMIN",
  };
}

function baseUrl() {
  return process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";
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
    where: orderIds.length || invoiceIds.length
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
    where: {
      OR: [
        ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
        ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
      ],
    },
  });
  await prisma.storeCredit.deleteMany({
    where: customerIds.length ? { customerId: { in: customerIds } } : { customerId: "__none__" },
  });
  await prisma.salesReturn.deleteMany({
    where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
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

  return {
    customers: customerIds.length,
    orders: orderIds.length,
    items: await prisma.salesOrderItem.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    invoices: invoiceIds.length,
    invoiceItems: await prisma.invoiceItem.count({
      where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
    }),
    payments: await prisma.salesOrderPayment.count({
      where: orderIds.length || invoiceIds.length
        ? {
            OR: [
              ...(orderIds.length ? [{ salesOrderId: { in: orderIds } }] : []),
              ...(invoiceIds.length ? [{ invoiceId: { in: invoiceIds } }] : []),
            ],
          }
        : { id: "__none__" },
    }),
    storeCreditApplications: await prisma.storeCreditApplication.count({
      where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
    }),
    storeCredits: await prisma.storeCredit.count({
      where: customerIds.length ? { customerId: { in: customerIds } } : { customerId: "__none__" },
    }),
    returns: await prisma.salesReturn.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    fulfillments: await prisma.salesOrderFulfillment.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    movements: await prisma.inventoryMovement.count({ where: { note: { contains: MARKER } } }),
  };
}

async function createFixture(label: string, overrides: Partial<{ total: number; status: string }> = {}): Promise<Fixture> {
  const total = overrides.total ?? 95;
  const subtotal = 100;
  const discount = 10;
  const tax = total - subtotal + discount;
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${MARKER} Customer ${label} ${runId}`,
      phone: "808-555-4202",
      email: `${label}-${runId}@example.com`,
      address: "4202 Payment Allocation Way",
      billingAddress: "4202 Payment Allocation Way",
    },
  });
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH4A2-${label}-${runId}`,
      customerId: customer.id,
      docType: "SALES_ORDER",
      status: "CONFIRMED",
      projectName: runMarker,
      fulfillmentMethod: "PICKUP",
      subtotal,
      discount,
      taxRate: 5,
      tax,
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
          skuSnapshot: `PH4A2-${label}`,
          titleSnapshot: "Phase 4A-2 Allocation Test Item",
          uomSnapshot: "PIECE",
          productSku: `PH4A2-${label}`,
          productTitle: "Phase 4A-2 Allocation Test Item",
          lineDescription: runMarker,
          quantity: 1,
          unitPrice: subtotal,
          lineDiscount: 0,
          lineTotal: subtotal,
          fulfillQty: 0,
          notes: runMarker,
        },
      },
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-PH4A2-${label}-${runId}`,
      salesOrderId: order.id,
      customerId: customer.id,
      status: overrides.status ?? "draft",
      subtotal,
      discountAmount: discount,
      taxRate: 5,
      taxAmount: tax,
      total,
      billingAddress: "4202 Payment Allocation Way",
      notes: runMarker,
      items: {
        create: {
          skuSnapshot: `PH4A2-${label}`,
          titleSnapshot: "Phase 4A-2 Allocation Test Item",
          description: runMarker,
          uomSnapshot: "PIECE",
          unitPrice: subtotal,
          qty: 1,
          discount: 0,
          lineTotal: subtotal,
        },
      },
    },
  });
  return { customerId: customer.id, salesOrderId: order.id, invoiceId: invoice.id, total };
}

async function createPayment(args: {
  salesOrderId: string;
  amount: number;
  invoiceId?: string | null;
  method?: "CASH" | "CHECK" | "CARD" | "BANK" | "OTHER" | "STORE_CREDIT";
  status?: "POSTED" | "VOIDED";
}) {
  return prisma.salesOrderPayment.create({
    data: {
      salesOrderId: args.salesOrderId,
      invoiceId: args.invoiceId ?? null,
      amount: args.amount,
      method: args.method ?? "CASH",
      paymentType: "FINAL",
      status: args.status ?? "POSTED",
      referenceNumber: `PH4A2-${runId}`,
      notes: runMarker,
    },
  });
}

async function postOrderPayment(request: APIRequestContext, fixture: Fixture, amount: number) {
  const response = await request.post(`/api/sales-orders/${fixture.salesOrderId}/payments`, {
    headers: authHeaders(),
    data: {
      amount,
      method: "CASH",
      type: "DEPOSIT",
      referenceNumber: `ORDER-${runId}`,
      notes: runMarker,
    },
  });
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const payment = Array.isArray(body.data?.payments) ? body.data.payments[0] : null;
  expect(payment?.id).toBeTruthy();
  return String(payment.id);
}

async function postInvoicePayment(request: APIRequestContext, fixture: Fixture, amount: number) {
  const response = await request.post(`/api/invoices/${fixture.invoiceId}/payments`, {
    headers: authHeaders(),
    data: {
      amount,
      method: "CARD",
      type: "FINAL",
      referenceNumber: `INV-${runId}`,
      notes: runMarker,
    },
  });
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const payment = await prisma.salesOrderPayment.findFirstOrThrow({
    where: { salesOrderId: fixture.salesOrderId, invoiceId: fixture.invoiceId, amount },
    orderBy: { createdAt: "desc" },
  });
  return payment.id;
}

async function allocate(request: APIRequestContext, fixture: Fixture, paymentId: string) {
  const response = await request.patch(`/api/invoices/${fixture.invoiceId}/payments/${paymentId}/allocate`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function invoiceApi(request: APIRequestContext, invoiceId: string) {
  const response = await request.get(`/api/invoices/${invoiceId}`, { headers: authHeaders() });
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body.data;
}

async function captureFinancialState(fixture: Fixture) {
  const [order, invoice, payments, fulfillments, movements] = await Promise.all([
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
      },
    }),
    prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoiceId },
      select: {
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        total: true,
        status: true,
      },
    }),
    prisma.salesOrderPayment.findMany({
      where: { salesOrderId: fixture.salesOrderId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        status: true,
        method: true,
        paymentType: true,
        referenceNumber: true,
        receivedAt: true,
        createdAt: true,
      },
    }),
    prisma.salesOrderFulfillment.count({ where: { salesOrderId: fixture.salesOrderId } }),
    prisma.inventoryMovement.count({ where: { note: { contains: MARKER } } }),
  ]);
  return {
    order: {
      subtotal: toNumber(order.subtotal),
      discount: toNumber(order.discount),
      tax: toNumber(order.tax),
      total: toNumber(order.total),
      paidAmount: toNumber(order.paidAmount),
      balanceDue: toNumber(order.balanceDue),
      paymentStatus: order.paymentStatus,
    },
    invoice: {
      subtotal: toNumber(invoice.subtotal),
      discountAmount: toNumber(invoice.discountAmount),
      taxAmount: toNumber(invoice.taxAmount),
      total: toNumber(invoice.total),
      status: invoice.status,
    },
    payments: payments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amount: toNumber(payment.amount),
      status: payment.status,
      method: payment.method,
      paymentType: payment.paymentType,
      referenceNumber: payment.referenceNumber,
      receivedAt: payment.receivedAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
    })),
    fulfillments,
    movements,
  };
}

async function capturePaymentIdentity(paymentId: string) {
  const payment = await prisma.salesOrderPayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      id: true,
      salesOrderId: true,
      invoiceId: true,
      amount: true,
      method: true,
      paymentType: true,
      status: true,
      referenceNumber: true,
      receivedAt: true,
      createdAt: true,
    },
  });
  return {
    id: payment.id,
    salesOrderId: payment.salesOrderId,
    invoiceId: payment.invoiceId,
    amount: toNumber(payment.amount),
    method: payment.method,
    paymentType: payment.paymentType,
    status: payment.status,
    referenceNumber: payment.referenceNumber,
    receivedAt: payment.receivedAt.toISOString(),
    createdAt: payment.createdAt.toISOString(),
  };
}

test.describe.serial("canonical payment allocation authority", () => {
  test.beforeAll(async () => {
    await cleanupTaggedFixtures();
  });

  test.afterAll(async () => {
    await cleanupTaggedFixtures();
    expect(await taggedCounts()).toEqual({
      customers: 0,
      orders: 0,
      items: 0,
      invoices: 0,
      invoiceItems: 0,
      payments: 0,
      storeCreditApplications: 0,
      storeCredits: 0,
      returns: 0,
      fulfillments: 0,
      movements: 0,
    });
    await prisma.$disconnect();
  });

  test("order-level payment remains unallocated and does not reduce invoice paid or balance", async ({
    request,
  }) => {
    const fixture = await createFixture("UNALLOCATED", { total: 95 });
    const before = await captureFinancialState(fixture);
    const paymentId = await postOrderPayment(request, fixture, 25);

    const payment = await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.invoiceId).toBeNull();

    const detail = await invoiceApi(request, fixture.invoiceId);
    expectMoney(detail.paidTotal, 0, "invoice allocated paid total");
    expectMoney(detail.balanceDue, 95, "invoice balance ignores unallocated order payment");
    expectMoney(detail.unallocatedPaymentTotal, 25, "invoice exposes unallocated order payment separately");
    expect(detail.payments).toHaveLength(0);
    expect(detail.unallocatedPayments).toHaveLength(1);

    const invoiceList = await request.get(`/api/invoices?salesOrderId=${fixture.salesOrderId}`, {
      headers: authHeaders(),
    });
    const invoiceListBody = await invoiceList.json();
    expect(invoiceList.status(), JSON.stringify(invoiceListBody)).toBe(200);
    expectMoney(invoiceListBody.data[0].paidTotal, 0, "invoice list paid total");
    expectMoney(invoiceListBody.data[0].balanceDue, 95, "invoice list balance");

    const customerInvoices = await request.get(`/api/customers/${fixture.customerId}/invoices`, {
      headers: authHeaders(),
    });
    const customerBody = await customerInvoices.json();
    expect(customerInvoices.status(), JSON.stringify(customerBody)).toBe(200);
    expectMoney(customerBody.data[0].paidTotal, 0, "customer invoice paid total");
    expectMoney(customerBody.data[0].balance, 95, "customer invoice balance");

    const after = await captureFinancialState(fixture);
    expect(after.invoice.subtotal).toBe(before.invoice.subtotal);
    expect(after.invoice.discountAmount).toBe(before.invoice.discountAmount);
    expect(after.invoice.taxAmount).toBe(before.invoice.taxAmount);
    expect(after.invoice.total).toBe(before.invoice.total);
    expect(after.order.paidAmount).toBe(25);
    expect(after.order.balanceDue).toBe(70);
    expect(after.fulfillments).toBe(before.fulfillments);
    expect(after.movements).toBe(before.movements);

    const pdfResponse = await request.get(`/api/pdf/invoice/${fixture.invoiceId}`, { headers: authHeaders() });
    expect(pdfResponse.status()).toBe(200);
    const pdfText = extractPdfContentText(Buffer.from(await pdfResponse.body()));
    expect(pdfText).toContain("95.00");
  });

  test("explicit allocation preserves the payment id and creates no second receipt", async ({ request }) => {
    const fixture = await createFixture("ALLOCATE", { total: 100 });
    const paymentId = await postOrderPayment(request, fixture, 40);
    const before = await captureFinancialState(fixture);
    const paymentBefore = await capturePaymentIdentity(paymentId);
    expect(before.payments).toHaveLength(1);
    expect(before.payments[0].invoiceId).toBeNull();
    expect(before.payments[0].id).toBe(paymentId);
    expectMoney(before.payments[0].amount, 40, "unallocated payment amount before allocation");
    expectMoney(before.order.paidAmount, 40, "sales order paid before allocation");
    expectMoney(before.order.balanceDue, 60, "sales order balance before allocation");

    let detail = await invoiceApi(request, fixture.invoiceId);
    expectMoney(detail.paidTotal, 0, "invoice paid before allocation");
    expectMoney(detail.balanceDue, 100, "invoice balance before allocation");
    expectMoney(detail.unallocatedPaymentTotal, 40, "unallocated total before allocation");
    expect(detail.payments).toHaveLength(0);
    expect(detail.unallocatedPayments).toHaveLength(1);

    const receiptBefore = await request.get(`/api/pdf/payment/${paymentId}`, { headers: authHeaders() });
    expect(receiptBefore.status()).toBe(200);

    const allocated = await allocate(request, fixture, paymentId);
    expect(allocated.response.status(), JSON.stringify(allocated.body)).toBe(200);
    expect(allocated.body.data.payment.id).toBe(paymentId);
    expect(allocated.body.data.payment.invoiceId).toBe(fixture.invoiceId);
    expect(allocated.body.data.idempotent).toBe(false);

    const after = await captureFinancialState(fixture);
    const paymentAfter = await capturePaymentIdentity(paymentId);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].id).toBe(paymentId);
    expect(after.payments[0].invoiceId).toBe(fixture.invoiceId);
    expect(paymentAfter).toEqual({ ...paymentBefore, invoiceId: fixture.invoiceId });
    expectMoney(after.order.paidAmount, before.order.paidAmount, "sales order paid unchanged by allocation");
    expectMoney(after.order.balanceDue, before.order.balanceDue, "sales order balance unchanged by allocation");
    expect(after.invoice.subtotal).toBe(before.invoice.subtotal);
    expect(after.invoice.discountAmount).toBe(before.invoice.discountAmount);
    expect(after.invoice.taxAmount).toBe(before.invoice.taxAmount);
    expect(after.invoice.total).toBe(before.invoice.total);
    expect(after.fulfillments).toBe(before.fulfillments);
    expect(after.movements).toBe(before.movements);

    detail = await invoiceApi(request, fixture.invoiceId);
    expectMoney(detail.paidTotal, 40, "invoice paid after allocation");
    expectMoney(detail.balanceDue, 60, "invoice balance after allocation");
    expectMoney(detail.unallocatedPaymentTotal, 0, "unallocated total after allocation");
    expect(detail.payments).toHaveLength(1);
    expect(detail.unallocatedPayments).toHaveLength(0);

    const receiptAfter = await request.get(`/api/pdf/payment/${paymentId}`, { headers: authHeaders() });
    expect(receiptAfter.status()).toBe(200);

    const repeated = await allocate(request, fixture, paymentId);
    expect(repeated.response.status(), JSON.stringify(repeated.body)).toBe(200);
    expect(repeated.body.data.idempotent).toBe(true);
    expect(await captureFinancialState(fixture)).toEqual(after);
    expect(await capturePaymentIdentity(paymentId)).toEqual(paymentAfter);
  });

  test("repeated and concurrent same-payment allocation is idempotent", async ({ request }) => {
    const fixture = await createFixture("IDEMPOTENT", { total: 80 });
    const paymentId = await postOrderPayment(request, fixture, 30);
    const before = await captureFinancialState(fixture);
    expectMoney(before.order.paidAmount, 30, "sales order paid before concurrent allocation");
    expectMoney(before.order.balanceDue, 50, "sales order balance before concurrent allocation");

    const concurrent = await Promise.all([
      allocate(request, fixture, paymentId),
      allocate(request, fixture, paymentId),
    ]);
    for (const result of concurrent) {
      expect(result.response.status(), JSON.stringify(result.body)).toBe(200);
      expect(result.body.data.payment.id).toBe(paymentId);
    }
    const repeated = await allocate(request, fixture, paymentId);
    expect(repeated.response.status(), JSON.stringify(repeated.body)).toBe(200);
    expect(repeated.body.data.idempotent).toBe(true);

    const state = await captureFinancialState(fixture);
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].invoiceId).toBe(fixture.invoiceId);
    expectMoney(state.order.paidAmount, before.order.paidAmount, "order paid unchanged after repeated allocation");
    expectMoney(state.order.balanceDue, before.order.balanceDue, "order balance unchanged after repeated allocation");
    const detail = await invoiceApi(request, fixture.invoiceId);
    expectMoney(detail.paidTotal, 30, "invoice paid after repeated allocation");
    expectMoney(detail.balanceDue, 50, "invoice balance after repeated allocation");
  });

  test("wrong order, void invoice, over-balance, and already-allocated payments are rejected without mutation", async ({
    request,
  }) => {
    const wrongTarget = await createFixture("WRONG-TARGET", { total: 100 });
    const wrongSource = await createFixture("WRONG-SOURCE", { total: 100 });
    const wrongPayment = await createPayment({ salesOrderId: wrongSource.salesOrderId, amount: 10 });
    const wrongBefore = await captureFinancialState(wrongTarget);
    const wrongResult = await allocate(request, wrongTarget, wrongPayment.id);
    expect(wrongResult.response.status(), JSON.stringify(wrongResult.body)).toBe(400);
    expect(wrongResult.body.error).toContain("different sales order");
    expect((await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: wrongPayment.id } })).invoiceId).toBeNull();
    expect(await captureFinancialState(wrongTarget)).toEqual(wrongBefore);

    const voided = await createFixture("VOIDED", { total: 100, status: "void" });
    const voidPayment = await createPayment({ salesOrderId: voided.salesOrderId, amount: 10 });
    const voidBefore = await captureFinancialState(voided);
    const voidResult = await allocate(request, voided, voidPayment.id);
    expect(voidResult.response.status(), JSON.stringify(voidResult.body)).toBe(400);
    expect(voidResult.body.error).toContain("void invoice");
    expect((await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: voidPayment.id } })).invoiceId).toBeNull();
    expect(await captureFinancialState(voided)).toEqual(voidBefore);

    const over = await createFixture("OVER", { total: 50 });
    const overPayment = await createPayment({ salesOrderId: over.salesOrderId, amount: 60 });
    const overBefore = await captureFinancialState(over);
    const overResult = await allocate(request, over, overPayment.id);
    expect(overResult.response.status(), JSON.stringify(overResult.body)).toBe(400);
    expect(overResult.body.error).toContain("exceeds current invoice balance");
    expect((await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: overPayment.id } })).invoiceId).toBeNull();
    expect(await captureFinancialState(over)).toEqual(overBefore);

    const currentTarget = await createFixture("ALLOCATED-TARGET", { total: 100 });
    const otherInvoice = await createFixture("ALLOCATED-OTHER", { total: 100 });
    const allocatedPayment = await createPayment({
      salesOrderId: otherInvoice.salesOrderId,
      invoiceId: otherInvoice.invoiceId,
      amount: 10,
    });
    const allocatedBefore = await captureFinancialState(currentTarget);
    const allocatedResult = await allocate(request, currentTarget, allocatedPayment.id);
    expect(allocatedResult.response.status(), JSON.stringify(allocatedResult.body)).toBe(409);
    expect(allocatedResult.body.error).toContain("already allocated");
    expect((await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: allocatedPayment.id } })).invoiceId).toBe(
      otherInvoice.invoiceId,
    );
    expect(await captureFinancialState(currentTarget)).toEqual(allocatedBefore);
  });

  test("invoice payments, store credit, and voided payment semantics remain allocated-only", async ({
    request,
  }) => {
    const fixture = await createFixture("STORE-CREDIT", { total: 100 });
    await createPayment({ salesOrderId: fixture.salesOrderId, amount: 10 });
    const invoicePaymentId = await postInvoicePayment(request, fixture, 30);

    const salesReturn = await prisma.salesReturn.create({
      data: {
        salesOrderId: fixture.salesOrderId,
        sourceInvoiceId: fixture.invoiceId,
        status: "COMPLETED",
        issueStoreCredit: true,
        creditAmount: 20,
        reason: runMarker,
      },
    });
    await prisma.storeCredit.create({
      data: {
        customerId: fixture.customerId,
        returnId: salesReturn.id,
        amount: 20,
        usedAmount: 0,
        status: "OPEN",
        notes: runMarker,
      },
    });
    const creditResponse = await request.post(`/api/invoices/${fixture.invoiceId}/apply-store-credit`, {
      headers: authHeaders(),
      data: { amount: 20 },
    });
    const creditBody = await creditResponse.json();
    expect(creditResponse.status(), JSON.stringify(creditBody)).toBe(201);

    let detail = await invoiceApi(request, fixture.invoiceId);
    expectMoney(detail.paidTotal, 50, "invoice paid after direct payment and store credit");
    expectMoney(detail.balanceDue, 50, "invoice balance after direct payment and store credit");
    expectMoney(detail.unallocatedPaymentTotal, 10, "unallocated order payment remains separate");
    expect(detail.payments).toHaveLength(2);
    expect(detail.storeCreditApplications).toHaveLength(1);

    const deleteResponse = await request.delete(
      `/api/invoices/${fixture.invoiceId}/payments/${invoicePaymentId}`,
      { headers: authHeaders() },
    );
    const deleteBody = await deleteResponse.json();
    expect(deleteResponse.status(), JSON.stringify(deleteBody)).toBe(200);

    detail = await invoiceApi(request, fixture.invoiceId);
    expectMoney(detail.paidTotal, 20, "voided direct invoice payment removed from invoice paid");
    expectMoney(detail.balanceDue, 80, "invoice balance ignores unallocated fallback after void");
    expectMoney(detail.unallocatedPaymentTotal, 10, "unallocated order payment still separate after void");
    expect(detail.payments.filter((payment: { status: string }) => payment.status === "POSTED")).toHaveLength(1);
  });

  test("invoice page visibly separates unallocated order payment and applies it from the existing receipt", async ({
    page,
  }) => {
    const fixture = await createFixture("UI", { total: 100 });
    const payment = await createPayment({ salesOrderId: fixture.salesOrderId, amount: 25 });
    const cookieValue = createSessionCookie().replace(/^solidcore_session=/, "");
    await page.context().addCookies([{ name: "solidcore_session", value: cookieValue, url: baseUrl() }]);

    await page.goto(`/invoices/${fixture.invoiceId}`);
    await expect(page.getByRole("heading", { name: "Allocated Invoice Payments" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("No payments are allocated to this invoice yet.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unallocated Order Payments" })).toBeVisible();
    await expect(page.getByText("Available: $25.00")).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply to Invoice" })).toBeVisible();

    await page.getByRole("button", { name: "Apply to Invoice" }).click();
    await expect(page.getByText("No unallocated order payments are available for this invoice.")).toBeVisible();
    await expect(page.getByText("Available: $0.00")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Payment" })).toBeVisible();

    const persisted = await prisma.salesOrderPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(persisted.invoiceId).toBe(fixture.invoiceId);
  });
});
