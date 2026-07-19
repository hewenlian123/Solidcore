import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parsePositiveQuantity } from "../lib/sales-order-quantity";

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
  if (!rawUrl) throw new Error("DATABASE_URL is required for persistence tests.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error(
      "Refusing to run sales order persistence tests against a non-local, non-test database.",
    );
  }
}

loadLocalEnv();
assertSafeDatabase();

const prisma = new PrismaClient();
const runId = `phase1a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type FixtureVariant = {
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  unit: "PIECE" | "BOX";
  price: number;
};

type FixtureState = {
  customerId: string;
  piece: FixtureVariant;
  flooring: FixtureVariant;
};

let fixture: FixtureState;

function createSessionCookie() {
  const payload = {
    userId: "phase1a-test-admin",
    role: "ADMIN",
    name: "Phase 1A Test Admin",
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
  return `solidcore_session=${encoded}.${signature}`;
}

function authHeaders() {
  return { Cookie: createSessionCookie() };
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function trackedVariantIds() {
  return [fixture?.piece?.variantId, fixture?.flooring?.variantId].filter(
    Boolean,
  ) as string[];
}

function validLine(
  variant: FixtureVariant,
  quantity: unknown,
  overrides: Record<string, unknown> = {},
) {
  return {
    productId: variant.productId,
    variantId: variant.variantId,
    productSku: variant.sku,
    productTitle: variant.title,
    uomSnapshot: variant.unit,
    lineDescription: variant.title,
    quantity,
    unitPrice: variant.price,
    lineDiscount: 0,
    ...overrides,
  };
}

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    customerId: fixture.customerId,
    docType: "SALES_ORDER",
    fulfillmentMethod: "PICKUP",
    taxRate: 0,
    discount: 0,
    items: [validLine(fixture.piece, 1)],
    ...overrides,
  };
}

async function postSalesOrder(
  request: APIRequestContext,
  payload: Record<string, unknown>,
) {
  return request.post("/api/sales-orders", {
    headers: authHeaders(),
    data: payload,
  });
}

async function patchSalesOrderItem(
  request: APIRequestContext,
  orderId: string,
  itemId: string,
  payload: Record<string, unknown>,
) {
  return request.patch(`/api/sales-orders/${orderId}/items/${itemId}`, {
    headers: authHeaders(),
    data: payload,
  });
}

async function createOrder(
  request: APIRequestContext,
  payload: Record<string, unknown>,
) {
  const response = await postSalesOrder(request, payload);
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const id = String(body.data?.id ?? "");
  expect(id).not.toBe("");
  return id;
}

async function findOnlyItem(orderId: string) {
  const item = await prisma.salesOrderItem.findFirst({
    where: { salesOrderId: orderId },
    orderBy: { createdAt: "asc" },
  });
  expect(item).not.toBeNull();
  return item!;
}

async function captureCreatePersistenceState() {
  const variantIds = trackedVariantIds();
  const [orders, items, fulfillments, fulfillmentItems, movements, stocks] =
    await Promise.all([
      prisma.salesOrder.count({ where: { customerId: fixture.customerId } }),
      prisma.salesOrderItem.count({
        where: { variantId: { in: variantIds } },
      }),
      prisma.salesOrderFulfillment.count({
        where: { customerId: fixture.customerId },
      }),
      prisma.salesOrderFulfillmentItem.count({
        where: { variantId: { in: variantIds } },
      }),
      prisma.inventoryMovement.count({
        where: { variantId: { in: variantIds } },
      }),
      prisma.inventoryStock.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, onHand: true, reserved: true },
        orderBy: { variantId: "asc" },
      }),
    ]);

  return {
    orders,
    items,
    fulfillments,
    fulfillmentItems,
    movements,
    stocks: stocks.map((stock) => ({
      variantId: stock.variantId,
      onHand: toNumber(stock.onHand),
      reserved: toNumber(stock.reserved),
    })),
  };
}

async function capturePatchPersistenceState(orderId: string, itemId: string) {
  const variantIds = trackedVariantIds();
  const [order, item, fulfillments, fulfillmentItems, movements, stocks] =
    await Promise.all([
      prisma.salesOrder.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          subtotal: true,
          discount: true,
          tax: true,
          total: true,
          balanceDue: true,
          reservedAppliedAt: true,
          reservedReleasedAt: true,
        },
      }),
      prisma.salesOrderItem.findUnique({
        where: { id: itemId },
        select: {
          quantity: true,
          unitPrice: true,
          lineDiscount: true,
          lineTotal: true,
          fulfillQty: true,
        },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: { salesOrderId: orderId },
        select: { id: true, type: true, status: true },
        orderBy: { id: "asc" },
      }),
      prisma.salesOrderFulfillmentItem.findMany({
        where: { salesOrderItemId: itemId },
        select: {
          id: true,
          fulfillmentId: true,
          variantId: true,
          orderedQty: true,
          fulfilledQty: true,
          unit: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.inventoryMovement.findMany({
        where: { variantId: { in: variantIds } },
        select: {
          variantId: true,
          fulfillmentId: true,
          fulfillmentItemId: true,
          type: true,
          qty: true,
          unit: true,
          note: true,
        },
        orderBy: [{ variantId: "asc" }, { id: "asc" }],
      }),
      prisma.inventoryStock.findMany({
        where: { variantId: { in: variantIds } },
        select: { variantId: true, onHand: true, reserved: true },
        orderBy: { variantId: "asc" },
      }),
    ]);

  return {
    order: order
      ? {
          status: order.status,
          subtotal: toNumber(order.subtotal),
          discount: toNumber(order.discount),
          tax: toNumber(order.tax),
          total: toNumber(order.total),
          balanceDue: toNumber(order.balanceDue),
          reservedApplied: Boolean(order.reservedAppliedAt),
          reservedReleased: Boolean(order.reservedReleasedAt),
        }
      : null,
    item: item
      ? {
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unitPrice),
          lineDiscount: toNumber(item.lineDiscount),
          lineTotal: toNumber(item.lineTotal),
          fulfillQty: toNumber(item.fulfillQty),
        }
      : null,
    fulfillments: fulfillments.map((fulfillment) => ({
      id: fulfillment.id,
      type: fulfillment.type,
      status: fulfillment.status,
    })),
    fulfillmentItems: fulfillmentItems.map((fulfillmentItem) => ({
      id: fulfillmentItem.id,
      fulfillmentId: fulfillmentItem.fulfillmentId,
      variantId: fulfillmentItem.variantId,
      orderedQty: toNumber(fulfillmentItem.orderedQty),
      fulfilledQty: toNumber(fulfillmentItem.fulfilledQty),
      unit: fulfillmentItem.unit,
    })),
    movements: movements.map((movement) => ({
      variantId: movement.variantId,
      fulfillmentId: movement.fulfillmentId,
      fulfillmentItemId: movement.fulfillmentItemId,
      type: movement.type,
      qty: toNumber(movement.qty),
      unit: movement.unit,
      note: movement.note,
    })),
    stocks: stocks.map((stock) => ({
      variantId: stock.variantId,
      onHand: toNumber(stock.onHand),
      reserved: toNumber(stock.reserved),
    })),
  };
}

test.describe.serial("sales order quantity validation and persistence", () => {
  test.beforeAll(async () => {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: `Phase 1A Test Customer ${runId}`,
        phone: "808-555-0111",
        email: `${runId}@example.com`,
        address: "100 Test Counter Way",
      },
    });

    const pieceProduct = await prisma.salesProduct.create({
      data: {
        name: `Phase 1A Piece Product ${runId}`,
        title: "Phase 1A Piece Product",
        defaultDescription: "Phase 1A test piece",
        unit: "PIECE",
        price: 10,
        cost: 4,
        availableStock: 100,
      },
    });
    const pieceVariant = await prisma.productVariant.create({
      data: {
        productId: pieceProduct.id,
        sku: `P1A-PIECE-${runId}`,
        description: "Phase 1A Piece Variant",
        price: 10,
        cost: 4,
      },
    });

    const flooringProduct = await prisma.salesProduct.create({
      data: {
        name: `Phase 1A Flooring Product ${runId}`,
        title: "Phase 1A Flooring Product",
        defaultDescription: "Phase 1A test flooring",
        unit: "PIECE",
        price: 8,
        cost: 3,
        availableStock: 100,
        flooringBoxCoverageSqft: 20,
      },
    });
    const flooringVariant = await prisma.productVariant.create({
      data: {
        productId: flooringProduct.id,
        sku: `P1A-FLOOR-${runId}`,
        description: "Phase 1A Flooring Variant",
        price: 8,
        cost: 3,
      },
    });

    await prisma.inventoryStock.createMany({
      data: [
        { variantId: pieceVariant.id, onHand: 100, reserved: 0 },
        { variantId: flooringVariant.id, onHand: 100, reserved: 0 },
      ],
    });

    fixture = {
      customerId: customer.id,
      piece: {
        productId: pieceProduct.id,
        variantId: pieceVariant.id,
        sku: pieceVariant.sku,
        title: "Phase 1A Piece Variant",
        unit: "PIECE",
        price: 10,
      },
      flooring: {
        productId: flooringProduct.id,
        variantId: flooringVariant.id,
        sku: flooringVariant.sku,
        title: "Phase 1A Flooring Variant",
        unit: "BOX",
        price: 8,
      },
    };
  });

  test.afterAll(async () => {
    const variantIds = trackedVariantIds();
    const productIds = [fixture?.piece?.productId, fixture?.flooring?.productId]
      .filter(Boolean) as string[];

    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    if (fixture?.customerId) {
      await prisma.salesOrder.deleteMany({
        where: { customerId: fixture.customerId },
      });
      await prisma.salesCustomer.deleteMany({
        where: { id: fixture.customerId },
      });
    }
    await prisma.inventoryStock.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.salesProduct.deleteMany({
      where: { id: { in: productIds } },
    });
    await prisma.$disconnect();
  });

  test("parsePositiveQuantity accepts only finite positive numbers and numeric strings", () => {
    const accepted: Array<[string, unknown, number]> = [
      ["1", 1, 1],
      ["1.5", 1.5, 1.5],
      ['"1"', "1", 1],
      ['"1.5"', "1.5", 1.5],
      ['" 2.25 "', " 2.25 ", 2.25],
    ];
    for (const [label, input, expected] of accepted) {
      expect(parsePositiveQuantity(input), label).toBeCloseTo(expected, 8);
    }

    const rejected: Array<[string, unknown]> = [
      ["true", true],
      ["false", false],
      ["[2]", [2]],
      ["[]", []],
      ["{}", {}],
      ["function", () => 2],
      ["symbol", Symbol("2")],
      ["null", null],
      ["undefined", undefined],
      ['""', ""],
      ['"   "', "   "],
      ["0", 0],
      ['"0"', "0"],
      ["-1", -1],
      ['"-1"', "-1"],
      ["NaN", Number.NaN],
      ['"NaN"', "NaN"],
      ["Infinity", Infinity],
      ["-Infinity", -Infinity],
      ['"Infinity"', "Infinity"],
      ['"abc"', "abc"],
    ];
    for (const [label, input] of rejected) {
      expect(parsePositiveQuantity(input), label).toBeNull();
    }
  });

  test("create API rejects invalid quantity payloads without persistence", async ({
    request,
  }) => {
    const invalidCases: Array<{
      label: string;
      payload: Record<string, unknown>;
      expectedError: string;
    }> = [
      {
        label: "missing items",
        payload: (() => {
          const { items: _items, ...payload } = createPayload();
          return payload;
        })(),
        expectedError: "Add at least one line item before saving.",
      },
      {
        label: "empty items",
        payload: createPayload({ items: [] }),
        expectedError: "Add at least one line item before saving.",
      },
      ...[
        ["true", true],
        ["false", false],
        ["[2]", [2]],
        ["[]", []],
        ["{}", {}],
        ["null", null],
        ["missing quantity", undefined],
        ['""', ""],
        ['"   "', "   "],
        ["0", 0],
        ['"0"', "0"],
        ["-1", -1],
        ['"-1"', "-1"],
        ['"NaN"', "NaN"],
        ['"Infinity"', "Infinity"],
        ['"abc"', "abc"],
      ].map(([label, value]) => {
        const line = validLine(fixture.piece, value);
        if (label === "missing quantity") delete line.quantity;
        return {
          label: String(label),
          payload: createPayload({ items: [line] }),
          expectedError: "Each line item quantity must be greater than zero.",
        };
      }),
    ];

    for (const invalidCase of invalidCases) {
      const before = await captureCreatePersistenceState();
      const response = await postSalesOrder(request, invalidCase.payload);
      const body = await response.json();
      expect(response.status(), invalidCase.label).toBe(400);
      expect(body).toMatchObject({ error: invalidCase.expectedError });
      const after = await captureCreatePersistenceState();
      expect(after, invalidCase.label).toEqual(before);
    }
  });

  test("create API accepts positive number and numeric-string quantities", async ({
    request,
  }) => {
    const accepted: Array<[string, unknown, number]> = [
      ["1", 1, 1],
      ["1.5", 1.5, 1.5],
      ['"1"', "1", 1],
      ['"1.5"', "1.5", 1.5],
      ['" 2.25 "', " 2.25 ", 2.25],
    ];

    for (const [label, quantity, expected] of accepted) {
      const orderId = await createOrder(
        request,
        createPayload({
          projectName: `Accepted quantity ${label}`,
          items: [validLine(fixture.piece, quantity)],
        }),
      );
      const item = await findOnlyItem(orderId);
      expect(toNumber(item.quantity), label).toBeCloseTo(expected, 8);
      expect(item.uomSnapshot, label).toBe("PIECE");
    }
  });

  test("invalid item PATCH leaves item, totals, reservation, fulfillment, and movements unchanged", async ({
    request,
  }) => {
    const orderId = await createOrder(
      request,
      createPayload({
        projectName: "Invalid PATCH persistence proof",
        items: [validLine(fixture.piece, 2)],
      }),
    );
    const item = await findOnlyItem(orderId);
    const statusResponse = await request.patch(
      `/api/sales-orders/${orderId}/status`,
      {
        headers: authHeaders(),
        data: { status: "CONFIRMED" },
      },
    );
    const statusBody = await statusResponse.json();
    expect(statusResponse.status(), JSON.stringify(statusBody)).toBe(200);

    const invalidCases: Array<[string, unknown]> = [
      ["true", true],
      ["false", false],
      ["[2]", [2]],
      ["[]", []],
      ["{}", {}],
      ["null", null],
      ['""', ""],
      ['"   "', "   "],
      ["0", 0],
      ['"0"', "0"],
      ["-1", -1],
      ['"-1"', "-1"],
      ['"NaN"', "NaN"],
      ['"Infinity"', "Infinity"],
      ['"abc"', "abc"],
    ];

    for (const [label, quantity] of invalidCases) {
      const before = await capturePatchPersistenceState(orderId, item.id);
      const response = await patchSalesOrderItem(request, orderId, item.id, {
        quantity,
      });
      const body = await response.json();
      expect(response.status(), label).toBe(400);
      expect(body).toMatchObject({ error: "Quantity must be greater than 0." });
      const after = await capturePatchPersistenceState(orderId, item.id);
      expect(after, label).toEqual(before);
    }

    const finalState = await capturePatchPersistenceState(orderId, item.id);
    expect(finalState.item?.quantity).toBe(2);
    expect(finalState.order?.total).toBe(20);
    expect(finalState.stocks.find((stock) => stock.variantId === fixture.piece.variantId)?.reserved).toBe(2);
    expect(finalState.fulfillments).toHaveLength(1);
    expect(finalState.fulfillmentItems).toHaveLength(1);
    expect(finalState.movements).toHaveLength(1);
  });

  test("valid create and PATCH paths preserve decimals, money, delivery, flooring, and UOM behavior", async ({
    request,
  }) => {
    const quoteId = await createOrder(
      request,
      createPayload({
        docType: "QUOTE",
        projectName: "Valid quote decimal",
        items: [validLine(fixture.piece, "1.5")],
      }),
    );
    const quote = await prisma.salesOrder.findUnique({
      where: { id: quoteId },
      include: { items: true },
    });
    expect(quote?.docType).toBe("QUOTE");
    expect(toNumber(quote?.items[0]?.quantity)).toBeCloseTo(1.5, 8);
    expect(quote?.items[0]?.uomSnapshot).toBe("PIECE");

    const salesOrderId = await createOrder(
      request,
      createPayload({
        docType: "SALES_ORDER",
        fulfillmentMethod: "PICKUP",
        projectName: "Valid sales order integer pickup",
        items: [validLine(fixture.piece, 1)],
      }),
    );
    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: { items: true },
    });
    expect(salesOrder?.docType).toBe("SALES_ORDER");
    expect(salesOrder?.fulfillmentMethod).toBe("PICKUP");
    expect(toNumber(salesOrder?.items[0]?.quantity)).toBe(1);

    const patchOrderId = await createOrder(
      request,
      createPayload({
        projectName: "Valid decimal PATCH",
        items: [validLine(fixture.piece, 1)],
      }),
    );
    const patchItem = await findOnlyItem(patchOrderId);
    const patchResponse = await patchSalesOrderItem(
      request,
      patchOrderId,
      patchItem.id,
      { quantity: 2.25 },
    );
    const patchBody = await patchResponse.json();
    expect(patchResponse.status(), JSON.stringify(patchBody)).toBe(200);
    const patchedItem = await prisma.salesOrderItem.findUnique({
      where: { id: patchItem.id },
    });
    expect(toNumber(patchedItem?.quantity)).toBeCloseTo(2.25, 8);
    expect(toNumber(patchedItem?.lineTotal)).toBeCloseTo(22.5, 8);

    const omittedQuantityResponse = await patchSalesOrderItem(
      request,
      patchOrderId,
      patchItem.id,
      { lineDescription: "Quantity omitted but PATCH remains valid" },
    );
    const omittedQuantityBody = await omittedQuantityResponse.json();
    expect(
      omittedQuantityResponse.status(),
      JSON.stringify(omittedQuantityBody),
    ).toBe(200);
    const omittedQuantityItem = await prisma.salesOrderItem.findUnique({
      where: { id: patchItem.id },
    });
    expect(toNumber(omittedQuantityItem?.quantity)).toBeCloseTo(2.25, 8);

    const deliveryOrderId = await createOrder(
      request,
      createPayload({
        docType: "SALES_ORDER",
        fulfillmentMethod: "DELIVERY",
        deliveryAddress1: "200 Delivery Test Ave",
        deliveryCity: "Honolulu",
        deliveryState: "HI",
        deliveryZip: "96813",
        projectName: "Valid delivery money path",
        taxRate: 4.712,
        discount: 1.25,
        shipping: 9.99,
        deliveryFee: 9.99,
        items: [validLine(fixture.piece, 2)],
      }),
    );
    const deliveryOrder = await prisma.salesOrder.findUnique({
      where: { id: deliveryOrderId },
      include: { items: true },
    });
    expect(deliveryOrder?.fulfillmentMethod).toBe("DELIVERY");
    expect(deliveryOrder?.deliveryAddress1).toBe("200 Delivery Test Ave");
    expect(toNumber(deliveryOrder?.subtotal)).toBe(20);
    expect(toNumber(deliveryOrder?.discount)).toBe(1.25);
    expect(toNumber(deliveryOrder?.tax)).toBeCloseTo(0.8835, 4);
    expect(toNumber(deliveryOrder?.total)).toBeCloseTo(19.63, 2);
    expect((deliveryOrder as unknown as Record<string, unknown>)?.deliveryFee).toBeUndefined();

    const flooringOrderId = await createOrder(
      request,
      createPayload({
        projectName: "Valid flooring decimal UOM",
        items: [validLine(fixture.flooring, "1.5")],
      }),
    );
    const flooringItem = await findOnlyItem(flooringOrderId);
    expect(toNumber(flooringItem.quantity)).toBeCloseTo(1.5, 8);
    expect(flooringItem.uomSnapshot).toBe("BOX");
    expect(toNumber(flooringItem.lineTotal)).toBeCloseTo(12, 8);
  });
});
