import { expect, test, type Page } from "@playwright/test";

async function mockAdminSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { userId: "ui-system-admin", name: "UI System Admin", role: "ADMIN" },
      }),
    });
  });
}

async function openUISystem(page: Page) {
  await mockAdminSession(page);
  await page.goto("/ui-system");
  await expect(page.getByRole("heading", { name: "Architectural Warm Minimal" })).toBeVisible();
}

test("UI-1C renders the warm flat foundation without legacy visual treatments", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openUISystem(page);

  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(246, 244, 239)");
  await expect(
    page
      .getByRole("region", { name: "Actions" })
      .getByRole("button", { name: "Create Sale" }),
  ).toHaveCSS("background-color", "rgb(41, 42, 38)");

  const treatments = await page.locator("body").evaluate(() => {
    const elements = Array.from(document.querySelectorAll("*"));
    return {
      gradients: elements.filter((element) => getComputedStyle(element).backgroundImage !== "none")
        .length,
      blurs: elements.filter((element) => {
        const value = getComputedStyle(element).backdropFilter;
        return Boolean(value && value !== "none");
      }).length,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  expect(treatments).toEqual({
    gradients: 0,
    blurs: 0,
    horizontalOverflow: false,
  });
});

test("mobile shell exposes four independent safe-area navigation targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openUISystem(page);

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation).toBeVisible();
  const items = navigation.locator("a,button");
  await expect(items).toHaveCount(4);

  const targets = await items.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        name: element.getAttribute("aria-label") || element.textContent?.trim(),
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  expect(targets.map((target) => target.name)).toEqual([
    "Today",
    "Orders",
    "Inventory",
    "More destinations",
  ]);
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.locator("html").evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test("dialog and navigation sheet trap, dismiss, and restore focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openUISystem(page);

  const dialogTrigger = page.getByRole("button", { name: "Open dialog" });
  await dialogTrigger.click();
  await expect(page.getByRole("dialog", { name: "Confirm change" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Confirm change" })).toHaveCount(0);
  await expect(dialogTrigger).toBeFocused();

  const moreTrigger = page.getByRole("button", { name: "More destinations" });
  await moreTrigger.click();
  await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "More" })).toHaveCount(0);
  await expect(moreTrigger).toBeFocused();
});

test("foundation reflows at a 200 percent desktop zoom equivalent", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await openUISystem(page);

  const result = await page.locator("html").evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    clipped: Array.from(document.querySelectorAll("button,a,p,h1,h2,h3,span")).filter(
      (element) =>
        element.scrollWidth > element.clientWidth + 1 &&
        getComputedStyle(element).overflow !== "hidden",
    ).length,
  }));

  expect(result).toEqual({ overflow: false, clipped: 0 });
});
