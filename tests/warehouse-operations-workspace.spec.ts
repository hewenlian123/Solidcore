import { expect, test, type Page } from "@playwright/test";
import {
  countWarehouseMethodSnapshot,
  countWarehouseSections,
  getWarehouseStatusSection,
  isClosedWarehouseStatus,
  isDeliveryHandoffStatus,
  isRowInWarehouseSection,
  normalizeWarehouseStatus,
  rowMatchesWarehouseMethod,
  type WarehouseFulfillmentStatus,
  type WarehouseFulfillmentType,
  type WarehouseMethodFilter,
  type WarehouseSectionId,
} from "../lib/warehouse-queue";

type WriteRequest = {
  method: string;
  pathname: string;
  body: unknown;
};

type MockRow = {
  id: string;
  type: WarehouseFulfillmentType;
  status: WarehouseFulfillmentStatus;
  scheduledAt: string | null;
  timeWindow: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
  itemCount: number;
  itemsCompleted: number;
  orderedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  hasSpecialOrder: boolean;
  specialOrderSummary: {
    status: string | null;
    supplierName: string | null;
    eta: string | null;
    lineCount: number;
  } | null;
  items: Array<{
    id: string;
    title: string;
    sku: string;
    unit: string;
    orderedQty: string;
    fulfilledQty: string;
    remainingQty: string;
    isSpecialOrder: boolean;
    specialOrderStatus: string | null;
    linkedPoNumber: string | null;
    linkedPoStatus: string | null;
    linkedPoEta: string | null;
    supplierName: string | null;
  }>;
};

function mockItem(args: {
  id: string;
  sku: string;
  title: string;
  orderedQty?: string;
  fulfilledQty?: string;
  special?: boolean;
  specialStatus?: string | null;
  supplierName?: string | null;
  eta?: string | null;
}) {
  const ordered = Number(args.orderedQty ?? "1");
  const fulfilled = Number(args.fulfilledQty ?? "0");
  return {
    id: args.id,
    title: args.title,
    sku: args.sku,
    unit: "PIECE",
    orderedQty: args.orderedQty ?? "1",
    fulfilledQty: args.fulfilledQty ?? "0",
    remainingQty: String(Math.max(ordered - fulfilled, 0)),
    isSpecialOrder: Boolean(args.special),
    specialOrderStatus: args.specialStatus ?? null,
    linkedPoNumber: args.special ? "PO-WH-SPECIAL-001" : null,
    linkedPoStatus: args.special ? "ORDERED" : null,
    linkedPoEta: args.eta ?? null,
    supplierName: args.supplierName ?? null,
  };
}

function mockRow(args: {
  id: string;
  type: WarehouseFulfillmentType;
  status: WarehouseFulfillmentStatus;
  orderNumber: string;
  customerName: string;
  item: ReturnType<typeof mockItem>;
  scheduledAt?: string | null;
  timeWindow?: string | null;
  address?: string;
}) {
  const ordered = Number(args.item.orderedQty);
  const fulfilled = Number(args.item.fulfilledQty);
  const hasSpecialOrder = args.item.isSpecialOrder;
  return {
    id: args.id,
    type: args.type,
    status: args.status,
    scheduledAt: args.scheduledAt ?? "2026-07-20T15:00:00.000Z",
    timeWindow: args.timeWindow ?? "8-10 AM",
    salesOrderId: `order-${args.id}`,
    salesOrderNumber: args.orderNumber,
    customerName: args.customerName,
    address: args.address ?? "100 Warehouse Test Way, Honolulu, HI 96813",
    itemCount: 1,
    itemsCompleted: fulfilled >= ordered ? 1 : 0,
    orderedQty: String(ordered),
    fulfilledQty: String(fulfilled),
    remainingQty: String(Math.max(ordered - fulfilled, 0)),
    hasSpecialOrder,
    specialOrderSummary: hasSpecialOrder
      ? {
          status: args.item.specialOrderStatus,
          supplierName: args.item.supplierName,
          eta: args.item.linkedPoEta,
          lineCount: 1,
        }
      : null,
    items: [args.item],
  } satisfies MockRow;
}

