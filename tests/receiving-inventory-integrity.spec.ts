import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createSessionToken, getSessionCookieName } from "../lib/auth-session";

const prisma = new PrismaClient();
const RUN_ID = `ux6-receiving-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MARKER = "SOLIDCORE UX6 RECEIVING QA DELETE ME";

type Role = "ADMIN" | "WAREHOUSE";
type Fixture = {
  purchaseOrderId: string;
  purchaseOrderItemId: string;
  productId: string;
  variantId: string;
};

const supplierIds = new Set<string>();
const purchaseOrderIds = new Set<string>();
const productIds = new Set<string>();
const variantIds = new Set<string>();

function assertSafeDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl)
    throw new Error("DATABASE_URL is required for receiving integrity tests.");
  const url = new URL(rawUrl);
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55322" ||
    url.pathname !== "/postgres"
  ) {
    throw new Error(
      "Refusing to run receiving integrity tests outside 127.0.0.1:55322/postgres.",
    );
  }
}

assertSafeDatabase();

function sessionToken(role: Role) {
  return createSessionToken({
    userId: `ux6-${role.toLowerCase()}-${RUN_ID}`,
    role,
    name: role === "ADMIN" ? "SolidCore Owner Manager" : "SolidCore Receiver",
  });
}

function authHeaders(role: Role) {
  return {
    Cookie: `${getSessionCookieName()}=${sessionToken(role)}`,
    "x-user-role": role,
  };
}

async function installSession(page: Page, role: Role) {
  await page.context().addCookies([
    {
      name: getSessionCookieName(),
      value: sessionToken(role),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}

async function createSupplier() {
  const supplier = await prisma.supplier.create({
    data: {
      name: `${MARKER} Supplier ${RUN_ID}`,
      contactName: "Receiving QA",
      phone: "808-555-6000",
      category: "Building Materials",
    },
  });
  supplierIds.add(supplier.id);
  return supplier.id;
}

async function createFixture(
  supplierId: string,
  label: string,
  expectedQty = 10,
  stock = { onHand: 10, reserved: 2, hold: 1, incoming: 10, inTransit: 0 },
): Promise<Fixture> {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${MARKER} ${label} ${RUN_ID}`,
      title: `${label} receiving product`,
      unit: "PIECE",
      price: 24,
      cost: 12,
      availableStock: 0,
      active: true,
    },
  });
  productIds.add(product.id);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `UX6-${label.toUpperCase()}-${RUN_ID}`,
      displayName: `${label} receiving variant`,
      isStockItem: true,
      price: 24,
      cost: 12,
    },
  });
  variantIds.add(variant.id);
  await prisma.inventoryStock.create({
    data: { variantId: variant.id, ...stock },
  });
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: `UX6-PO-${label.toUpperCase()}-${RUN_ID}`,
      supplierId,
      status: "ORDERED",
      orderDate: new Date(),
      expectedArrival: new Date(Date.now() + 24 * 60 * 60 * 1000),
      totalCost: expectedQty * 12,
      notes: `${MARKER} ${label}`,
      items: {
        create: {
          variantId: variant.id,
          sku: variant.sku,
          title: variant.displayName ?? variant.sku,
          unit: "piece",
          expectedQty,
          unitCost: 12,
        },
      },
    },
    include: { items: true },
  });
  purchaseOrderIds.add(po.id);
  return {
    purchaseOrderId: po.id,
    purchaseOrderItemId: po.items[0].id,
    productId: product.id,
    variantId: variant.id,
  };
}

function receiptPayload(
  fixture: Fixture,
  quantities: Partial<{
    acceptedQty: number;
    damagedQty: number;
    holdQty: number;
    shortageQty: number;
    wrongItemQty: number;
    closedShortQty: number;
    exceptionNote: string;
  }>,
) {
  return {
    items: [
      {
        purchaseOrderItemId: fixture.purchaseOrderItemId,
        variantId: fixture.variantId,
        acceptedQty: 0,
        damagedQty: 0,
        holdQty: 0,
        shortageQty: 0,
        wrongItemQty: 0,
        closedShortQty: 0,
        exceptionNote: "",
        ...quantities,
      },
    ],
  };
}

