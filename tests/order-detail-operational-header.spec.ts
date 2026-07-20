import { expect, test, type Locator, type Page } from "@playwright/test";

type WriteRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

type MockOrder = ReturnType<typeof buildOrder>;

const customer = {
  id: "phase2a-customer",
  name: "SOLIDCORE PHASE2A QA DELETE ME",
  phone: "808-555-2201",
  email: "phase2a@example.com",
  address: "2201 Counter Way",
  taxExempt: false,
  taxRate: 4.712,
};

const supplier = {
  id: "phase2a-supplier",
  name: "Pacific Materials Supply",
  contactName: "Fixture Supplier",
  phone: "808-555-2299",
};

const product = {
  id: "phase2a-variant",
  productId: "phase2a-product",
  name: "Commercial Door Kit",
  title: "Commercial Door Kit",
  sku: "PH2A-DOOR-001",
  generatedDescription: "Commercial door kit",
  variantDescription: "36x84 bronze",
  defaultDescription: null,
  brand: "SolidCore",
  collection: "Doors",
  onHandStock: "25",
  availableStock: "20",
  price: "125.00",
  unit: "PIECE",
  sellingUnit: "PIECE",
  category: "Doors",
  flooringBoxCoverageSqft: null,
};

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "phase2a-item-1",
    productId: product.productId,
    variantId: product.id,
    productSku: product.sku,
    productTitle: product.title,
    description: product.generatedDescription,
    lineDescription: product.generatedDescription,
    uomSnapshot: "PIECE",
    quantity: "5",
    unitPrice: "125.00",
    lineDiscount: "0",
    lineTotal: "625.00",
    fulfillQty: "2",
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

function buildOrder(
  overrides: {
    id?: string;
    orderNumber?: string;
    docType?: "QUOTE" | "SALES_ORDER";
    status?: string;
    specialOrder?: boolean;
    total?: string;
    paidAmount?: string;
    balanceDue?: string;
    items?: ReturnType<typeof buildItem>[];
    withFulfillment?: boolean;
    fulfillmentStatus?: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    customerName?: string;
    fulfillmentMethod?: "PICKUP" | "DELIVERY";
    deliveryName?: string | null;
    deliveryPhone?: string | null;
    deliveryAddress1?: string | null;
    deliveryAddress2?: string | null;
    deliveryCity?: string | null;
    deliveryState?: string | null;
    deliveryZip?: string | null;
    deliveryNotes?: string | null;
    pickupNotes?: string | null;
    requestedDeliveryAt?: string | null;
    notes?: string | null;
  } = {},
) {
  const status = overrides.status ?? "CONFIRMED";
  const withFulfillment = overrides.withFulfillment ?? false;
  const fulfillmentStatus =
    overrides.fulfillmentStatus ??
    (status === "FULFILLED" ? "COMPLETED" : "IN_PROGRESS");
  return {
    id: overrides.id ?? "phase2a-order",
    orderNumber: overrides.orderNumber ?? "SO-PHASE2A-001",
    docType: overrides.docType ?? "SALES_ORDER",
    projectName: "Header verification",
    status,
    specialOrder: overrides.specialOrder ?? false,
    supplierId: overrides.specialOrder ? supplier.id : null,
    etaDate: overrides.specialOrder ? "2026-08-15T00:00:00.000Z" : null,
    specialOrderStatus: overrides.specialOrder ? "ORDERED" : null,
    supplierNotes: null,
    depositRequired: "0",
    subtotal: "625.00",
    discount: "0",
    taxRate: "4.712",
    tax: "29.45",
    total: overrides.total ?? "654.45",
    paidAmount: overrides.paidAmount ?? "100.00",
    balanceDue: overrides.balanceDue ?? "554.45",
    paymentStatus: "partial" as const,
    salespersonName: "Test Salesperson",
    fulfillmentMethod: overrides.fulfillmentMethod ?? ("PICKUP" as const),
    deliveryName: overrides.deliveryName ?? null,
    deliveryPhone: overrides.deliveryPhone ?? null,
    deliveryAddress1: overrides.deliveryAddress1 ?? null,
    deliveryAddress2: overrides.deliveryAddress2 ?? null,
    deliveryCity: overrides.deliveryCity ?? null,
    deliveryState: overrides.deliveryState ?? null,
    deliveryZip: overrides.deliveryZip ?? null,
    deliveryNotes: overrides.deliveryNotes ?? null,
    pickupNotes: overrides.pickupNotes ?? "Counter pickup",
    requestedDeliveryAt: overrides.requestedDeliveryAt ?? null,
    notes: overrides.notes ?? null,
    createdAt: "2026-07-18T12:00:00.000Z",
    customer: {
      ...customer,
      name: overrides.customerName ?? customer.name,
    },
    supplier: overrides.specialOrder ? supplier : null,
    items: overrides.items ?? [buildItem()],
    payments: [
      {
        id: "phase2a-payment-1",
        amount: "1.00",
        method: "CASH",
        status: "POSTED" as const,
        referenceNumber: null,
        receivedAt: "2026-07-18T12:30:00.000Z",
        notes: null,
      },
    ],
    fulfillments: withFulfillment
      ? [
          {
            id: "phase2a-fulfillment",
            type: overrides.fulfillmentMethod ?? ("PICKUP" as const),
            scheduledDate: "2026-07-19T12:00:00.000Z",
            status: fulfillmentStatus,
            address: null,
            notes: null,
          },
        ]
      : [],
    outboundQueue: null,
  };
}