function mockRows() {
  return [
    mockRow({
      id: "needs-ready-pickup",
      type: "PICKUP",
      status: "DRAFT",
      orderNumber: "SO-WH-NEEDS-PICKUP",
      customerName: "Counter Pickup Account With A Long Name",
      item: mockItem({ id: "item-pickup", sku: "WH-PREP-001", title: "In Stock Door Casing With Long Description" }),
    }),
    mockRow({
      id: "needs-ready-delivery",
      type: "DELIVERY",
      status: "SCHEDULED",
      orderNumber: "SO-WH-NEEDS-DELIVERY",
      customerName: "Delivery Builder Account",
      item: mockItem({ id: "item-delivery", sku: "WH-DEL-001", title: "Window Trim Bundle" }),
    }),
    mockRow({
      id: "ready-pickup-special",
      type: "PICKUP",
      status: "READY",
      orderNumber: "SO-WH-SPECIAL",
      customerName: "Special Pickup Customer",
      item: mockItem({
        id: "item-special",
        sku: "WH-SPECIAL-777",
        title: "Custom Patio Door",
        special: true,
        specialStatus: "ARRIVED",
        supplierName: "Pacific Materials Supply",
        eta: "2026-08-15T00:00:00.000Z",
      }),
    }),
    mockRow({
      id: "ready-delivery",
      type: "DELIVERY",
      status: "READY",
      orderNumber: "SO-WH-READY-DELIVERY",
      customerName: "Ready Delivery Customer",
      item: mockItem({ id: "item-ready-delivery", sku: "WH-READY-001", title: "Floor Transition Kit" }),
    }),
    mockRow({
      id: "out-delivery",
      type: "DELIVERY",
      status: "OUT_FOR_DELIVERY",
      orderNumber: "SO-WH-OUT-DELIVERY",
      customerName: "Out Delivery Customer",
      item: mockItem({ id: "item-out-delivery", sku: "WH-OUT-001", title: "Delivery Door Slab" }),
    }),
  ];
}

async function mockWarehouseApis(
  page: Page,
  options: { rows?: MockRow[]; failLoad?: boolean; failReady?: boolean; delayReadyMs?: number } = {},
) {
  let rows = [...(options.rows ?? mockRows())];
  const writes: WriteRequest[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === "/api/auth/session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { userId: "test-admin", name: "Test Admin", role: "ADMIN" },
        }),
      });
      return;
    }

    if (url.pathname === "/api/fulfillments/outbound" && method === "GET") {
      if (options.failLoad) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Warehouse queue unavailable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows }),
      });
      return;
    }

    const readyMatch = url.pathname.match(/^\/api\/fulfillments\/([^/]+)$/);
    if (readyMatch && method === "PATCH") {
      const rawBody = request.postData();
      const body = rawBody ? JSON.parse(rawBody) : null;
      writes.push({ method, pathname: url.pathname, body });
      if (options.delayReadyMs) await new Promise((resolve) => setTimeout(resolve, options.delayReadyMs));
      if (options.failReady) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Ready transition failed" }),
        });
        return;
      }
      const id = readyMatch[1];
      rows = rows.map((row) => (row.id === id ? { ...row, status: "READY" } : row));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows.find((row) => row.id === id) }),
      });
      return;
    }

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
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected write request" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });

  return writes;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasOverflow).toBe(false);
}

test.describe("Warehouse Ready queue mapping", () => {
  test("maps actual fulfillment statuses into Pickup and Delivery sections", () => {
    const cases: Array<[WarehouseFulfillmentStatus | "PACKING", WarehouseFulfillmentType, WarehouseSectionId | null]> = [
      ["DRAFT", "PICKUP", "needsReady"],
      ["SCHEDULED", "DELIVERY", "needsReady"],
      ["PARTIAL", "PICKUP", "needsReady"],
      ["READY", "PICKUP", "ready"],
      ["READY", "DELIVERY", "ready"],
      ["OUT_FOR_DELIVERY", "DELIVERY", "inDelivery"],
      ["OUT", "DELIVERY", "inDelivery"],
      ["IN_PROGRESS", "DELIVERY", "inDelivery"],
      ["OUT_FOR_DELIVERY", "PICKUP", null],
      ["DELIVERED", "DELIVERY", null],
      ["PICKED_UP", "PICKUP", null],
      ["COMPLETED", "PICKUP", null],
      ["CANCELLED", "DELIVERY", null],
      ["PACKING", "PICKUP", null],
    ];

    for (const [status, type, expected] of cases) {
      expect(getWarehouseStatusSection(status, type)).toBe(expected);
      const sectionMemberships = (["needsReady", "ready", "inDelivery"] as WarehouseSectionId[]).filter(
        (sectionId) => isRowInWarehouseSection({ type, status }, sectionId),
      );
      expect(sectionMemberships).toEqual(expected ? [expected] : []);
    }

    expect(normalizeWarehouseStatus("PACKING")).toBe("UNKNOWN");
    expect(rowMatchesWarehouseMethod({ type: "PICKUP", status: "READY" }, "pickup")).toBe(true);
    expect(rowMatchesWarehouseMethod({ type: "DELIVERY", status: "READY" }, "delivery")).toBe(true);
    expect(isDeliveryHandoffStatus("OUT_FOR_DELIVERY")).toBe(true);
    expect(isDeliveryHandoffStatus("OUT")).toBe(true);
    expect(isDeliveryHandoffStatus("IN_PROGRESS")).toBe(true);
    expect(isClosedWarehouseStatus("DELIVERED")).toBe(true);

    const rows = mockRows();
    expect(countWarehouseSections(rows, "pickup")).toEqual({ needsReady: 1, ready: 1, inDelivery: 0 });
    expect(countWarehouseSections(rows, "delivery")).toEqual({ needsReady: 1, ready: 1, inDelivery: 1 });
    expect(countWarehouseMethodSnapshot(rows)).toEqual({
      pickupNeedsReady: 1,
      pickupReady: 1,
      deliveryNeedsReady: 1,
      deliveryReady: 1,
      deliveryActive: 1,
    });
  });
});

