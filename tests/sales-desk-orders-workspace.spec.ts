import { expect, test, type Page } from "@playwright/test";

const dashboardData = {
  recentDraftOrders: [
    {
      id: "draft-1",
      orderNumber: "SO-1042",
      projectName: "Kailua remodel",
      customer: "Kea Construction",
      total: 2840,
      itemCount: 4,
      updatedAt: "2026-07-25T20:00:00.000Z",
    },
  ],
  readySalesOrders: [
    {
      id: "ready-1",
      orderNumber: "SO-1038",
      projectName: "Lanikai kitchen",
      customer: "Malia Santos",
      total: 1260,
      itemCount: 3,
      updatedAt: "2026-07-25T18:00:00.000Z",
      status: "READY",
      fulfillmentMethod: "PICKUP",
    },
  ],
  followUpReminders: [
    {
      id: "follow-1",
      followupDate: "2026-07-26T08:00:00.000Z",
      orderId: "follow-order-1",
      orderNumber: "SO-1024",
      customer: "North Shore Build",
      product: "special-order windows",
    },
  ],
  topUnpaidOrders: [
    {
      id: "unpaid-1",
      orderNumber: "SO-1018",
      customer: "Aloha Renovation",
      balanceDue: 480,
    },
  ],
  overdueDeliveries: [],
};

const orderRows = [
  {
    id: "order-1",
    orderNumber: "SO-1042",
    docType: "SALES_ORDER",
    projectName: "Kailua remodel",
    status: "READY",
    total: "2840",
    paidAmount: "1000",
    balanceDue: "1840",
    specialOrder: true,
    specialOrderStatus: "IN_TRANSIT",
    etaDate: "2026-08-04T00:00:00.000Z",
    supplier: { id: "supplier-1", name: "Island Windows" },
    customer: { name: "Kea Construction", phone: "808-555-0112" },
    createdAt: "2026-07-24T00:00:00.000Z",
  },
  {
    id: "order-2",
    orderNumber: "SO-1038",
    docType: "SALES_ORDER",
    projectName: null,
    status: "FULFILLED",
    total: "1260",
    paidAmount: "1260",
    balanceDue: "0",
    specialOrder: false,
    specialOrderStatus: null,
    etaDate: null,
    supplier: null,
    customer: { name: "Malia Santos", phone: "808-555-0184" },
    createdAt: "2026-07-22T00:00:00.000Z",
  },
];

async function mockAdminSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          userId: "workspace-admin",
          name: "SolidCore Owner",
          role: "ADMIN",
        },
      }),
    });
  });
}

async function mockSalesDesk(page: Page) {
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: dashboardData }),
    });
  });
  await page.route("**/api/search/global**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          orders: [],
          customers: [
            {
              id: "customer-1",
              name: "Kea Construction",
              phone: "808-555-0112",
              companyName: "Kea Construction LLC",
            },
          ],
        },
      }),
    });
  });
}

async function mockOrders(page: Page) {
  await page.route("**/api/sales-orders?**", async (route) => {
    const url = new URL(route.request().url());
    const docType = url.searchParams.get("doc_type");
    const data =
      docType === "QUOTE"
        ? [
            {
              ...orderRows[0],
              id: "quote-1",
              orderNumber: "QT-204",
              docType: "QUOTE",
              status: "QUOTED",
            },
          ]
        : orderRows;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

async function visualTreatments(page: Page) {
  return page.locator("body").evaluate(() => {
    const elements = Array.from(document.querySelectorAll("*"));
    return {
      gradients: elements.filter(
        (element) => getComputedStyle(element).backgroundImage !== "none",
      ).length,
      blurs: elements.filter((element) => {
        const value = getComputedStyle(element).backdropFilter;
        return Boolean(value && value !== "none");
      }).length,
      horizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
}

test("root route opens the operational Sales Desk", async ({ page }) => {
  await mockAdminSession(page);
  await mockSalesDesk(page);
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Sales Desk" })).toBeVisible();
});

test("Sales Desk centers current work and removes analytics dashboard noise", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAdminSession(page);
  await mockSalesDesk(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Sales Desk" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Continue Working" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs Attention" }),
  ).toBeVisible();
  await expect(page.getByText("Total Revenue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Sale" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("searchbox", { name: "Search orders or customers" }),
  ).toHaveCount(1);

  await page
    .getByRole("searchbox", { name: "Search orders or customers" })
    .fill("Kea");
  await expect(
    page.getByRole("button", { name: /Kea Construction/ }),
  ).toBeVisible();
  expect(await visualTreatments(page)).toEqual({
    gradients: 0,
    blurs: 0,
    horizontalOverflow: false,
  });
});

test("Orders provides one primary action and status-focused views", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAdminSession(page);
  await mockOrders(page);
  await page.goto("/orders?docType=SALES_ORDER");

  await expect(
    page.getByRole("heading", { name: "Orders", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Sale" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("searchbox", { name: "Search orders" }),
  ).toHaveCount(1);
  await expect(page.getByRole("row", { name: /SO-1042/ })).toBeVisible();

  const readyRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/sales-orders" &&
      url.searchParams.get("status") === "READY"
    );
  });
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await readyRequest;

  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await expect(page).toHaveURL(/docType=QUOTE/);
  await expect(page.getByRole("heading", { name: "Quotes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Quote" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: "Quoted", exact: true }),
  ).toBeVisible();
  expect(await visualTreatments(page)).toEqual({
    gradients: 0,
    blurs: 0,
    horizontalOverflow: false,
  });
});

test("Sales Desk and Orders remain scannable on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockAdminSession(page);
  await mockSalesDesk(page);
  await mockOrders(page);

  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Create Sale" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("navigation", { name: "Primary" }).locator("a,button"),
  ).toHaveCount(4);
  expect(await visualTreatments(page)).toEqual({
    gradients: 0,
    blurs: 0,
    horizontalOverflow: false,
  });

  await page.goto("/orders?docType=SALES_ORDER");
  await expect(
    page.getByRole("button", { name: "Open SO-1042" }),
  ).toBeVisible();
  await expect(page.locator("table")).toBeHidden();
  expect(await visualTreatments(page)).toEqual({
    gradients: 0,
    blurs: 0,
    horizontalOverflow: false,
  });
});