function fulfillmentDetail(order: MockOrder) {
  return {
    id: "phase2a-fulfillment",
    type: "PICKUP",
    status: order.fulfillments[0]?.status ?? "IN_PROGRESS",
    scheduledAt: "2026-07-19T12:00:00.000Z",
    scheduledDate: "2026-07-19T12:00:00.000Z",
    timeWindow: null,
    driverName: null,
    pickupContact: customer.name,
    items: order.items.map((item) => ({
      orderedQty: item.quantity,
      fulfilledQty: item.fulfillQty,
    })),
  };
}

async function mockOrderDetailApis(
  page: Page,
  order: MockOrder,
  options: { invoiceExists?: boolean } = {},
) {
  const writes: WriteRequest[] = [];
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
    } else if (url.pathname === `/api/sales-orders/${order.id}`) {
      data = order;
    } else if (url.pathname === `/api/sales-orders/${order.id}/tickets`) {
      data = [];
    } else if (url.pathname === "/api/invoices") {
      data = options.invoiceExists
        ? [{ id: "phase2a-invoice", salesOrderId: order.id }]
        : [];
    } else if (url.pathname === "/api/after-sales/returns") {
      data = [];
    } else if (url.pathname === "/api/sales-orders/products") {
      data = [product];
    } else if (url.pathname === "/api/suppliers") {
      data = [supplier];
    } else if (url.pathname === "/api/sales-orders/customers") {
      data = [customer];
    } else if (url.pathname === "/api/sales-orders/salespeople") {
      data = [{ id: "phase2a-salesperson", name: "Test Salesperson" }];
    } else if (url.pathname === "/api/fulfillments/phase2a-fulfillment") {
      data = fulfillmentDetail(order);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  return writes;
}

async function openOrderDetail(
  page: Page,
  order: MockOrder,
  options: { invoiceExists?: boolean } = {},
) {
  const writes = await mockOrderDetailApis(page, order, options);
  await page.goto(`/orders/${order.id}`);
  const header = page.getByTestId("operational-header");
  await expect(header).toBeVisible();
  await expect(header).toContainText(order.orderNumber);
  return { header, writes };
}

async function expectHeaderActionAbsent(header: Locator, name: string) {
  await expect(header.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name, exact: true })).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow).toBe(false);
}

