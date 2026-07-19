import { expect, test, type Page } from "@playwright/test";

type WriteRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

type MockItem = ReturnType<typeof buildItem>;
type MockOrder = ReturnType<typeof buildOrder>;

const customer = {
  id: "phase2a3-customer",
  name: "SOLIDCORE PHASE2A3 QA DELETE ME",
  phone: "808-555-2301",
  email: "phase2a3@example.com",
  address: "2301 Special Order Way",
  taxExempt: false,
  taxRate: 4.712,
};

const supplier = {
  id: "phase2a3-supplier-1",
  name: "Pacific Materials Supply With A Very Long Supplier Name",
  contactName: "Supplier Coordinator",
  phone: "808-555-2399",
};

const supplier2 = {
  id: "phase2a3-supplier-2",
  name: "Island Custom Imports",
  contactName: "Custom Desk",
  phone: "808-555-2310",
};

const purchaseOrder = {
  id: "phase2a3-po-1",
  poNumber: "PO-PHASE2A3-001",
  status: "ORDERED",
  orderDate: "2026-08-01T00:00:00.000Z",
  expectedArrival: "2026-09-01T00:00:00.000Z",
  supplier,
};

const purchaseOrder2 = {
  id: "phase2a3-po-2",
  poNumber: "PO-PHASE2A3-002",
  status: "IN_TRANSIT",
  orderDate: "2026-08-05T00:00:00.000Z",
  expectedArrival: "2026-09-10T00:00:00.000Z",
  supplier: supplier2,
};

const product = {
  id: "phase2a3-variant-standard",
  productId: "phase2a3-product-standard",
  name: "In-Stock Door Casing",
  title: "In-Stock Door Casing",
  sku: "PH2A3-STANDARD-001",
  generatedDescription: "In-stock trim",
  variantDescription: "Primed white",
  defaultDescription: null,
  brand: "SolidCore",
  collection: "Trim",
  onHandStock: "40",
  availableStock: "36",
  price: "18.00",
  unit: "PIECE",
  sellingUnit: "PIECE",
  category: "Trim",
  flooringBoxCoverageSqft: null,
};

const specialProduct = {
  id: "phase2a3-variant-special",
  productId: "phase2a3-product-special",
  name: "Custom Patio Door",
  title: "Custom Patio Door",
  sku: "PH2A3-SPECIAL-777",
  generatedDescription: "Custom patio door",
  variantDescription: "96x80 bronze special order",
  defaultDescription: null,
  brand: "SolidCore",
  collection: "Doors",
  onHandStock: "0",
  availableStock: "0",
  price: "1450.00",
  unit: "BOX",
  sellingUnit: "BOX",
  category: "Doors",
  flooringBoxCoverageSqft: null,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "phase2a3-item-standard",
    productId: product.productId,
    variantId: product.id,
    productSku: product.sku,
    productTitle: product.title,
    skuSnapshot: product.sku,
    titleSnapshot: product.title,
    notes: null as string | null,
    description: product.generatedDescription,
    lineDescription: product.generatedDescription,
    uomSnapshot: "PIECE",
    quantity: "1",
    unitPrice: "18.00",
    lineDiscount: "0",
    lineTotal: "18.00",
    fulfillQty: "0",
    isSpecialOrder: false as boolean,
    specialOrderStatus: null as string | null,
    linkedPoId: null as string | null,
    specialFollowupDate: null as string | null,
    linkedPo: null as typeof purchaseOrder | null,
    product: {
      name: product.name,
      unit: product.unit,
      flooringBoxCoverageSqft: null,
    },
    variant: {
      sku: product.sku,
      displayName: product.variantDescription,
    },
    ...overrides,
  };
}

function buildSpecialItem(overrides: Record<string, unknown> = {}) {
  return buildItem({
    id: "phase2a3-item-special",
    productId: specialProduct.productId,
    variantId: specialProduct.id,
    productSku: specialProduct.sku,
    productTitle: specialProduct.title,
    skuSnapshot: specialProduct.sku,
    titleSnapshot: specialProduct.title,
    description: specialProduct.generatedDescription,
    lineDescription: specialProduct.generatedDescription,
    uomSnapshot: "BOX",
    quantity: "2.5",
    unitPrice: "1450.00",
    lineDiscount: "100.00",
    lineTotal: "3525.00",
    fulfillQty: "0",
    isSpecialOrder: true,
    specialOrderStatus: "ORDERED",
    linkedPoId: purchaseOrder.id,
    specialFollowupDate: "2026-08-20T00:00:00.000Z",
    linkedPo: purchaseOrder,
    product: {
      name: specialProduct.name,
      unit: specialProduct.unit,
      flooringBoxCoverageSqft: null,
    },
    variant: {
      sku: specialProduct.sku,
      displayName: specialProduct.variantDescription,
    },
    ...overrides,
  });
}

