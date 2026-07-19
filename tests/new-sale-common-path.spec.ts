import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

type WriteRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

const customer = {
  id: "customer-1",
  name: "Test Customer",
  phone: "808-555-0100",
  email: "customer@example.com",
  installAddress: "123 Test Street",
  billingAddress: "123 Test Street",
  taxExempt: false,
  taxRate: 4.712,
};

const product = {
  id: "variant-1",
  productId: "product-1",
  name: "Test Tile",
  title: "Test Tile",
  sku: "TILE-001",
  generatedDescription: "12 x 24 porcelain tile",
  variantDescription: "12 x 24",
  defaultDescription: null,
  brand: "SolidCore",
  collection: "Flooring",
  availableStock: "50",
  unit: "pcs",
  sellingUnit: "PIECE",
  flooringBoxCoverageSqft: null,
  price: "10.00",
  imageUrl: null,
  category: "Flooring",
};

function readAuthSessionSecret() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("AUTH_SESSION_SECRET="));
    if (!match) continue;
    const value = match.slice(match.indexOf("=") + 1).trim();
    return value.replace(/^["']|["']$/g, "");
  }
  return null;
}

function createSessionCookie() {
  const payload = {
    userId: "test-admin",
    role: "ADMIN",
    name: "Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const secret =
    process.env.AUTH_SESSION_SECRET ||
    readAuthSessionSecret() ||
    "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

type MockNewSaleOptions = {
  orderId?: string;
  statusGate?: Promise<void>;
  statusFailure?: { status?: number; error: string };
};

async function mockNewSaleApis(
  page: Page,
  writes: WriteRequest[],
  options: MockNewSaleOptions = {},
) {
  const orderId = options.orderId ?? "mock-order-1";
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method !== "GET") {
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

      if (url.pathname === `/api/sales-orders/${orderId}/status`) {
        if (options.statusGate) await options.statusGate;
        if (options.statusFailure) {
          await route.fulfill({
            status: options.statusFailure.status ?? 500,
            contentType: "application/json",
            body: JSON.stringify({ error: options.statusFailure.error }),
          });
          return;
        }
        const status =
          body && typeof body === "object" && "status" in body
            ? (body as { status?: string }).status
            : undefined;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: orderId, status } }),
        });
        return;
      }

      if (url.pathname === "/api/sales-orders" && method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: { id: orderId } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: orderId } }),
      });
      return;
    }

    let data: unknown = [];
    if (url.pathname === "/api/auth/session") {
      data = { userId: "test-admin", name: "Test Admin", role: "ADMIN" };
    } else if (url.pathname === "/api/customers") {
      data = [customer];
    } else if (url.pathname === "/api/sales-orders/products") {
      data = [product];
    } else if (url.pathname === "/api/sales-orders/salespeople") {
      data = [{ id: "salesperson-1", name: "Test Salesperson" }];
    } else if (url.pathname === "/api/settings/company") {
      data = { defaultTaxRate: 4.712 };
    } else if (url.pathname === "/api/products/search") {
      data = [
        {
          id: product.id,
          productId: product.productId,
          name: product.name,
          sku: product.sku,
          imageUrl: null,
          salePrice: 10,
          onHand: 50,
          unit: "pcs",
          reorderLevel: 5,
        },
      ];
    } else if (url.pathname === `/api/sales-orders/${orderId}`) {
      data = {
        id: orderId,
        orderNumber: "SO-MOCK",
        docType: "SALES_ORDER",
        status: "CONFIRMED",
        customer,
        items: [],
        payments: [],
        fulfillments: [],
        outboundQueue: null,
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        createdAt: new Date().toISOString(),
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

async function openNewSale(page: Page, query = "") {
  await page.goto(`/sales-orders/new${query}`);
  await expect(page.getByTestId("new-sale-mode")).toBeVisible();
  await expect(page.getByLabel("Customer search")).toBeVisible();
}

test("sales order APIs reject empty and non-positive quantities before persistence", async ({
  request,
}) => {
  const headers = { Cookie: createSessionCookie() };
  const emptyOrder = await request.post("/api/sales-orders", {
    headers,
    data: { customerId: "customer-1", fulfillmentMethod: "PICKUP", items: [] },
  });
  await expect(emptyOrder).not.toBeOK();
  expect(emptyOrder.status()).toBe(400);
  await expect(emptyOrder.json()).resolves.toMatchObject({
    error: "Add at least one line item before saving.",
  });

  const zeroQuantityOrder = await request.post("/api/sales-orders", {
    headers,
    data: {
      customerId: "customer-1",
      fulfillmentMethod: "PICKUP",
      items: [{ variantId: "variant-1", quantity: 0 }],
    },
  });
  await expect(zeroQuantityOrder).not.toBeOK();
  expect(zeroQuantityOrder.status()).toBe(400);
  await expect(zeroQuantityOrder.json()).resolves.toMatchObject({
    error: "Each line item quantity must be greater than zero.",
  });

  const zeroQuantityItemUpdate = await request.patch(
    "/api/sales-orders/order-1/items/item-1",
    {
      headers,
      data: { quantity: 0 },
    },
  );
  await expect(zeroQuantityItemUpdate).not.toBeOK();
  expect(zeroQuantityItemUpdate.status()).toBe(400);
  await expect(zeroQuantityItemUpdate.json()).resolves.toMatchObject({
    error: "Quantity must be greater than 0.",
  });
});

async function selectCustomer(page: Page) {
  const search = page.getByLabel("Customer search");
  await search.fill("Test Customer");
  await page.getByRole("button", { name: /Test Customer/ }).click();
  await expect(search).toHaveValue("Test Customer");
}

async function addProduct(page: Page) {
  await page.getByRole("button", { name: "Add Test Tile to cart" }).click();
  await expect(
    page.getByText("Test Tile", { exact: false }).first(),
  ).toBeVisible();
}

async function preparePopulatedSale(page: Page) {
  await selectCustomer(page);
  await addProduct(page);
}

function writesFor(
  writes: WriteRequest[],
  method: string,
  pathname: string,
) {
  return writes.filter(
    (write) => write.method === method && write.pathname === pathname,
  );
}

function statusWrites(writes: WriteRequest[], orderId = "mock-order-1") {
  return writesFor(writes, "PATCH", `/api/sales-orders/${orderId}/status`);
}

test("quote and sales-order modes expose the correct single primary action", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  await mockNewSaleApis(page, writes);

  await openNewSale(page, "?docType=QUOTE");
  await expect(page.getByTestId("new-sale-mode")).toHaveText("New Quote");
  await expect(page.getByTestId("primary-sale-action")).toHaveText(
    /Save Quote/,
  );
  await expect(page.getByRole("button", { name: "Confirm Order" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("primary-action-area")).toHaveCount(1);
  expect(writes).toEqual([]);

  await openNewSale(page, "?docType=SALES_ORDER");
  await expect(page.getByTestId("new-sale-mode")).toHaveText("New Sales Order");
  await expect(page.getByTestId("primary-sale-action")).toHaveText(
    /Confirm Order/,
  );
  await expect(page.getByTestId("primary-action-area")).toHaveCount(1);
  expect(writes).toEqual([]);
});

test("the common path stays visible and delivery details use progressive disclosure", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  await mockNewSaleApis(page, writes);
  await openNewSale(page);

  await expect(page.getByLabel("Customer search")).toBeVisible();
  await expect(page.getByLabel("Product or SKU search")).toBeVisible();
  await expect(page.getByText("Cart is empty")).toBeVisible();
  await expect(page.getByTestId("totals-summary")).toContainText("Subtotal");
  await expect(page.getByTestId("totals-summary")).toContainText("Tax");
  await expect(page.getByTestId("totals-summary")).toContainText("Total");

  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByPlaceholder("Street address")).toHaveCount(0);
  await page.getByRole("button", { name: "Close details" }).click();

  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByPlaceholder("Street address")).toBeVisible();
  await expect(page.getByPlaceholder("City")).toBeVisible();
  await expect(page.getByPlaceholder("State")).toBeVisible();
  await expect(page.getByPlaceholder("Zip")).toBeVisible();
  expect(writes).toEqual([]);
});

