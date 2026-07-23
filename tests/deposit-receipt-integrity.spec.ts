import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { calculateSalesOrderDepositSummary } from "../lib/deposit-summary";

const MARKER = "SOLIDCORE PHASE4A41 DEPOSIT QA DELETE ME";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for deposit receipt integrity tests.");
  const url = new URL(rawUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55322" || url.pathname !== "/postgres") {
    throw new Error("Refusing to run deposit receipt tests outside 127.0.0.1:55322/postgres.");
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase4a41-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runMarker = `${MARKER} ${runId}`;

type Fixture = {
  customerId: string;
  invoiceId: string;
  salesOrderId: string;
  total: number;
};

function baseUrl() {
  return process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";
}

function createSessionCookie() {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    name: "Phase 4A-4.1 Test Admin",
    role: "ADMIN",
    userId: "phase4a41-test-admin",
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
    headers["Idempotency-Key"] = idempotencyKey ?? `phase4a41-${randomUUID()}`;
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
  const products = await prisma.salesProduct.findMany({
    where: { name: { contains: MARKER } },
    select: { id: true },
  });
  const productIds = products.map((product) => product.id);
  const variants = await prisma.productVariant.findMany({
    where: productIds.length ? { productId: { in: productIds } } : { sku: { contains: MARKER } },
    select: { id: true },
  });
  const variantIds = variants.map((variant) => variant.id);

  return {
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
    customers: customers.length,
    fulfillmentItems: await prisma.salesOrderFulfillmentItem.count({
      where: fulfillmentIds.length ? { fulfillmentId: { in: fulfillmentIds } } : { id: "__none__" },
    }),
    fulfillments: fulfillments.length,
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
    inventoryStock: await prisma.inventoryStock.count({
      where: variantIds.length ? { variantId: { in: variantIds } } : { id: "__none__" },
    }),
    invoiceItems: await prisma.invoiceItem.count({
      where: invoiceIds.length ? { invoiceId: { in: invoiceIds } } : { invoiceId: "__none__" },
    }),
    invoices: invoices.length,
    payments: payments.length,
    products: products.length,
    returns: returns.length,
    salesOrderItems: await prisma.salesOrderItem.count({
      where: orderIds.length ? { salesOrderId: { in: orderIds } } : { salesOrderId: "__none__" },
    }),
    salesOrders: orders.length,
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
    storeCredits: await prisma.storeCredit.count({
      where:
        customerIds.length || returnIds.length
          ? {
              OR: [
                ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
                ...(returnIds.length ? [{ returnId: { in: returnIds } }] : []),
              ],
            }
          : { id: "__none__" },
    }),
    variants: variants.length,
  };
}

async function createFixture(
  label: string,
  overrides: Partial<{ depositRequired: number; invoiceStatus: string; specialOrder: boolean; total: number }> = {},
): Promise<Fixture> {
  const total = overrides.total ?? 100;
  const depositRequired = overrides.depositRequired ?? 100;
  const customer = await prisma.salesCustomer.create({
    data: {
      address: "441 Deposit Receipt Way",
      billingAddress: "441 Deposit Receipt Way",
      email: `${label}-${runId}@example.com`,
      name: `${MARKER} Customer ${label} ${runId}`,
      phone: "808-555-4411",
    },
  });
  const order = await prisma.salesOrder.create({
    data: {
      balanceDue: total,
      commissionAmount: 0,
      commissionRate: 0,
      customerId: customer.id,
      depositRequired,
      discount: 0,
      docType: "SALES_ORDER",
      fulfillmentMethod: "PICKUP",
      notes: runMarker,
      orderNumber: `SO-PH4A41-${label}-${runId}`,
      paidAmount: 0,
      paymentStatus: "unpaid",
      projectName: runMarker,
      specialOrder: overrides.specialOrder ?? false,
      status: "CONFIRMED",
      subtotal: total,
      tax: 0,
      taxRate: 0,
      total,
      items: {
        create: {
          fulfillQty: 0,
          lineDescription: runMarker,
          lineDiscount: 0,
          lineTotal: total,
          notes: runMarker,
          productSku: `PH4A41-${label}`,
          productTitle: "Phase 4A-4.1 Deposit Test Item",
          quantity: 1,
          skuSnapshot: `PH4A41-${label}`,
          titleSnapshot: "Phase 4A-4.1 Deposit Test Item",
          unitPrice: total,
          uomSnapshot: "PIECE",
        },
      },
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      billingAddress: "441 Deposit Receipt Way",
      customerId: customer.id,
      discountAmount: 0,
      invoiceNumber: `INV-PH4A41-${label}-${runId}`,
      notes: runMarker,
      salesOrderId: order.id,
      status: overrides.invoiceStatus ?? "draft",
      subtotal: total,
      taxAmount: 0,
      taxRate: 0,
      total,
      items: {
        create: {
          description: runMarker,
          discount: 0,
          lineTotal: total,
          qty: 1,
          skuSnapshot: `PH4A41-${label}`,
          titleSnapshot: "Phase 4A-4.1 Deposit Test Item",
          unitPrice: total,
          uomSnapshot: "PIECE",
        },
      },
    },
  });
  return { customerId: customer.id, invoiceId: invoice.id, salesOrderId: order.id, total };
}

async function captureState(fixture: Fixture) {
  const [order, invoice, payments, fulfillments, fulfillmentItems, inventoryMovements, storeCredits, storeCreditApplications, returns, afterSalesReturns] =
    await Promise.all([
      prisma.salesOrder.findUniqueOrThrow({
        where: { id: fixture.salesOrderId },
        select: {
          balanceDue: true,
          depositRequired: true,
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
          status: true,
        },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: { salesOrderId: fixture.salesOrderId },
        select: { id: true, status: true },
        orderBy: { id: "asc" },
      }),
      prisma.salesOrderFulfillmentItem.findMany({
        where: { fulfillment: { is: { salesOrderId: fixture.salesOrderId } } },
        select: { fulfilledQty: true, id: true, orderedQty: true },
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
      prisma.storeCredit.findMany({
        where: { customerId: fixture.customerId },
        select: { amount: true, id: true, status: true, usedAmount: true },
        orderBy: { id: "asc" },
      }),
      prisma.storeCreditApplication.findMany({
        where: { invoiceId: fixture.invoiceId },
        select: { amount: true, id: true, paymentId: true },
        orderBy: { id: "asc" },
      }),
      prisma.salesReturn.findMany({
        where: {
          OR: [{ salesOrderId: fixture.salesOrderId }, { sourceInvoiceId: fixture.invoiceId }],
        },
        select: { creditAmount: true, id: true, status: true },
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
        select: { id: true, refundTotal: true, status: true },
        orderBy: { id: "asc" },
      }),
    ]);

  const money = (value: unknown) => Number(value ?? 0).toFixed(2);
  const summary = calculateSalesOrderDepositSummary({
    depositRequired: order.depositRequired,
    payments,
  });

  return {
    afterSalesReturns: afterSalesReturns.map((row) => ({ ...row, refundTotal: money(row.refundTotal) })),
    depositSummary: summary,
    fulfillments,
    fulfillmentItems: fulfillmentItems.map((row) => ({
      ...row,
      fulfilledQty: money(row.fulfilledQty),
      orderedQty: money(row.orderedQty),
    })),
    inventoryMovements: inventoryMovements.map((row) => ({ ...row, qty: money(row.qty) })),
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
    returns: returns.map((row) => ({ ...row, creditAmount: money(row.creditAmount) })),
    storeCreditApplications: storeCreditApplications.map((row) => ({ ...row, amount: money(row.amount) })),
    storeCredits: storeCredits.map((row) => ({
      ...row,
      amount: money(row.amount),
      usedAmount: money(row.usedAmount),
    })),
  };
}

async function postOrderPayment(
  request: APIRequestContext,
  fixture: Fixture,
  args: { amount: unknown; idempotencyKey?: string | null; type?: unknown; withType?: boolean },
) {
  const data: Record<string, unknown> = {
    amount: args.amount,
    method: "CASH",
    notes: runMarker,
    referenceNumber: `ORDER-${runId}`,
  };
  if (args.withType !== false) data.type = args.type ?? "DEPOSIT";
  const response = await request.post(`/api/sales-orders/${fixture.salesOrderId}/payments`, {
    data,
    headers: authHeaders(args.idempotencyKey),
  });
  const body = await response.json().catch(() => ({}));
  return { body, response };
}

async function allocatePayment(request: APIRequestContext, fixture: Fixture, paymentId: string) {
  const response = await request.patch(`/api/invoices/${fixture.invoiceId}/payments/${paymentId}/allocate`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { body, response };
}

async function voidPaymentThroughOrder(request: APIRequestContext, paymentId: string) {
  const response = await request.post(`/api/sales-order-payments/${paymentId}/void`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { body, response };
}

async function voidPaymentThroughInvoice(request: APIRequestContext, fixture: Fixture, paymentId: string) {
  const response = await request.delete(`/api/invoices/${fixture.invoiceId}/payments/${paymentId}`, {
    headers: authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  return { body, response };
}

async function paymentRows(fixture: Fixture) {
  return prisma.salesOrderPayment.findMany({
    where: { salesOrderId: fixture.salesOrderId },
    orderBy: { createdAt: "asc" },
  });
}

async function invoicePaidTotal(fixture: Fixture) {
  const payments = await prisma.salesOrderPayment.findMany({
    where: { invoiceId: fixture.invoiceId, status: "POSTED" },
    select: { amount: true },
  });
  return payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function expectDepositSummary(
  state: Awaited<ReturnType<typeof captureState>>,
  expected: { due: number; received: number; required: number },
) {
  expectMoney(state.depositSummary.depositRequired, expected.required, "deposit required");
  expectMoney(state.depositSummary.depositReceived, expected.received, "deposit received");
  expectMoney(state.depositSummary.depositDue, expected.due, "deposit due");
}

function expectFinancialBasisUnchanged(
  before: Awaited<ReturnType<typeof captureState>>,
  after: Awaited<ReturnType<typeof captureState>>,
) {
  expect(after.order.subtotal).toBe(before.order.subtotal);
  expect(after.order.discount).toBe(before.order.discount);
  expect(after.order.tax).toBe(before.order.tax);
  expect(after.order.total).toBe(before.order.total);
  expect(after.invoice.subtotal).toBe(before.invoice.subtotal);
  expect(after.invoice.discountAmount).toBe(before.invoice.discountAmount);
  expect(after.invoice.taxAmount).toBe(before.invoice.taxAmount);
  expect(after.invoice.total).toBe(before.invoice.total);
  expect(after.fulfillments).toEqual(before.fulfillments);
  expect(after.fulfillmentItems).toEqual(before.fulfillmentItems);
  expect(after.inventoryMovements).toEqual(before.inventoryMovements);
  expect(after.storeCredits).toEqual(before.storeCredits);
  expect(after.storeCreditApplications).toEqual(before.storeCreditApplications);
  expect(after.returns).toEqual(before.returns);
  expect(after.afterSalesReturns).toEqual(before.afterSalesReturns);
}

test.describe.serial("deposit receipt authority and void reconciliation", () => {
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
      inventoryStock: 0,
      invoiceItems: 0,
      invoices: 0,
      payments: 0,
      products: 0,
      returns: 0,
      salesOrderItems: 0,
      salesOrders: 0,
      storeCreditApplications: 0,
      storeCredits: 0,
      variants: 0,
    });
    await prisma.$disconnect();
  });

  test("deposit summary counts only posted DEPOSIT receipts", async ({ request }) => {
    const none = await createFixture("NONE", { depositRequired: 100 });
    let state = await captureState(none);
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });

    const partial = await createFixture("PARTIAL", { depositRequired: 100 });
    const partialResponse = await postOrderPayment(request, partial, { amount: 40, type: "DEPOSIT" });
    expect(partialResponse.response.status(), JSON.stringify(partialResponse.body)).toBe(201);
    state = await captureState(partial);
    expectDepositSummary(state, { due: 60, received: 40, required: 100 });
    expectMoney(state.order.paidAmount, 40, "partial deposit contributes to total paid");

    const finalOnly = await createFixture("FINAL-ONLY", { depositRequired: 100 });
    const finalResponse = await postOrderPayment(request, finalOnly, { amount: 40, type: "FINAL" });
    expect(finalResponse.response.status(), JSON.stringify(finalResponse.body)).toBe(201);
    state = await captureState(finalOnly);
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 40, "final payment contributes only to total paid");

    const mixed = await createFixture("MIXED", { depositRequired: 100, total: 200 });
    expect((await postOrderPayment(request, mixed, { amount: 40, type: "DEPOSIT" })).response.status()).toBe(201);
    expect((await postOrderPayment(request, mixed, { amount: 50, type: "FINAL" })).response.status()).toBe(201);
    state = await captureState(mixed);
    expectDepositSummary(state, { due: 60, received: 40, required: 100 });
    expectMoney(state.order.paidAmount, 90, "mixed payments total paid");

    const above = await createFixture("ABOVE", { depositRequired: 100, total: 200 });
    expect((await postOrderPayment(request, above, { amount: 120, type: "DEPOSIT" })).response.status()).toBe(201);
    state = await captureState(above);
    expectDepositSummary(state, { due: 0, received: 120, required: 100 });
    expectMoney(state.order.paidAmount, 120, "above-required deposit remains total paid");

    const detailResponse = await request.get(`/api/sales-orders/${mixed.salesOrderId}`, { headers: authHeaders(null) });
    const detailBody = await detailResponse.json();
    expect(detailResponse.status(), JSON.stringify(detailBody)).toBe(200);
    expect(detailBody.data.depositSummary).toMatchObject({
      depositDue: "60.00",
      depositReceived: "40.00",
      depositRequired: "100.00",
    });
  });

  test("Collect Deposit creates one unallocated DEPOSIT payment and no invoice mutation", async ({ page }) => {
    const fixture = await createFixture("UI-COLLECT", { depositRequired: 100, specialOrder: true, total: 200 });
    const cookieValue = createSessionCookie().replace(/^solidcore_session=/, "");
    await page.context().addCookies([{ name: "solidcore_session", value: cookieValue, url: baseUrl() }]);
    const requests: Array<{ headers: Record<string, string>; postData: Record<string, unknown> }> = [];
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      if (!request.url().includes(`/api/sales-orders/${fixture.salesOrderId}/payments`)) return;
      requests.push({
        headers: request.headers(),
        postData: (request.postDataJSON() ?? {}) as Record<string, unknown>,
      });
    });

    await page.goto(`/orders/${fixture.salesOrderId}`);
    await expect(page.getByTestId("deposit-summary")).toContainText("Deposit Required");
    await expect(page.getByTestId("deposit-summary")).toContainText("$100.00");
    await page.getByRole("button", { name: "Add Payment" }).click();
    await page.getByRole("button", { name: "Collect Deposit" }).click();
    await expect(page.getByLabel("Payment Type")).toHaveValue("DEPOSIT");
    const amountInput = page.getByPlaceholder("Amount");
    await expect(amountInput).toHaveValue("100.00");
    await amountInput.fill("40");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/api/sales-orders/${fixture.salesOrderId}/payments`),
    );
    await page.getByRole("button", { name: "Save Payment" }).click();
    expect((await saveResponse).status()).toBe(201);
    await expect(page.getByText("Deposit", { exact: true })).toBeVisible();
    await expect(page.getByText("Unallocated", { exact: true })).toBeVisible();

    expect(requests).toHaveLength(1);
    expect(requests[0].headers["idempotency-key"]).toBeTruthy();
    expect(requests[0].postData.type).toBe("DEPOSIT");

    const state = await captureState(fixture);
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({ invoiceId: null, paymentType: "DEPOSIT", status: "POSTED" });
    expectDepositSummary(state, { due: 60, received: 40, required: 100 });
    expectMoney(await invoicePaidTotal(fixture), 0, "collect deposit does not mutate invoice paid");
    expectFinancialBasisUnchanged(
      {
        ...state,
        invoice: { ...state.invoice, status: "draft" },
        order: { ...state.order, balanceDue: "200.00", paidAmount: "0.00", paymentStatus: "unpaid" },
        payments: [],
        depositSummary: {
          allocatedDeposit: "0.00",
          depositDue: "100.00",
          depositReceived: "0.00",
          depositRequired: "100.00",
          unallocatedDeposit: "0.00",
        },
      },
      state,
    );
  });

  test("allocation preserves DEPOSIT identity, same payment id, and creation replay safety", async ({
    request,
  }) => {
    const fixture = await createFixture("ALLOCATE", { depositRequired: 100 });
    const key = `phase4a41-allocate-${runId}`;
    const created = await postOrderPayment(request, fixture, { amount: 40, idempotencyKey: key, type: "DEPOSIT" });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    const payment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { idempotencyKey: key, salesOrderId: fixture.salesOrderId },
    });
    const before = await captureState(fixture);

    const allocated = await allocatePayment(request, fixture, payment.id);
    expect(allocated.response.status(), JSON.stringify(allocated.body)).toBe(200);
    expect(allocated.body.data.payment).toMatchObject({
      id: payment.id,
      invoiceId: fixture.invoiceId,
      paymentType: "DEPOSIT",
    });
    const after = await captureState(fixture);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].id).toBe(payment.id);
    expect(after.payments[0].invoiceId).toBe(fixture.invoiceId);
    expect(after.payments[0].paymentType).toBe("DEPOSIT");
    expectDepositSummary(after, { due: 60, received: 40, required: 100 });
    expectMoney(after.order.paidAmount, toNumber(before.order.paidAmount), "allocation leaves order paid unchanged");
    expectMoney(await invoicePaidTotal(fixture), 40, "allocation increases invoice paid");

    const replay = await postOrderPayment(request, fixture, { amount: 40, idempotencyKey: key, type: "DEPOSIT" });
    expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.idempotent).toBe(true);
    expect(await paymentRows(fixture)).toHaveLength(1);

    const receipt = await request.get(`/api/pdf/payment/${payment.id}`, { headers: authHeaders(null) });
    expect(receipt.status()).toBe(200);
  });

  test("voiding unallocated and allocated deposits reopens deposit due and reconciles invoice/order", async ({
    request,
  }) => {
    const unallocated = await createFixture("VOID-UNALLOCATED", { depositRequired: 100 });
    const unallocatedCreated = await postOrderPayment(request, unallocated, { amount: 40, type: "DEPOSIT" });
    expect(unallocatedCreated.response.status(), JSON.stringify(unallocatedCreated.body)).toBe(201);
    const unallocatedPayment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { salesOrderId: unallocated.salesOrderId },
    });
    const unallocatedVoid = await voidPaymentThroughOrder(request, unallocatedPayment.id);
    expect(unallocatedVoid.response.status(), JSON.stringify(unallocatedVoid.body)).toBe(200);
    let state = await captureState(unallocated);
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].status).toBe("VOIDED");
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 0, "unallocated deposit void reopens order paid");

    const invoiceRoute = await createFixture("VOID-INVOICE-ROUTE", { depositRequired: 100 });
    const invoiceCreated = await postOrderPayment(request, invoiceRoute, { amount: 40, type: "DEPOSIT" });
    expect(invoiceCreated.response.status(), JSON.stringify(invoiceCreated.body)).toBe(201);
    const invoicePayment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { salesOrderId: invoiceRoute.salesOrderId },
    });
    expect((await allocatePayment(request, invoiceRoute, invoicePayment.id)).response.status()).toBe(200);
    const invoiceVoid = await voidPaymentThroughInvoice(request, invoiceRoute, invoicePayment.id);
    expect(invoiceVoid.response.status(), JSON.stringify(invoiceVoid.body)).toBe(200);
    state = await captureState(invoiceRoute);
    expect(state.payments[0].status).toBe("VOIDED");
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 0, "invoice-route void reconciles order paid");
    expectMoney(await invoicePaidTotal(invoiceRoute), 0, "invoice-route void reconciles invoice paid");
    expect(state.invoice.status).toBe("draft");

    const orderRoute = await createFixture("VOID-ORDER-ROUTE", { depositRequired: 100 });
    const orderCreated = await postOrderPayment(request, orderRoute, { amount: 40, type: "DEPOSIT" });
    expect(orderCreated.response.status(), JSON.stringify(orderCreated.body)).toBe(201);
    const orderPayment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { salesOrderId: orderRoute.salesOrderId },
    });
    expect((await allocatePayment(request, orderRoute, orderPayment.id)).response.status()).toBe(200);
    const orderVoid = await voidPaymentThroughOrder(request, orderPayment.id);
    expect(orderVoid.response.status(), JSON.stringify(orderVoid.body)).toBe(200);
    state = await captureState(orderRoute);
    expect(state.payments[0].status).toBe("VOIDED");
    expect(state.payments[0].invoiceId).toBe(orderRoute.invoiceId);
    expect(state.payments[0].paymentType).toBe("DEPOSIT");
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 0, "order-route void reconciles order paid");
    expectMoney(await invoicePaidTotal(orderRoute), 0, "order-route void reconciles invoice paid");
    expect(state.invoice.status).toBe("draft");
  });

  test("repeated and near-concurrent void leaves one VOIDED payment without drift", async ({ request }) => {
    const fixture = await createFixture("CONCURRENT-VOID", { depositRequired: 100 });
    const created = await postOrderPayment(request, fixture, { amount: 40, type: "DEPOSIT" });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    const payment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { salesOrderId: fixture.salesOrderId },
    });
    expect((await allocatePayment(request, fixture, payment.id)).response.status()).toBe(200);

    const [orderVoid, invoiceVoid] = await Promise.all([
      voidPaymentThroughOrder(request, payment.id),
      voidPaymentThroughInvoice(request, fixture, payment.id),
    ]);
    const statuses = [orderVoid.response.status(), invoiceVoid.response.status()].sort();
    expect(statuses.some((status) => status === 200), JSON.stringify([orderVoid.body, invoiceVoid.body])).toBe(true);
    expect(statuses.every((status) => status === 200 || status === 409), JSON.stringify(statuses)).toBe(true);

    const repeated = await voidPaymentThroughOrder(request, payment.id);
    expect(repeated.response.status(), JSON.stringify(repeated.body)).toBe(200);
    const state = await captureState(fixture);
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].id).toBe(payment.id);
    expect(state.payments[0].status).toBe("VOIDED");
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 0, "repeated void leaves order paid at zero");
    expectMoney(await invoicePaidTotal(fixture), 0, "repeated void leaves invoice paid at zero");

    const replay = await postOrderPayment(request, fixture, {
      amount: 40,
      idempotencyKey: payment.idempotencyKey,
      type: "DEPOSIT",
    });
    expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
    expect(await paymentRows(fixture)).toHaveLength(1);
  });

  test("FINAL payment void does not change deposit received or due", async ({ request }) => {
    const fixture = await createFixture("FINAL-VOID", { depositRequired: 100 });
    const created = await postOrderPayment(request, fixture, { amount: 40, type: "FINAL" });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    const payment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { salesOrderId: fixture.salesOrderId },
    });
    let state = await captureState(fixture);
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 40, "final payment is total paid only");

    const voided = await voidPaymentThroughOrder(request, payment.id);
    expect(voided.response.status(), JSON.stringify(voided.body)).toBe(200);
    state = await captureState(fixture);
    expectDepositSummary(state, { due: 100, received: 0, required: 100 });
    expectMoney(state.order.paidAmount, 0, "final void releases total paid only");
  });

  test("missing or invalid payment type rejects with zero financial mutation", async ({ request }) => {
    const missing = await createFixture("MISSING-TYPE", { depositRequired: 100 });
    let before = await captureState(missing);
    const missingResult = await postOrderPayment(request, missing, {
      amount: 25,
      idempotencyKey: `phase4a41-missing-${runId}`,
      withType: false,
    });
    expect(missingResult.response.status(), JSON.stringify(missingResult.body)).toBe(400);
    expect(missingResult.body.error).toContain("Payment type is required");
    expect(await captureState(missing)).toEqual(before);

    const invalid = await createFixture("INVALID-TYPE", { depositRequired: 100 });
    before = await captureState(invalid);
    const refundResult = await postOrderPayment(request, invalid, {
      amount: 25,
      idempotencyKey: `phase4a41-refund-${runId}`,
      type: "REFUND",
    });
    expect(refundResult.response.status(), JSON.stringify(refundResult.body)).toBe(400);
    expect(refundResult.body.error).toContain("dedicated refund workflow");
    expect(await captureState(invalid)).toEqual(before);

    const abcResult = await postOrderPayment(request, invalid, {
      amount: 25,
      idempotencyKey: `phase4a41-invalid-${runId}`,
      type: "abc",
    });
    expect(abcResult.response.status(), JSON.stringify(abcResult.body)).toBe(400);
    expect(abcResult.body.error).toContain("Invalid payment type");
    expect(await captureState(invalid)).toEqual(before);
  });

  test("deposit correction does not mutate discounts tax invoices inventory fulfillments returns or store credit", async ({
    request,
  }) => {
    const fixture = await createFixture("NON-MUTATION", { depositRequired: 100, total: 160 });
    const before = await captureState(fixture);
    const created = await postOrderPayment(request, fixture, { amount: 40, type: "DEPOSIT" });
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    const afterReceipt = await captureState(fixture);
    expectFinancialBasisUnchanged(before, afterReceipt);
    expectMoney(afterReceipt.order.paidAmount, 40, "deposit receipt updates only paid authority");
    expectDepositSummary(afterReceipt, { due: 60, received: 40, required: 100 });

    const payment = await prisma.salesOrderPayment.findFirstOrThrow({
      where: { salesOrderId: fixture.salesOrderId },
    });
    expect((await allocatePayment(request, fixture, payment.id)).response.status()).toBe(200);
    const afterAllocation = await captureState(fixture);
    expectFinancialBasisUnchanged(afterReceipt, afterAllocation);
    expectMoney(await invoicePaidTotal(fixture), 40, "allocation affects invoice paid authority");

    expect((await voidPaymentThroughOrder(request, payment.id)).response.status()).toBe(200);
    const afterVoid = await captureState(fixture);
    expectFinancialBasisUnchanged(afterAllocation, afterVoid);
    expectDepositSummary(afterVoid, { due: 100, received: 0, required: 100 });
    expectMoney(afterVoid.order.paidAmount, 0, "void reopens order paid");
    expectMoney(await invoicePaidTotal(fixture), 0, "void reopens invoice paid");
  });
});