function buildOrder(
  overrides: {
    id?: string;
    specialOrder?: boolean;
    supplierId?: string | null;
    supplier?: typeof supplier | typeof supplier2 | null;
    etaDate?: string | null;
    specialOrderStatus?: string | null;
    supplierNotes?: string | null;
    depositRequired?: string;
    total?: string;
    paidAmount?: string;
    balanceDue?: string;
    tax?: string;
    discount?: string;
    items?: MockItem[];
  } = {},
) {
  const supplierId =
    overrides.supplierId !== undefined
      ? overrides.supplierId
      : overrides.specialOrder
        ? supplier.id
        : null;
  const resolvedSupplier =
    overrides.supplier !== undefined
      ? overrides.supplier
      : supplierId === supplier.id
        ? supplier
        : supplierId === supplier2.id
          ? supplier2
          : null;
  return {
    id: overrides.id ?? "phase2a3-order",
    orderNumber: "SO-PHASE2A3-001",
    docType: "SALES_ORDER" as const,
    projectName: "Special order verification",
    status: "CONFIRMED",
    specialOrder: overrides.specialOrder ?? false,
    supplierId,
    etaDate: overrides.etaDate ?? null,
    specialOrderStatus: overrides.specialOrderStatus ?? null,
    supplierNotes: overrides.supplierNotes ?? null,
    depositRequired: overrides.depositRequired ?? "500.00",
    subtotal: "3543.00",
    discount: overrides.discount ?? "100.00",
    taxRate: "4.712",
    tax: overrides.tax ?? "162.25",
    total: overrides.total ?? "3605.25",
    paidAmount: overrides.paidAmount ?? "200.00",
    balanceDue: overrides.balanceDue ?? "3405.25",
    paymentStatus: "partial" as const,
    salespersonName: "Special Order Tester",
    fulfillmentMethod: "PICKUP" as const,
    deliveryName: null,
    deliveryPhone: null,
    deliveryAddress1: null,
    deliveryAddress2: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryZip: null,
    deliveryNotes: null,
    pickupNotes: "Counter pickup",
    requestedDeliveryAt: null,
    notes: "Keep customer updated",
    createdAt: "2026-07-18T12:00:00.000Z",
    customer,
    supplier: resolvedSupplier,
    items: overrides.items ?? [buildItem(), buildSpecialItem()],
    payments: [
      {
        id: "phase2a3-payment-1",
        amount: "200.00",
        method: "CASH",
        status: "POSTED" as const,
        referenceNumber: null,
        receivedAt: "2026-07-18T13:00:00.000Z",
        notes: null,
      },
    ],
    fulfillments: [
      {
        id: "phase2a3-fulfillment-1",
        type: "PICKUP" as const,
        scheduledDate: "2026-07-20T12:00:00.000Z",
        status: "IN_PROGRESS" as const,
        address: null,
        notes: null,
      },
    ],
    outboundQueue: null,
  };
}

function fulfillmentDetail(order: MockOrder) {
  return {
    id: "phase2a3-fulfillment-1",
    type: "PICKUP",
    status: "IN_PROGRESS",
    scheduledAt: "2026-07-20T12:00:00.000Z",
    scheduledDate: "2026-07-20T12:00:00.000Z",
    timeWindow: null,
    driverName: null,
    pickupContact: customer.name,
    items: order.items.map((item) => ({
      orderedQty: item.quantity,
      fulfilledQty: item.fulfillQty,
    })),
  };
}

function financialSnapshot(order: MockOrder) {
  return {
    total: order.total,
    paidAmount: order.paidAmount,
    balanceDue: order.balanceDue,
    tax: order.tax,
    discount: order.discount,
    itemTotals: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineDiscount: item.lineDiscount,
      lineTotal: item.lineTotal,
    })),
  };
}

function inventorySnapshot() {
  return {
    onHand: 40,
    reservedForConfirmedNormalItems: 1,
    movements: 0,
    fulfillments: 1,
  };
}