test("client validation blocks empty and non-positive lines before any write", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  await mockNewSaleApis(page, writes);
  await openNewSale(page);
  await selectCustomer(page);

  await page.getByTestId("primary-sale-action").click();
  await expect(page.locator(".so-entry-page [role='alert']")).toContainText(
    "Add at least one line item",
  );
  expect(writes).toEqual([]);

  await addProduct(page);
  const quantity = page.getByLabel(/Quantity for Test Tile/);
  await quantity.fill("0");
  await page.getByTestId("primary-sale-action").click();
  await expect(page.locator(".so-entry-page [role='alert']")).toContainText(
    "quantity must be greater than zero",
  );
  expect(writes).toEqual([]);

  await quantity.fill("");
  await page.getByTestId("primary-sale-action").click();
  await expect(page.locator(".so-entry-page [role='alert']")).toContainText(
    "quantity must be greater than zero",
  );
  expect(writes).toEqual([]);

  await quantity.fill("1");
  expect(writes).toEqual([]);
});

test("quote save waits for QUOTED status success before redirecting", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  let releaseStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  await mockNewSaleApis(page, writes, { statusGate });
  await openNewSale(page, "?docType=QUOTE");
  await preparePopulatedSale(page);

  const click = page.getByTestId("primary-sale-action").click();
  await expect.poll(() => writesFor(writes, "POST", "/api/sales-orders").length).toBe(1);
  await expect.poll(() => statusWrites(writes).length).toBe(1);
  await expect(page).toHaveURL(/\/sales-orders\/new\?docType=QUOTE$/);

  releaseStatus();
  await click;
  await expect(page).toHaveURL(/\/orders\/mock-order-1$/);
  expect(page.url()).not.toContain("status=confirmed");
  expect(writesFor(writes, "POST", "/api/sales-orders")).toHaveLength(1);
  expect(statusWrites(writes)).toHaveLength(1);
  expect(statusWrites(writes)[0]?.body).toMatchObject({ status: "QUOTED" });
  await expect(
    page.getByText("Sales Order created and confirmed."),
  ).toHaveCount(0);
});