async function postReceipt(
  request: APIRequestContext,
  role: Role,
  fixture: Fixture,
  key: string,
  body: ReturnType<typeof receiptPayload>,
) {
  return request.post(
    `/api/purchase-orders/${fixture.purchaseOrderId}/receive`,
    {
      headers: {
        ...authHeaders(role),
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      data: body,
    },
  );
}

test.describe.serial("Receiving and inventory integrity", () => {
  let supplierId = "";
  let partial: Fixture;
  let overage: Fixture;
  let closedShort: Fixture;

  test.beforeAll(async () => {
    supplierId = await createSupplier();
    partial = await createFixture(supplierId, "partial");
    overage = await createFixture(supplierId, "overage", 5, {
      onHand: 0,
      reserved: 0,
      hold: 0,
      incoming: 5,
      inTransit: 0,
    });
    closedShort = await createFixture(supplierId, "closed-short", 5, {
      onHand: 0,
      reserved: 0,
      hold: 0,
      incoming: 5,
      inTransit: 0,
    });
  });

  test.afterAll(async () => {
    const variants = Array.from(variantIds);
    const purchaseOrders = Array.from(purchaseOrderIds);
    if (variants.length) {
      await prisma.inventoryMovement.deleteMany({
        where: { variantId: { in: variants } },
      });
    }
    if (purchaseOrders.length) {
      await prisma.purchaseReceipt.deleteMany({
        where: { purchaseOrderId: { in: purchaseOrders } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { id: { in: purchaseOrders } },
      });
    }
    if (variants.length) {
      await prisma.inventoryStock.deleteMany({
        where: { variantId: { in: variants } },
      });
      await prisma.productVariant.deleteMany({
        where: { id: { in: variants } },
      });
    }
    const products = Array.from(productIds);
    if (products.length) {
      await prisma.salesProduct.deleteMany({ where: { id: { in: products } } });
    }
    const suppliers = Array.from(supplierIds);
    if (suppliers.length) {
      await prisma.supplier.deleteMany({ where: { id: { in: suppliers } } });
    }
    await prisma.$disconnect();
  });

  test("Warehouse perspective shows a focused, mobile-safe receiving workspace", async ({
    page,
  }) => {
    await installSession(page, "WAREHOUSE");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/purchasing/orders/${partial.purchaseOrderId}`);

    const workspace = page.getByTestId("receiving-workspace");
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText("Expected");
    await expect(workspace).toContainText("Previously Received");
    await expect(workspace).toContainText("Remaining");
    await expect(workspace).toContainText("Available impact");
    await expect(workspace.locator(".ios-primary-btn")).toHaveCount(1);
    await expect(page.getByTestId("confirm-receipt")).toBeEnabled();
    const hasDocumentOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(hasDocumentOverflow).toBe(false);
  });

  test("Warehouse perspective posts one partial receipt under concurrent retry", async ({
    request,
  }) => {
    const body = receiptPayload(partial, {
      acceptedQty: 4,
      damagedQty: 2,
      holdQty: 1,
      shortageQty: 3,
      exceptionNote:
        "Two damaged, one quarantined, three pending supplier follow-up.",
    });
    const key = `ux6-partial-${RUN_ID}`;
    const [first, retry] = await Promise.all([
      postReceipt(request, "WAREHOUSE", partial, key, body),
      postReceipt(request, "WAREHOUSE", partial, key, body),
    ]);
    expect(first.ok()).toBe(true);
    expect(retry.ok()).toBe(true);

    const receipts = await prisma.purchaseReceipt.findMany({
      where: { purchaseOrderId: partial.purchaseOrderId },
      include: { items: true },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].actor).toBe("WAREHOUSE");
    expect(Number(receipts[0].items[0].priorReceivedQty)).toBe(0);
    expect(Number(receipts[0].items[0].newReceivedQty)).toBe(7);
    expect(Number(receipts[0].items[0].remainingQty)).toBe(3);
    expect(Number(receipts[0].items[0].availableImpact)).toBe(4);

    const stock = await prisma.inventoryStock.findUniqueOrThrow({
      where: { variantId: partial.variantId },
    });
    expect(Number(stock.onHand)).toBe(17);
    expect(Number(stock.reserved)).toBe(2);
    expect(Number(stock.hold)).toBe(4);
    expect(
      Number(stock.onHand) - Number(stock.reserved) - Number(stock.hold),
    ).toBe(11);
    expect(Number(stock.incoming)).toBe(3);
    expect(
      await prisma.inventoryMovement.count({
        where: {
          variantId: partial.variantId,
          type: {
            in: ["RECEIVE_ACCEPTED", "RECEIVE_HOLD_DAMAGED", "RECEIVE_HOLD"],
          },
        },
      }),
    ).toBe(3);
  });

  test("Owner perspective completes a second receipt without releasing held stock", async ({
    request,
    page,
  }) => {
    const response = await postReceipt(
      request,
      "ADMIN",
      partial,
      `ux6-complete-${RUN_ID}`,
      receiptPayload(partial, { acceptedQty: 3 }),
    );
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.data.status).toBe("RECEIVED");

    const stock = await prisma.inventoryStock.findUniqueOrThrow({
      where: { variantId: partial.variantId },
    });
    expect(Number(stock.onHand)).toBe(20);
    expect(Number(stock.hold)).toBe(4);
    expect(
      Number(stock.onHand) - Number(stock.reserved) - Number(stock.hold),
    ).toBe(14);
    expect(Number(stock.incoming)).toBe(0);

    await installSession(page, "ADMIN");
    await page.goto(`/purchasing/orders/${partial.purchaseOrderId}`);
    await expect(
      page.getByRole("heading", { name: "Receipt history" }),
    ).toBeVisible();
    await expect(page.getByText(/Accepted 4, Damaged 2, Hold 1/)).toBeVisible();
    await expect(page.getByText(/Accepted 3, Damaged 0, Hold 0/)).toBeVisible();
    await expect(page.getByTestId("confirm-receipt")).toBeDisabled();
  });

  test("Overage requires Owner approval and records the approval actor", async ({
    request,
  }) => {
    const body = receiptPayload(overage, {
      acceptedQty: 6,
      exceptionNote: "Supplier shipped one extra unit; owner approved.",
    });
    const warehouseResponse = await postReceipt(
      request,
      "WAREHOUSE",
      overage,
      `ux6-overage-warehouse-${RUN_ID}`,
      body,
    );
    expect(warehouseResponse.status()).toBe(409);
    expect(await warehouseResponse.text()).toContain("Owner/Manager approval");
    expect(
      await prisma.purchaseReceipt.count({
        where: { purchaseOrderId: overage.purchaseOrderId },
      }),
    ).toBe(0);

    const ownerResponse = await postReceipt(
      request,
      "ADMIN",
      overage,
      `ux6-overage-owner-${RUN_ID}`,
      body,
    );
    expect(ownerResponse.ok()).toBe(true);
    const receipt = await prisma.purchaseReceipt.findFirstOrThrow({
      where: { purchaseOrderId: overage.purchaseOrderId },
      include: { items: true },
    });
    expect(receipt.approvalActor).toBe("ADMIN");
    expect(Number(receipt.items[0].overageQty)).toBe(1);
  });

  test("Closed Short is owner-gated and direct stock edits stay disabled", async ({
    request,
  }) => {
    const body = receiptPayload(closedShort, {
      acceptedQty: 3,
      shortageQty: 2,
      closedShortQty: 2,
      exceptionNote:
        "Supplier cancelled the remaining two; owner closed short.",
    });
    const warehouseResponse = await postReceipt(
      request,
      "WAREHOUSE",
      closedShort,
      `ux6-closed-warehouse-${RUN_ID}`,
      body,
    );
    expect(warehouseResponse.status()).toBe(409);

    const ownerResponse = await postReceipt(
      request,
      "ADMIN",
      closedShort,
      `ux6-closed-owner-${RUN_ID}`,
      body,
    );
    expect(ownerResponse.ok()).toBe(true);
    const line = await prisma.purchaseOrderItem.findUniqueOrThrow({
      where: { id: closedShort.purchaseOrderItemId },
    });
    expect(Number(line.receivedQty)).toBe(3);
    expect(Number(line.closedShortQty)).toBe(2);

    const directEdit = await request.post(
      `/api/products/${closedShort.productId}/inventory`,
      {
        headers: authHeaders("ADMIN"),
        data: { adjustment: 100 },
      },
    );
    expect(directEdit.status()).toBe(410);
    expect(await directEdit.text()).toContain("DIRECT_STOCK_EDIT_DISABLED");
  });
});