async function mockOrderDetailApis(
  page: Page,
  order: MockOrder,
  options: {
    failOrderPatch?: boolean;
    failItemPatch?: boolean;
    itemPatchDelayMs?: number;
  } = {},
) {
  let currentOrder = clone(order);
  const writes: WriteRequest[] = [];
  const inventory = inventorySnapshot();

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      let body: unknown = null;
      const rawBody = request.postData();
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }
      writes.push({ method, pathname: url.pathname, body });

      if (url.pathname === `/api/sales-orders/${currentOrder.id}` && method === "PATCH") {
        if (options.failOrderPatch) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Special Order metadata save failed" }),
          });
          return;
        }
        const patch = body as Partial<MockOrder>;
        currentOrder = {
          ...currentOrder,
          supplierId: patch.supplierId === undefined ? currentOrder.supplierId : patch.supplierId,
          supplier:
            patch.supplierId === supplier.id
              ? supplier
              : patch.supplierId === supplier2.id
                ? supplier2
                : patch.supplierId === null
                  ? null
                  : currentOrder.supplier,
          etaDate: patch.etaDate === undefined ? currentOrder.etaDate : patch.etaDate,
          specialOrderStatus:
            patch.specialOrderStatus === undefined
              ? currentOrder.specialOrderStatus
              : patch.specialOrderStatus,
          supplierNotes:
            patch.supplierNotes === undefined ? currentOrder.supplierNotes : patch.supplierNotes,
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: currentOrder }),
        });
        return;
      }

      const itemPatchPrefix = `/api/sales-orders/${currentOrder.id}/items/`;
      if (url.pathname.startsWith(itemPatchPrefix) && method === "PATCH") {
        if (options.itemPatchDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.itemPatchDelayMs));
        }
        if (options.failItemPatch) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Special Order line save failed" }),
          });
          return;
        }
        const itemId = url.pathname.slice(itemPatchPrefix.length);
        const patch = body as Partial<MockItem>;
        currentOrder = {
          ...currentOrder,
          items: currentOrder.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  isSpecialOrder:
                    patch.isSpecialOrder === undefined ? item.isSpecialOrder : patch.isSpecialOrder,
                  specialOrderStatus:
                    patch.specialOrderStatus === undefined
                      ? item.specialOrderStatus
                      : patch.specialOrderStatus,
                  linkedPoId: patch.linkedPoId === undefined ? item.linkedPoId : patch.linkedPoId,
                  linkedPo:
                    patch.linkedPoId === purchaseOrder.id
                      ? purchaseOrder
                      : patch.linkedPoId === purchaseOrder2.id
                        ? purchaseOrder2
                        : patch.linkedPoId === null
                          ? null
                          : item.linkedPo,
                  specialFollowupDate:
                    patch.specialFollowupDate === undefined
                      ? item.specialFollowupDate
                      : patch.specialFollowupDate,
                }
              : item,
          ),
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: currentOrder }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: {} }),
      });
      return;
    }

    let data: unknown = [];
    if (url.pathname === "/api/auth/session") {
      data = { userId: "test-admin", name: "Test Admin", role: "ADMIN" };
    } else if (url.pathname === `/api/sales-orders/${currentOrder.id}`) {
      data = currentOrder;
    } else if (url.pathname === `/api/sales-orders/${currentOrder.id}/tickets`) {
      data = [];
    } else if (url.pathname === "/api/invoices") {
      data = [];
    } else if (url.pathname === "/api/after-sales/returns") {
      data = [];
    } else if (url.pathname === "/api/purchase-orders") {
      data = [purchaseOrder, purchaseOrder2];
    } else if (url.pathname === "/api/sales-orders/products") {
      data = [product, specialProduct];
    } else if (url.pathname === "/api/suppliers") {
      data = [supplier, supplier2];
    } else if (url.pathname === "/api/sales-orders/customers") {
      data = [customer];
    } else if (url.pathname === "/api/sales-orders/salespeople") {
      data = [{ id: "phase2a3-salesperson", name: "Special Order Tester" }];
    } else if (url.pathname === "/api/fulfillments/phase2a3-fulfillment-1") {
      data = fulfillmentDetail(currentOrder);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });

  return {
    writes,
    getOrder: () => currentOrder,
    getInventory: () => inventory,
  };
}

async function openOrderDetail(
  page: Page,
  order: MockOrder,
  options: Parameters<typeof mockOrderDetailApis>[2] = {},
) {
  const mock = await mockOrderDetailApis(page, order, options);
  await page.goto(`/orders/${order.id}`);
  await expect(page.getByTestId("operational-header")).toBeVisible();
  return mock;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow).toBe(false);
}