test("sales order confirm waits for CONFIRMED status success before redirecting", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  await mockNewSaleApis(page, writes);
  await openNewSale(page, "?docType=SALES_ORDER");
  await preparePopulatedSale(page);

  await Promise.all([
    page.waitForURL("**/orders/mock-order-1?created=1&status=confirmed"),
    page.getByTestId("primary-sale-action").click(),
  ]);

  expect(writesFor(writes, "POST", "/api/sales-orders")).toHaveLength(1);
  expect(statusWrites(writes)).toHaveLength(1);
  expect(statusWrites(writes)[0]?.body).toMatchObject({ status: "CONFIRMED" });
});

test("quote status failure keeps the user on the entry page with a draft link", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  await mockNewSaleApis(page, writes, {
    statusFailure: { error: "Status transition is not allowed." },
  });
  await openNewSale(page, "?docType=QUOTE");
  await preparePopulatedSale(page);

  await page.getByTestId("primary-sale-action").click();

  await expect(page).toHaveURL(/\/sales-orders\/new\?docType=QUOTE$/);
  await expect(page.locator(".so-entry-page [role='alert']")).toContainText(
    "The Quote draft was created, but it could not be marked as quoted.",
  );
  await expect(page.getByRole("link", { name: "Open draft" })).toHaveAttribute(
    "href",
    "/orders/mock-order-1",
  );
  await expect(page.getByTestId("primary-sale-action")).toBeEnabled();
  await expect(page.getByTestId("primary-sale-action")).toHaveText(/Save Quote/);
  await expect(page.getByText("Sales Order created and confirmed.")).toHaveCount(
    0,
  );
  expect(writesFor(writes, "POST", "/api/sales-orders")).toHaveLength(1);
  expect(statusWrites(writes)).toHaveLength(1);
});