test.describe("Order Detail operational header", () => {
  const statusCases = [
    {
      name: "draft sales order",
      order: buildOrder({ status: "DRAFT" }),
      invoiceExists: false,
      primary: "Edit Order",
      hidden: ["Create Invoice", "View Invoice", "Start Fulfillment", "View Fulfillment", "Create Return"],
    },
    {
      name: "quoted quote",
      order: buildOrder({ docType: "QUOTE", status: "QUOTED", orderNumber: "Q-PHASE2A-001" }),
      invoiceExists: false,
      primary: "Convert to Sales Order",
      hidden: ["Create Invoice", "View Invoice", "Start Fulfillment", "View Fulfillment", "Create Return"],
    },
    {
      name: "confirmed sales order",
      order: buildOrder({ status: "CONFIRMED" }),
      invoiceExists: false,
      primary: "Create Invoice",
      hidden: ["Receive Payment", "Mark Completed"],
    },
    {
      name: "ready sales order",
      order: buildOrder({ status: "READY", withFulfillment: true }),
      invoiceExists: true,
      primary: "View Fulfillment",
      hidden: ["Start Fulfillment", "Receive Payment", "Mark Completed"],
    },
    {
      name: "partially fulfilled sales order",
      order: buildOrder({ status: "PARTIALLY_FULFILLED", withFulfillment: true }),
      invoiceExists: true,
      primary: "View Fulfillment",
      hidden: ["Start Fulfillment", "Receive Payment", "Mark Completed"],
    },
    {
      name: "fulfilled sales order",
      order: buildOrder({ status: "FULFILLED", withFulfillment: true, fulfillmentStatus: "COMPLETED" }),
      invoiceExists: true,
      primary: "View Invoice",
      hidden: ["Create Invoice", "Start Fulfillment", "Receive Payment", "Mark Completed", "Create Return"],
    },
    {
      name: "cancelled sales order",
      order: buildOrder({ status: "CANCELLED", withFulfillment: true }),
      invoiceExists: true,
      primary: "Print",
      hidden: ["Create Invoice", "View Invoice", "Start Fulfillment", "View Fulfillment", "Receive Payment", "Create Return"],
    },
  ];

  for (const item of statusCases) {
    test(`status matrix renders safe header action for ${item.name}`, async ({ page }) => {
      const { header, writes } = await openOrderDetail(page, item.order, {
        invoiceExists: item.invoiceExists,
      });

      await expect(header).toContainText(item.order.docType === "QUOTE" ? "Quote" : "Sales Order");
      await expect(header).toContainText(item.order.status.replaceAll("_", " ").split(" ").map((part) => part[0] + part.slice(1).toLowerCase()).join(" "));
      await expect(header).toContainText(item.order.customer.name);
      await expect(header).toContainText(item.order.customer.phone ?? "");
      await expect(header.getByTestId("operational-primary-action")).toHaveText(item.primary);
      await expect(header.getByTestId("operational-financial-summary")).toContainText("$654.45");
      await expect(header.getByTestId("operational-financial-summary")).toContainText("$100.00");
      await expect(header.getByTestId("operational-financial-summary")).toContainText("$554.45");

      for (const hiddenAction of item.hidden) {
        await expectHeaderActionAbsent(header, hiddenAction);
      }
      expect(writes).toEqual([]);
    });
  }

  test("uses persisted financial fields even when lines and payments do not add up", async ({ page }) => {
    const order = buildOrder({
      total: "9999.99",
      paidAmount: "123.45",
      balanceDue: "9876.54",
      items: [buildItem({ quantity: "1", unitPrice: "1.00", lineTotal: "1.00", fulfillQty: "0" })],
    });

    const { header } = await openOrderDetail(page, order, { invoiceExists: true });
    const financial = header.getByTestId("operational-financial-summary");

    await expect(financial).toContainText("$9999.99");
    await expect(financial).toContainText("$123.45");
    await expect(financial).toContainText("$9876.54");
    await expect(financial).not.toContainText("$1.00");
  });

  test("warehouse summary is current-order quantity demand, not global stock reservation", async ({ page }) => {
    const order = buildOrder({
      status: "CONFIRMED",
      items: [buildItem({ quantity: "5", fulfillQty: "2", uomSnapshot: "PIECE" })],
    });

    const { header } = await openOrderDetail(page, order, { invoiceExists: true });
    const warehouse = header.getByTestId("operational-warehouse-summary");

    await expect(warehouse).toContainText("Ordered");
    await expect(warehouse).toContainText("5");
    await expect(warehouse).toContainText("Reserved");
    await expect(warehouse).toContainText("3");
    await expect(warehouse).toContainText("Fulfilled");
    await expect(warehouse).toContainText("2");
    await expect(warehouse).toContainText("Remaining");
    await expect(warehouse).toContainText("3");
    await expect(warehouse).toContainText("qty");
  });

  test("non-reserving statuses do not show reserved demand", async ({ page }) => {
    const order = buildOrder({
      docType: "QUOTE",
      status: "QUOTED",
      items: [buildItem({ quantity: "5", fulfillQty: "0" })],
    });

    const { header } = await openOrderDetail(page, order);
    const warehouse = header.getByTestId("operational-warehouse-summary");

    await expect(warehouse).toContainText("Reserved");
    await expect(warehouse).toContainText("0");
    await expect(warehouse).toContainText("not reserving");
  });

  test("renders special order details only when supported by the order", async ({ page }) => {
    const normal = buildOrder({ specialOrder: false });
    const normalResult = await openOrderDetail(page, normal, { invoiceExists: true });
    await expect(normalResult.header.getByTestId("operational-special-order-summary")).toHaveCount(0);

    const specialPage = await page.context().newPage();
    const special = buildOrder({
      id: "phase2a-special-order",
      specialOrder: true,
      customerName: "SOLIDCORE PHASE2A SPECIAL QA DELETE ME",
    });
    const specialResult = await openOrderDetail(specialPage, special, { invoiceExists: true });
    await expect(specialResult.header.getByText("Special Order", { exact: true }).first()).toBeVisible();
    await expect(specialResult.header.getByTestId("operational-special-order-summary")).toContainText(supplier.name);
    await expect(specialResult.header.getByTestId("operational-special-order-summary")).toContainText("ETA 8/15/2026");
    await expect(specialResult.header.getByTestId("operational-special-order-summary")).toContainText("ORDERED");
    await specialPage.close();
  });

  test("page load is read-only for order, invoice, fulfillment, payment, inventory, and reservation routes", async ({ page }) => {
    const order = buildOrder({ status: "CONFIRMED", withFulfillment: true });
    const { writes } = await openOrderDetail(page, order, { invoiceExists: true });

    await page.waitForLoadState("networkidle");
    expect(writes).toEqual([]);
  });

  test("removes duplicate summary and action cards below the operational header", async ({ page }) => {
    const order = buildOrder({ status: "READY", withFulfillment: true });
    const { header, writes } = await openOrderDetail(page, order, { invoiceExists: true });

    await expect(header.getByTestId("operational-financial-summary")).toBeVisible();
    await expect(header.getByTestId("operational-warehouse-summary")).toBeVisible();
    await expect(page.getByTestId("order-detail-unique-info")).toBeVisible();
    await expect(page.getByTestId("order-detail-fulfillment-details")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Order Info" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Financial Summary" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Quick Actions" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fulfillment Snapshot" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Activity" })).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("preserves unique order and fulfillment details without repeating header identity", async ({ page }) => {
    const order = buildOrder({
      status: "READY",
      withFulfillment: true,
      fulfillmentMethod: "DELIVERY",
      deliveryName: "Job Site Foreman",
      deliveryPhone: "808-555-2212",
      deliveryAddress1: "10 Job Site Rd",
      deliveryAddress2: "Unit B",
      deliveryCity: "Honolulu",
      deliveryState: "HI",
      deliveryZip: "96813",
      deliveryNotes: "Use side gate",
      requestedDeliveryAt: "2026-07-22T00:00:00.000Z",
      notes: "Call before unloading",
    });

    const { header } = await openOrderDetail(page, order, { invoiceExists: true });
    const details = page.getByTestId("order-detail-unique-info");
    const fulfillment = page.getByTestId("order-detail-fulfillment-details");

    await expect(details).toContainText("Project");
    await expect(details).toContainText("Header verification");
    await expect(details).toContainText("Salesperson");
    await expect(details).toContainText("Test Salesperson");
    await expect(details).toContainText("Tax Rate");
    await expect(details).toContainText("4.71%");
    await expect(details).toContainText("Delivery Address");
    await expect(details).toContainText("10 Job Site Rd, Unit B, Honolulu, HI, 96813");
    await expect(details).toContainText("Delivery Contact");
    await expect(details).toContainText("Job Site Foreman · 808-555-2212");
    await expect(details).toContainText("Delivery Notes");
    await expect(details).toContainText("Use side gate");
    await expect(details).toContainText("Requested For");
    await expect(details).toContainText("7/22/2026");
    await expect(details).toContainText("Call before unloading");
    await expect(details).not.toContainText(order.customer.name);
    await expect(details).not.toContainText(order.customer.phone ?? "");
    await expect(details).not.toContainText("Warehouse");
    await expect(details).not.toContainText("Order Date");

    await expect(fulfillment).toContainText("Status");
    await expect(fulfillment).toContainText("IN_PROGRESS");
    await expect(fulfillment).toContainText("Partial");
    await expect(fulfillment).toContainText("Progress");
    await expect(fulfillment).toContainText("0/1 items");
    await expect(fulfillment).toContainText("Scheduled");
    await expect(fulfillment).toContainText("7/19/2026");
    await expect(fulfillment).toContainText("Preparation List");
    await expect(fulfillment).toContainText("Delivery Slip");
    await expect(header).toContainText(order.customer.name);
    await expect(header).toContainText(order.customer.phone ?? "");
  });

  test("keeps safe secondary actions reachable from the operational header", async ({ page }) => {
    const order = buildOrder({
      status: "FULFILLED",
      withFulfillment: true,
      fulfillmentStatus: "COMPLETED",
    });
    const { header, writes } = await openOrderDetail(page, order, { invoiceExists: true });

    await expect(header.getByTestId("operational-primary-action")).toHaveText("View Invoice");
    await expect(header.getByRole("button", { name: "View Fulfillment" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Print" })).toHaveAttribute("href", `/orders/${order.id}/print`);
    await expect(header.getByRole("button", { name: "PDF" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Back to Orders" })).toHaveAttribute("href", "/orders");

    await header.getByTestId("operational-primary-action").focus();
    await expect(header.getByTestId("operational-primary-action")).toBeFocused();
    await header.getByTestId("operational-primary-action").click();
    await expect(page).toHaveURL(/\/invoices\/phase2a-invoice$/);
    expect(writes).toEqual([]);
  });

  test("long header content remains usable without horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const order = buildOrder({
      status: "PARTIALLY_FULFILLED",
      withFulfillment: true,
      specialOrder: true,
      customerName: "SOLIDCORE PHASE2A LONG CUSTOMER NAME BUILDING SUPPLY ACCOUNT DELETE ME",
    });

    const { header } = await openOrderDetail(page, order, { invoiceExists: true });
    await expect(header.getByTestId("operational-primary-action")).toBeVisible();
    await expect(header.getByTestId("operational-financial-summary")).toBeVisible();
    await expect(header.getByTestId("operational-warehouse-summary")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