function expectNoForbiddenBusinessFields(body: unknown) {
  expect(body).toEqual(expect.not.objectContaining({
    total: expect.anything(),
    paidAmount: expect.anything(),
    balanceDue: expect.anything(),
    tax: expect.anything(),
    taxRate: expect.anything(),
    discount: expect.anything(),
    quantity: expect.anything(),
    unitPrice: expect.anything(),
    lineDiscount: expect.anything(),
    lineTotal: expect.anything(),
    fulfillQty: expect.anything(),
    depositRequired: expect.anything(),
  }));
}

test.describe("Order Detail Special Order operational workflow", () => {
  test("normal orders do not show a Special Order panel or create write requests on load", async ({ page }) => {
    const order = buildOrder({
      id: "phase2a3-normal",
      specialOrder: false,
      supplierId: null,
      supplier: null,
      etaDate: null,
      specialOrderStatus: null,
      supplierNotes: null,
      depositRequired: "0",
      items: [buildItem()],
    });

    const { writes } = await openOrderDetail(page, order);

    await expect(page.getByTestId("special-order-panel")).toHaveCount(0);
    await expect(page.getByText("Special Order", { exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("mixed item-level Special Order displays the special line without marking normal lines", async ({ page }) => {
    const order = buildOrder({
      id: "phase2a3-mixed",
      specialOrder: false,
      supplierId: supplier.id,
      supplier,
      etaDate: "2026-08-15T00:00:00.000Z",
      items: [buildItem(), buildSpecialItem()],
    });

    const { writes } = await openOrderDetail(page, order);
    const panel = page.getByTestId("special-order-panel");
    const lineCard = page.getByTestId("special-order-line-card");

    await expect(panel).toBeVisible();
    await expect(page.getByTestId("operational-header")).toContainText("Special Order");
    await expect(panel).toContainText("1 special-order line · 1 normal line");
    await expect(lineCard).toHaveCount(1);
    await expect(lineCard).toContainText("Custom Patio Door");
    await expect(lineCard).toContainText("SKU: PH2A3-SPECIAL-777");
    await expect(lineCard).toContainText("2.5 boxes");
    await expect(lineCard).toContainText(supplier.name);
    await expect(lineCard).toContainText("9/1/2026");
    await expect(lineCard).toContainText("Ordered");
    await expect(lineCard).toContainText(purchaseOrder.poNumber);
    await expect(lineCard).toContainText("8/20/2026");
    await expect(lineCard).not.toContainText("In-Stock Door Casing");
    expect(writes).toEqual([]);
  });

  test("order-level Special Order metadata appears without turning normal lines into special lines", async ({ page }) => {
    const order = buildOrder({
      id: "phase2a3-order-level",
      specialOrder: true,
      supplierId: supplier.id,
      supplier,
      etaDate: "2026-08-15T00:00:00.000Z",
      specialOrderStatus: "REQUESTED",
      supplierNotes: "Waiting for customer approval",
      items: [buildItem()],
    });

    await openOrderDetail(page, order);

    const panel = page.getByTestId("special-order-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(supplier.name);
    await expect(panel).toContainText("8/15/2026");
    await expect(panel).toContainText("Requested");
    await expect(panel).toContainText("Waiting for customer approval");
    await expect(page.getByTestId("special-order-line-card")).toHaveCount(0);
    await expect(page.getByTestId("special-order-no-marked-lines")).toContainText(
      "No line is marked Special Order yet.",
    );
  });

  test("metadata edits use existing safe APIs and do not mutate financial or inventory fields", async ({ page }) => {
    const order = buildOrder({
      id: "phase2a3-edit-success",
      specialOrder: true,
      supplierId: supplier.id,
      supplier,
      etaDate: "2026-08-15T00:00:00.000Z",
      specialOrderStatus: "ORDERED",
      supplierNotes: "Original note",
    });
    const beforeFinancial = financialSnapshot(order);
    const beforeInventory = inventorySnapshot();
    const mock = await openOrderDetail(page, order);

    const metadataForm = page.getByTestId("special-order-metadata-form");
    await metadataForm.getByLabel("Special Order supplier", { exact: true }).selectOption(supplier2.id);
    await metadataForm.getByLabel("Special Order ETA").fill("2026-09-10");
    await metadataForm.getByLabel("Special Order status", { exact: true }).selectOption("IN_TRANSIT");
    await metadataForm.getByLabel("Special Order supplier note", { exact: true }).fill("Called supplier; shipment booked.");
    await page.getByTestId("save-special-order-metadata").click();
    await expect(page.getByText("Special Order details saved.")).toBeVisible();

    const lineControls = page.getByTestId("special-order-line-controls-phase2a3-item-special");
    await lineControls.getByLabel("Custom Patio Door Special Order status").selectOption("ARRIVED");
    await lineControls.getByLabel("Custom Patio Door linked PO").selectOption(purchaseOrder2.id);
    await lineControls.getByLabel("Custom Patio Door follow-up date").fill("2026-09-20");
    await page.getByTestId("save-special-order-line-phase2a3-item-special").click();
    await expect(page.getByText("Special Order line saved.")).toBeVisible();

    const orderPatch = mock.writes.find((write) => write.pathname === `/api/sales-orders/${order.id}`);
    expect(orderPatch?.method).toBe("PATCH");
    expect(orderPatch?.body).toEqual({
      supplierId: supplier2.id,
      etaDate: "2026-09-10",
      specialOrderStatus: "IN_TRANSIT",
      supplierNotes: "Called supplier; shipment booked.",
    });
    expectNoForbiddenBusinessFields(orderPatch?.body);

    const itemPatch = mock.writes.find(
      (write) => write.pathname === `/api/sales-orders/${order.id}/items/phase2a3-item-special`,
    );
    expect(itemPatch?.method).toBe("PATCH");
    expect(itemPatch?.body).toEqual({
      isSpecialOrder: true,
      specialOrderStatus: "ARRIVED",
      linkedPoId: purchaseOrder2.id,
      specialFollowupDate: "2026-09-20",
    });
    expectNoForbiddenBusinessFields(itemPatch?.body);

    expect(financialSnapshot(mock.getOrder())).toEqual({
      ...beforeFinancial,
      itemTotals: beforeFinancial.itemTotals,
    });
    expect(mock.getInventory()).toEqual(beforeInventory);
    expect(
      mock.writes.filter((write) =>
        /inventory|reservation|fulfillments?|payments?|invoices?|refund|store-credit/i.test(write.pathname),
      ),
    ).toEqual([]);
  });

  test("failed line update restores visible values, stops loading, and prevents duplicate writes", async ({ page }) => {
    const order = buildOrder({
      id: "phase2a3-edit-failure",
      specialOrder: true,
      supplierId: supplier.id,
      supplier,
      etaDate: "2026-08-15T00:00:00.000Z",
      specialOrderStatus: "ORDERED",
    });
    const mock = await openOrderDetail(page, order, {
      failItemPatch: true,
      itemPatchDelayMs: 150,
    });

    const lineControls = page.getByTestId("special-order-line-controls-phase2a3-item-special");
    await lineControls.getByLabel("Custom Patio Door Special Order status").selectOption("ARRIVED");
    await page.getByTestId("save-special-order-line-phase2a3-item-special").dblclick();

    await expect(page.getByText("Special Order line save failed")).toBeVisible();
    await expect(page.getByTestId("save-special-order-line-phase2a3-item-special")).toHaveText("Save Line");
    await expect(lineControls.getByLabel("Custom Patio Door Special Order status")).toHaveValue("ORDERED");
    await expect(page.getByTestId("special-order-line-card")).toContainText("Ordered");

    const itemPatches = mock.writes.filter(
      (write) => write.pathname === `/api/sales-orders/${order.id}/items/phase2a3-item-special`,
    );
    expect(itemPatches).toHaveLength(1);

    await lineControls.getByLabel("Custom Patio Door Special Order status").selectOption("IN_TRANSIT");
    await expect(page.getByTestId("save-special-order-line-phase2a3-item-special")).toBeEnabled();
  });

  test("responsive panel remains readable and keyboard reachable", async ({ page }) => {
    const order = buildOrder({
      id: "phase2a3-responsive",
      specialOrder: false,
      supplierId: supplier.id,
      supplier,
      etaDate: "2026-08-15T00:00:00.000Z",
      items: [buildItem(), buildSpecialItem()],
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1180, height: 820 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await openOrderDetail(page, { ...order, id: `phase2a3-responsive-${viewport.width}` });
      await expect(page.getByTestId("special-order-panel")).toBeVisible();
      await expect(page.getByTestId("operational-primary-action")).toBeVisible();
      await expect(page.getByTestId("special-order-order-metadata")).toContainText(supplier.name);
      await expectNoHorizontalOverflow(page);
      await page.getByLabel("Special Order supplier", { exact: true }).focus();
      await expect(page.getByLabel("Special Order supplier", { exact: true })).toBeFocused();
    }
  });
});