test.describe("Warehouse Operations workspace UI", () => {
  test("renders Pickup/Delivery tabs, Ready sections, search, special warnings, and Preparation List", async ({ page }) => {
    const writes = await mockWarehouseApis(page);
    await page.goto("/warehouse");
    await expect(page.getByTestId("warehouse-operations-workspace")).toBeVisible();

    await expect(page.getByTestId("warehouse-method-tab-pickup")).toBeVisible();
    await expect(page.getByTestId("warehouse-method-tab-delivery")).toBeVisible();
    await expect(page.getByTestId("warehouse-section-tab-needsReady")).toContainText("1");
    await expect(page.getByTestId("warehouse-section-tab-ready")).toContainText("1");
    await expect(page.getByTestId("warehouse-visible-count")).toHaveText("1 visible");
    await expect(page.getByRole("link", { name: "SO-WH-NEEDS-PICKUP" }).first()).toBeVisible();
    await expect(page.locator('[data-testid="warehouse-primary-action-needs-ready-pickup"]:visible')).toHaveText("Mark Ready");
    await expect(page.locator('[data-testid="warehouse-preparation-list-needs-ready-pickup"]:visible')).toHaveText("Preparation List");

    await expect(page.getByText("Picking")).toHaveCount(0);
    await expect(page.getByText("Packing")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Picking/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Packing/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Pick List/i })).toHaveCount(0);

    await page.getByTestId("warehouse-method-tab-delivery").click();
    await expect(page).toHaveURL(/\/warehouse\?method=delivery&section=needsReady$/);
    await expect(page.getByTestId("warehouse-section-tab-needsReady")).toContainText("1");
    await expect(page.getByTestId("warehouse-section-tab-ready")).toContainText("1");
    await expect(page.getByTestId("warehouse-section-tab-inDelivery")).toContainText("1");
    await expect(page.getByRole("link", { name: "SO-WH-NEEDS-DELIVERY" }).first()).toBeVisible();

    await page.getByTestId("warehouse-section-tab-ready").click();
    await expect(page.getByRole("link", { name: "SO-WH-READY-DELIVERY" }).first()).toBeVisible();
    await expect(page.locator('[data-testid="warehouse-primary-action-ready-delivery"]:visible')).toHaveText("Open Delivery");

    await page.getByTestId("warehouse-section-tab-inDelivery").click();
    await expect(page.getByRole("link", { name: "SO-WH-OUT-DELIVERY" }).first()).toBeVisible();
    await expect(page.locator('[data-testid="warehouse-primary-action-out-delivery"]:visible')).toHaveText("Open Delivery");

    await page.getByTestId("warehouse-method-tab-pickup").click();
    await expect(page.getByTestId("warehouse-section-tab-inDelivery")).toHaveCount(0);
    await page.getByTestId("warehouse-section-tab-ready").click();
    await page.getByLabel("Search orders, customers, SKU, product").fill("WH-SPECIAL-777");
    await expect(page.getByRole("link", { name: "SO-WH-SPECIAL" }).first()).toBeVisible();
    await expect(page.getByText("ARRIVED - Pacific Materials Supply - ETA Aug 15, 2026").first()).toBeVisible();
    await expect(page.locator('[data-testid="warehouse-primary-action-ready-pickup-special"]:visible')).toHaveText("Open Pickup");
    expect(writes).toEqual([]);
  });

  test("marks a Needs Ready task Ready through the canonical fulfillment endpoint", async ({ page }) => {
    const writes = await mockWarehouseApis(page);
    await page.goto("/warehouse?method=pickup&section=needsReady");

    const markReady = page.locator('[data-testid="warehouse-primary-action-needs-ready-pickup"]:visible');
    await expect(markReady).toBeEnabled();
    await markReady.click();
    await expect(page.getByTestId("warehouse-action-status")).toContainText("SO-WH-NEEDS-PICKUP marked Ready.");
    expect(writes).toEqual([
      {
        method: "PATCH",
        pathname: "/api/fulfillments/needs-ready-pickup",
        body: { status: "ready" },
      },
    ]);

    await page.getByTestId("warehouse-section-tab-ready").click();
    await expect(page.getByRole("link", { name: "SO-WH-NEEDS-PICKUP" }).first()).toBeVisible();
  });

  test("handles Mark Ready failure without false success and allows retry", async ({ page }) => {
    const writes = await mockWarehouseApis(page, { failReady: true });
    await page.goto("/warehouse?method=pickup&section=needsReady");

    const markReady = page.locator('[data-testid="warehouse-primary-action-needs-ready-pickup"]:visible');
    await markReady.click();
    await expect(page.getByTestId("warehouse-error")).toContainText("Ready transition failed");
    await expect(page.getByTestId("warehouse-action-status")).toHaveCount(0);
    await expect(markReady).toBeEnabled();
    await expect(page.getByRole("link", { name: "SO-WH-NEEDS-PICKUP" }).first()).toBeVisible();
    expect(writes).toHaveLength(1);
  });

  test("prevents duplicate Mark Ready submits through the normal UI", async ({ page }) => {
    const writes = await mockWarehouseApis(page, { delayReadyMs: 250 });
    await page.goto("/warehouse?method=pickup&section=needsReady");

    const markReady = page.locator('[data-testid="warehouse-primary-action-needs-ready-pickup"]:visible');
    await markReady.dblclick();
    await expect(page.getByTestId("warehouse-action-status")).toContainText("SO-WH-NEEDS-PICKUP marked Ready.");
    expect(writes.filter((request) => request.method === "PATCH")).toHaveLength(1);
  });

  test("preserves URL state, legacy queue links, and old route redirects", async ({ page }) => {
    await mockWarehouseApis(page);
    await page.goto("/warehouse?method=delivery&section=ready&search=READY");
    await expect(page.getByRole("link", { name: "SO-WH-READY-DELIVERY" }).first()).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/warehouse\?method=delivery&section=ready&search=READY$/);

    await page.getByTestId("warehouse-section-tab-needsReady").click();
    await page.getByTestId("warehouse-section-tab-ready").click();
    await page.goBack();
    await expect(page).toHaveURL(/\/warehouse\?method=delivery&section=needsReady&search=READY$/);

    await page.goto("/warehouse?queue=pickup");
    await expect(page).toHaveURL(/\/warehouse\?method=pickup&section=ready$/);
    await expect(page.getByRole("link", { name: "SO-WH-SPECIAL" }).first()).toBeVisible();

    await page.goto("/warehouse?stage=picking&method=all");
    await expect(page).toHaveURL(/\/warehouse\?method=pickup&section=needsReady$/);

    await page.goto("/warehouse/picking");
    await expect(page).toHaveURL(/\/warehouse(?:\?.*)?$/);
    await page.goto("/warehouse/packing");
    await expect(page).toHaveURL(/\/warehouse(?:\?.*)?$/);
  });

  test("shows loading, empty, API failure, and search no-result states", async ({ page }) => {
    await mockWarehouseApis(page, { rows: [] });
    await page.goto("/warehouse");
    await expect(page.getByText("No Warehouse tasks match the current search or filters.").first()).toBeVisible();

    const errorPage = await page.context().newPage();
    await mockWarehouseApis(errorPage, { failLoad: true });
    await errorPage.goto("/warehouse");
    await expect(errorPage.getByTestId("warehouse-error")).toContainText("Warehouse queue unavailable");
    await errorPage.close();

    const noResultPage = await page.context().newPage();
    await mockWarehouseApis(noResultPage);
    await noResultPage.goto("/warehouse");
    await noResultPage.getByLabel("Search orders, customers, SKU, product").fill("NO-SUCH-SKU");
    await expect(noResultPage.getByText("No Warehouse tasks match the current search or filters.").first()).toBeVisible();
    await noResultPage.close();
  });

  test("loads read-only without automatic write requests", async ({ page }) => {
    const writes = await mockWarehouseApis(page);
    await page.goto("/warehouse");
    await expect(page.getByRole("heading", { name: "Operations Workspace" })).toBeVisible();
    await page.getByTestId("warehouse-method-tab-delivery").click();
    await page.getByTestId("warehouse-section-tab-ready").click();
    await page.getByLabel("Search orders, customers, SKU, product").fill("WH-READY-001");
    expect(writes).toEqual([]);
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet landscape", width: 1180, height: 820 },
    { name: "tablet portrait", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`is usable without horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const writes = await mockWarehouseApis(page);
      await page.goto("/warehouse");
      await expect(page.getByRole("heading", { name: "Operations Workspace" })).toBeVisible();
      await expect(page.getByLabel("Search orders, customers, SKU, product")).toBeVisible();
      await expect(page.getByTestId("warehouse-method-tab-pickup")).toBeVisible();
      await expect(page.getByTestId("warehouse-section-tab-needsReady")).toBeVisible();
      await expect(page.locator('[data-testid="warehouse-primary-action-needs-ready-pickup"]:visible')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(writes).toEqual([]);
    });
  }
});