test("sales order confirmation failure keeps the draft and does not redirect as confirmed", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  await mockNewSaleApis(page, writes, {
    statusFailure: { error: "Insufficient stock." },
  });
  await openNewSale(page, "?docType=SALES_ORDER");
  await preparePopulatedSale(page);

  await page.getByTestId("primary-sale-action").click();

  await expect(page).toHaveURL(/\/sales-orders\/new\?docType=SALES_ORDER$/);
  await expect(page.locator(".so-entry-page [role='alert']")).toContainText(
    "The Sales Order draft was created, but confirmation failed.",
  );
  await expect(page.getByRole("link", { name: "Open draft" })).toHaveAttribute(
    "href",
    "/orders/mock-order-1",
  );
  await expect(page.getByTestId("primary-sale-action")).toBeEnabled();
  await expect(page.getByTestId("primary-sale-action")).toHaveText(
    /Confirm Order/,
  );
  expect(page.url()).not.toContain("status=confirmed");
  expect(writesFor(writes, "POST", "/api/sales-orders")).toHaveLength(1);
  expect(statusWrites(writes)).toHaveLength(1);
});

test("rapid repeated primary clicks do not issue duplicate creates", async ({
  page,
}) => {
  const writes: WriteRequest[] = [];
  let releaseStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  await mockNewSaleApis(page, writes, { statusGate });
  await openNewSale(page, "?docType=SALES_ORDER");
  await preparePopulatedSale(page);

  const button = page.getByTestId("primary-sale-action");
  const firstClick = button.click();
  await expect.poll(() => writesFor(writes, "POST", "/api/sales-orders").length).toBe(1);
  await button.click({ timeout: 500 }).catch(() => undefined);
  expect(writesFor(writes, "POST", "/api/sales-orders")).toHaveLength(1);

  releaseStatus();
  await firstClick;
  await expect(page).toHaveURL(
    /\/orders\/mock-order-1\?created=1&status=confirmed$/,
  );
  expect(writesFor(writes, "POST", "/api/sales-orders")).toHaveLength(1);
  expect(statusWrites(writes)).toHaveLength(1);
});

const viewports = [
  { name: "desktop", width: 1440, height: 900, direction: "row" },
  { name: "ipad-landscape", width: 1180, height: 820, direction: "row" },
  { name: "ipad-portrait", width: 820, height: 1180, direction: "column" },
  { name: "mobile", width: 390, height: 844, direction: "column" },
] as const;

for (const viewport of viewports) {
  test(`${viewport.name} keeps the common path usable without horizontal overflow`, async ({
    page,
  }) => {
    const writes: WriteRequest[] = [];
    const consoleErrors: string[] = [];
    const httpErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        httpErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await mockNewSaleApis(page, writes);
    await openNewSale(page);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.getByLabel("Customer search")).toBeVisible();
    await expect(page.getByLabel("Product or SKU search")).toBeVisible();
    await expect(page.getByText("Cart is empty")).toBeVisible();
    await expect(page.getByTestId("totals-summary")).toBeVisible();
    await expect(page.getByTestId("primary-sale-action")).toBeVisible();

    const workspaceDirection = await page
      .getByTestId("new-sale-workspace")
      .evaluate((element) => getComputedStyle(element).flexDirection);
    expect(workspaceDirection).toBe(viewport.direction);

    const primaryBox = await page
      .getByTestId("primary-sale-action")
      .boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(primaryBox!.height).toBeGreaterThanOrEqual(44);
    expect(primaryBox!.x).toBeGreaterThanOrEqual(0);
    expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(
      viewport.width,
    );

    await page.getByPlaceholder("Search products...").scrollIntoViewIfNeeded();
    await expect(page.getByPlaceholder("Search products...")).toBeVisible();
    await page.getByRole("button", { name: "Add Test Tile to cart" }).click();
    const quantity = page.getByLabel(/Quantity for Test Tile/);
    await quantity.scrollIntoViewIfNeeded();
    await expect(quantity).toBeVisible();
    const populatedDimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(populatedDimensions.scrollWidth).toBeLessThanOrEqual(
      populatedDimensions.clientWidth,
    );
    expect(writes).toEqual([]);
    expect(consoleErrors, `HTTP errors: ${httpErrors.join(", ")}`).toEqual([]);

    await page.screenshot({
      path: `/private/tmp/solidcore-new-sale-${viewport.name}.png`,
      fullPage: false,
    });
  });
}
