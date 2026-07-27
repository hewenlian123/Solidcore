import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";

const MARKER = "SOLIDCORE PHASE4A42 RECEIPT QA DELETE ME";

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
    throw new Error("DATABASE_URL is required for receipt semantics tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error(
      "Refusing to run receipt semantics tests against a non-local, non-test database.",
    );
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase4a42-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type Fixture = {
  allocatedDepositPaymentId: string;
  customerId: string;
  finalPaymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  salesOrderId: string;
  salesOrderNumber: string;
  unallocatedDepositPaymentId: string;
  voidedDepositPaymentId: string;
};

function createSessionCookie() {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    name: "Phase 4A-4.2 Test Admin",
    role: "ADMIN",
    userId: "phase4a42-test-admin",
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

function authHeaders(idempotencyKey?: string | null) {
  return {
    Cookie: createSessionCookie(),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    "x-user-role": "ADMIN",
  };
}

function baseUrl() {
  return process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";
}

function money(value: unknown) {
  return Number(value ?? 0).toFixed(2);
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
      : { salesOrderId: "__none__" },
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
  await prisma.invoiceItem.deleteMany({
    where: invoiceIds.length
      ? { invoiceId: { in: invoiceIds } }
      : { invoiceId: "__none__" },
  });
  await prisma.salesOrderPayment.deleteMany({
    where: paymentIds.length ? { id: { in: paymentIds } } : { id: "__none__" },
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
  const paymentIds = payments.map((payment) => payment.id);
  const fulfillments = await prisma.salesOrderFulfillment.findMany({
    where: orderIds.length
      ? { salesOrderId: { in: orderIds } }
      : { salesOrderId: "__none__" },
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
    returns: returns.length,
    salesOrderItems: await prisma.salesOrderItem.count({
      where: orderIds.length
        ? { salesOrderId: { in: orderIds } }
        : { salesOrderId: "__none__" },
    }),
    salesOrders: orders.length,
  };
}

async function createOrderAndInvoice() {
  const customer = await prisma.salesCustomer.create({
    data: {
      address: "442 Receipt Semantics Way",
      billingAddress: "442 Receipt Semantics Way",
      email: `${runId}@example.com`,
      name: `${MARKER} Customer ${runId}`,
      phone: "808-555-4420",
    },
  });
  const orderNumber = `SO-PH4A42-${runId}`;
  const invoiceNumber = `INV-PH4A42-${runId}`;
  const order = await prisma.salesOrder.create({
    data: {
      balanceDue: 500,
      commissionAmount: 0,
      commissionRate: 0,
      customerId: customer.id,
      depositRequired: 100,
      discount: 0,
      docType: "SALES_ORDER",
      fulfillmentMethod: "PICKUP",
      notes: runMarker,
      orderNumber,
      paidAmount: 0,
      paymentStatus: "unpaid",
      projectName: runMarker,
      status: "CONFIRMED",
      subtotal: 500,
      tax: 0,
      taxRate: 0,
      total: 500,
      items: {
        create: {
          fulfillQty: 0,
          lineDescription: runMarker,
          lineDiscount: 0,
          lineTotal: 500,
          notes: runMarker,
          productSku: `PH4A42-${runId}`,
          productTitle: "Phase 4A-4.2 Receipt Test Item",
          quantity: 1,
          skuSnapshot: `PH4A42-${runId}`,
          titleSnapshot: "Phase 4A-4.2 Receipt Test Item",
          unitPrice: 500,
          uomSnapshot: "PIECE",
        },
      },
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      billingAddress: "442 Receipt Semantics Way",
      customerId: customer.id,
      discountAmount: 0,
      invoiceNumber,
      notes: runMarker,
      salesOrderId: order.id,
      status: "draft",
      subtotal: 500,
      taxAmount: 0,
      taxRate: 0,
      total: 500,
      items: {
        create: {
          description: runMarker,
          discount: 0,
          lineTotal: 500,
          qty: 1,
          skuSnapshot: `PH4A42-${runId}`,
          titleSnapshot: "Phase 4A-4.2 Receipt Test Item",
          unitPrice: 500,
          uomSnapshot: "PIECE",
        },
      },
    },
  });
  return {
    customerId: customer.id,
    invoiceId: invoice.id,
    invoiceNumber,
    salesOrderId: order.id,
    salesOrderNumber: orderNumber,
  };
}

async function postOrderPayment(
  request: APIRequestContext,
  fixture: Pick<Fixture, "salesOrderId">,
  args: { amount: number; reference: string; type: "DEPOSIT" | "FINAL" },
) {
  const response = await request.post(
    `/api/sales-orders/${fixture.salesOrderId}/payments`,
    {
      data: {
        amount: args.amount,
        method: "CASH",
        notes: runMarker,
        referenceNumber: args.reference,
        type: args.type,
      },
      headers: authHeaders(`phase4a42-${args.reference}-${randomUUID()}`),
    },
  );
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const payment = await prisma.salesOrderPayment.findFirstOrThrow({
    where: {
      referenceNumber: args.reference,
      salesOrderId: fixture.salesOrderId,
    },
    orderBy: { createdAt: "desc" },
  });
  return payment.id;
}

async function allocatePayment(
  request: APIRequestContext,
  fixture: Fixture,
  paymentId: string,
) {
  const response = await request.patch(
    `/api/invoices/${fixture.invoiceId}/payments/${paymentId}/allocate`,
    {
      headers: authHeaders(),
    },
  );
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function voidPayment(request: APIRequestContext, paymentId: string) {
  const response = await request.post(
    `/api/sales-order-payments/${paymentId}/void`,
    {
      headers: authHeaders(),
    },
  );
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function createFixture(request: APIRequestContext): Promise<Fixture> {
  const base = await createOrderAndInvoice();
  const partialFixture = {
    ...base,
    allocatedDepositPaymentId: "",
    finalPaymentId: "",
    unallocatedDepositPaymentId: "",
    voidedDepositPaymentId: "",
  };
  const unallocatedDepositPaymentId = await postOrderPayment(
    request,
    partialFixture,
    {
      amount: 40,
      reference: `PH4A42-UNALLOC-${runId}`,
      type: "DEPOSIT",
    },
  );
  const allocatedDepositPaymentId = await postOrderPayment(
    request,
    partialFixture,
    {
      amount: 50,
      reference: `PH4A42-ALLOC-${runId}`,
      type: "DEPOSIT",
    },
  );
  const finalPaymentId = await postOrderPayment(request, partialFixture, {
    amount: 60,
    reference: `PH4A42-FINAL-${runId}`,
    type: "FINAL",
  });
  const voidedDepositPaymentId = await postOrderPayment(
    request,
    partialFixture,
    {
      amount: 25,
      reference: `PH4A42-VOID-${runId}`,
      type: "DEPOSIT",
    },
  );
  const fixture = {
    ...base,
    allocatedDepositPaymentId,
    finalPaymentId,
    unallocatedDepositPaymentId,
    voidedDepositPaymentId,
  };
  await allocatePayment(request, fixture, allocatedDepositPaymentId);
  const voidBefore = await capturePaymentIdentity(voidedDepositPaymentId);
  await allocatePayment(request, fixture, voidedDepositPaymentId);
  await voidPayment(request, voidedDepositPaymentId);
  const voidAfter = await capturePaymentIdentity(voidedDepositPaymentId);
  expect(voidAfter).toMatchObject({
    ...voidBefore,
    invoiceId: fixture.invoiceId,
    status: "VOIDED",
  });
  return fixture;
}

async function capturePaymentIdentity(paymentId: string) {
  const payment = await prisma.salesOrderPayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      amount: true,
      id: true,
      idempotencyFingerprint: true,
      idempotencyKey: true,
      invoiceId: true,
      method: true,
      paymentType: true,
      receivedAt: true,
      referenceNumber: true,
      status: true,
    },
  });
  return {
    ...payment,
    amount: money(payment.amount),
    receivedAt: payment.receivedAt.toISOString(),
  };
}

async function captureState(fixture: Fixture) {
  const [
    order,
    invoice,
    payments,
    fulfillments,
    fulfillmentItems,
    inventoryMovements,
    returns,
    afterSalesReturns,
  ] = await Promise.all([
    prisma.salesOrder.findUniqueOrThrow({
      where: { id: fixture.salesOrderId },
      select: {
        balanceDue: true,
        discount: true,
        paidAmount: true,
        paymentStatus: true,
        status: true,
        subtotal: true,
        tax: true,
        total: true,
      },
    }),
    prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoiceId },
      select: {
        discountAmount: true,
        status: true,
        subtotal: true,
        taxAmount: true,
        total: true,
      },
    }),
    prisma.salesOrderPayment.findMany({
      where: { salesOrderId: fixture.salesOrderId },
      orderBy: { createdAt: "asc" },
      select: {
        amount: true,
        id: true,
        idempotencyFingerprint: true,
        idempotencyKey: true,
        invoiceId: true,
        method: true,
        paymentType: true,
        receivedAt: true,
        referenceNumber: true,
        status: true,
      },
    }),
    prisma.salesOrderFulfillment.findMany({
      where: { salesOrderId: fixture.salesOrderId },
      orderBy: { id: "asc" },
      select: { id: true, status: true },
    }),
    prisma.salesOrderFulfillmentItem.findMany({
      where: { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
      orderBy: { id: "asc" },
      select: { fulfilledQty: true, id: true, orderedQty: true },
    }),
    prisma.inventoryMovement.findMany({
      where: {
        OR: [
          { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
          {
            fulfillmentItem: {
              is: {
                fulfillment: { is: { salesOrderId: fixture.salesOrderId } },
              },
            },
          },
        ],
      },
      orderBy: { id: "asc" },
      select: { id: true, qty: true, type: true },
    }),
    prisma.salesReturn.findMany({
      where: {
        OR: [
          { salesOrderId: fixture.salesOrderId },
          { sourceInvoiceId: fixture.invoiceId },
        ],
      },
      orderBy: { id: "asc" },
      select: { id: true, status: true },
    }),
    prisma.afterSalesReturn.findMany({
      where: {
        OR: [
          { customerId: fixture.customerId },
          { salesOrderId: fixture.salesOrderId },
          { invoiceId: fixture.invoiceId },
        ],
      },
      orderBy: { id: "asc" },
      select: { id: true, refundTotal: true, status: true },
    }),
  ]);

  return {
    afterSalesReturns: afterSalesReturns.map((row) => ({
      ...row,
      refundTotal: money(row.refundTotal),
    })),
    fulfillments,
    fulfillmentItems: fulfillmentItems.map((row) => ({
      ...row,
      fulfilledQty: money(row.fulfilledQty),
      orderedQty: money(row.orderedQty),
    })),
    inventoryMovements: inventoryMovements.map((row) => ({
      ...row,
      qty: money(row.qty),
    })),
    invoice: {
      ...invoice,
      discountAmount: money(invoice.discountAmount),
      subtotal: money(invoice.subtotal),
      taxAmount: money(invoice.taxAmount),
      total: money(invoice.total),
    },
    order: {
      ...order,
      balanceDue: money(order.balanceDue),
      discount: money(order.discount),
      paidAmount: money(order.paidAmount),
      subtotal: money(order.subtotal),
      tax: money(order.tax),
      total: money(order.total),
    },
    payments: payments.map((payment) => ({
      ...payment,
      amount: money(payment.amount),
      receivedAt: payment.receivedAt.toISOString(),
    })),
    returns,
  };
}

async function orderApiPayment(
  request: APIRequestContext,
  fixture: Fixture,
  paymentId: string,
) {
  const response = await request.get(
    `/api/sales-orders/${fixture.salesOrderId}`,
    { headers: authHeaders(null) },
  );
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  const payment = body.data?.payments?.find(
    (row: { id: string }) => row.id === paymentId,
  );
  expect(payment).toBeTruthy();
  return payment as {
    amount: string;
    id: string;
    invoiceId: string | null;
    method: string;
    paymentType: string;
    referenceNumber: string | null;
    status: string;
  };
}

async function receiptPageText(
  page: Page,
  fixture: Fixture,
  paymentId: string,
) {
  await page.context().addCookies([
    {
      name: "solidcore_session",
      url: baseUrl(),
      value: createSessionCookie().replace(/^solidcore_session=/, ""),
    },
  ]);
  await page.goto(
    `/sales-orders/${fixture.salesOrderId}/payments/${paymentId}/receipt`,
  );
  const receipt = page.getByTestId("payment-receipt");
  await expect(receipt).toBeVisible({ timeout: 20_000 });
  return receipt.innerText({ timeout: 20_000 });
}

async function paymentPdfText(
  request: APIRequestContext,
  paymentId: string,
  asDownload = false,
) {
  const response = await request.get(
    `/api/pdf/payment/${paymentId}${asDownload ? "?download=true" : ""}`,
    {
      headers: authHeaders(null),
    },
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["content-disposition"]).toContain(
    `payment-${paymentId.slice(0, 8)}.pdf`,
  );
  if (asDownload)
    expect(response.headers()["content-disposition"]).toContain("attachment");
  else expect(response.headers()["content-disposition"]).toContain("inline");
  return extractPdfContentText(Buffer.from(await response.body()));
}

test.describe.serial("payment receipt and PDF semantics", () => {
  let fixture: Fixture;

  test.beforeAll(async ({ request }) => {
    await cleanupTaggedFixtures();
    fixture = await createFixture(request);
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
      returns: 0,
      salesOrderItems: 0,
      salesOrders: 0,
    });
    await prisma.$disconnect();
  });

  test("unallocated DEPOSIT receipt shows Deposit and no invoice number", async ({
    page,
    request,
  }) => {
    const payment = await orderApiPayment(
      request,
      fixture,
      fixture.unallocatedDepositPaymentId,
    );
    expect(payment).toMatchObject({
      invoiceId: null,
      paymentType: "DEPOSIT",
      status: "POSTED",
    });

    const text = await receiptPageText(
      page,
      fixture,
      fixture.unallocatedDepositPaymentId,
    );
    expect(text).toContain("Payment Type: Deposit");
    expect(text).toContain("Allocation: Unallocated");
    expect(text).toContain(`Sales Order #: ${fixture.salesOrderNumber}`);
    expect(text).not.toContain(fixture.invoiceNumber);

    const pdfText = await paymentPdfText(
      request,
      fixture.unallocatedDepositPaymentId,
    );
    expect(pdfText).toContain("Payment Type: Deposit");
    expect(pdfText).toContain("Allocation: Unallocated");
    expect(pdfText).toContain(fixture.salesOrderNumber);
    expect(pdfText).not.toContain(fixture.invoiceNumber);
  });

  test("allocated DEPOSIT receipt preserves identity and shows invoice allocation", async ({
    page,
    request,
  }) => {
    const before = await capturePaymentIdentity(
      fixture.allocatedDepositPaymentId,
    );
    expect(before).toMatchObject({
      amount: "50.00",
      invoiceId: fixture.invoiceId,
      paymentType: "DEPOSIT",
      referenceNumber: `PH4A42-ALLOC-${runId}`,
      status: "POSTED",
    });

    const payment = await orderApiPayment(
      request,
      fixture,
      fixture.allocatedDepositPaymentId,
    );
    expect(payment).toMatchObject({
      invoiceId: fixture.invoiceId,
      paymentType: "DEPOSIT",
      status: "POSTED",
    });

    const text = await receiptPageText(
      page,
      fixture,
      fixture.allocatedDepositPaymentId,
    );
    expect(text).toContain("Payment Type: Deposit");
    expect(text).toContain(
      `Allocation: Applied to Invoice ${fixture.invoiceNumber}`,
    );
    expect(text).toContain(`Payment ID: ${fixture.allocatedDepositPaymentId}`);
    expect(text).toContain(`Invoice ID: ${fixture.invoiceId}`);
    expect(text).toContain(`Invoice #: ${fixture.invoiceNumber}`);
    expect(text).toContain(`Order ID: ${fixture.salesOrderId}`);
    expect(text).toContain(`Sales Order #: ${fixture.salesOrderNumber}`);
    expect(text).toContain("Prior Balance:");
    expect(text).toContain("New Balance:");

    const pdfText = await paymentPdfText(
      request,
      fixture.allocatedDepositPaymentId,
    );
    expect(pdfText).toContain("Payment Type: Deposit");
    expect(pdfText).toContain(
      `Allocation: Applied to Invoice ${fixture.invoiceNumber}`,
    );
    expect(pdfText).toContain(fixture.allocatedDepositPaymentId);
    expect(pdfText).toContain(fixture.invoiceId);
    expect(pdfText).toContain(fixture.salesOrderId);
    expect(pdfText).toContain(fixture.salesOrderNumber);
    expect(pdfText).toContain("Prior Balance");
    expect(pdfText).toContain("New Balance");
    expect(pdfText).toContain("50.00");

    expect(
      await capturePaymentIdentity(fixture.allocatedDepositPaymentId),
    ).toEqual(before);
  });

  test("FINAL Payment and VOIDED Deposit receipts show correct semantics", async ({
    page,
    request,
  }) => {
    const finalText = await receiptPageText(
      page,
      fixture,
      fixture.finalPaymentId,
    );
    expect(finalText).toContain("Payment Type: Final Payment");
    expect(finalText).toContain("Allocation: Unallocated");
    expect(finalText).toContain("Status: Posted");
    expect(finalText).not.toContain(fixture.invoiceNumber);

    const finalPdf = await paymentPdfText(request, fixture.finalPaymentId);
    expect(finalPdf).toContain("Payment Type: Final Payment");
    expect(finalPdf).toContain("Allocation: Unallocated");

    const voidedBefore = await capturePaymentIdentity(
      fixture.voidedDepositPaymentId,
    );
    expect(voidedBefore).toMatchObject({
      invoiceId: fixture.invoiceId,
      paymentType: "DEPOSIT",
      status: "VOIDED",
    });
    const voidedText = await receiptPageText(
      page,
      fixture,
      fixture.voidedDepositPaymentId,
    );
    expect(voidedText).toContain("Payment Type: Deposit");
    expect(voidedText).toContain(
      `Allocation: Applied to Invoice ${fixture.invoiceNumber}`,
    );
    expect(voidedText).toContain("Status: Voided");

    const voidedPdf = await paymentPdfText(
      request,
      fixture.voidedDepositPaymentId,
    );
    expect(voidedPdf).toContain("Payment Type: Deposit");
    expect(voidedPdf).toContain(
      `Allocation: Applied to Invoice ${fixture.invoiceNumber}`,
    );
    expect(voidedPdf).toContain("Status");
    expect(voidedPdf).toContain("Voided");
    expect(
      await capturePaymentIdentity(fixture.voidedDepositPaymentId),
    ).toEqual(voidedBefore);
  });

  test("page, order API, and PDF values agree for one payment", async ({
    page,
    request,
  }) => {
    const apiPayment = await orderApiPayment(
      request,
      fixture,
      fixture.allocatedDepositPaymentId,
    );
    const pageText = await receiptPageText(
      page,
      fixture,
      fixture.allocatedDepositPaymentId,
    );
    const pdfText = await paymentPdfText(
      request,
      fixture.allocatedDepositPaymentId,
    );

    expect(money(apiPayment.amount)).toBe("50.00");
    for (const sourceText of [pageText, pdfText]) {
      expect(sourceText).toContain("50.00");
      expect(sourceText).toContain("Payment Type");
      expect(sourceText).toContain("Deposit");
      expect(sourceText).toContain(fixture.salesOrderNumber);
      expect(sourceText).toContain(fixture.invoiceNumber);
      expect(sourceText).toContain(apiPayment.referenceNumber ?? "");
    }
  });

  test("receipt PDF endpoint returns inline and download PDF responses", async ({
    request,
  }) => {
    await paymentPdfText(request, fixture.allocatedDepositPaymentId, false);
    await paymentPdfText(request, fixture.allocatedDepositPaymentId, true);
  });

  test("receipt page load, refresh, and PDF reads perform no writes", async ({
    page,
    request,
  }) => {
    const before = await captureState(fixture);
    await receiptPageText(page, fixture, fixture.allocatedDepositPaymentId);
    await page.reload();
    await expect(
      page.getByText("Payment Receipt", { exact: true }),
    ).toBeVisible();
    await paymentPdfText(request, fixture.allocatedDepositPaymentId);
    await paymentPdfText(request, fixture.unallocatedDepositPaymentId, true);
    const after = await captureState(fixture);
    expect(after).toEqual(before);
  });
});
