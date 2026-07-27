import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createSessionToken, getSessionCookieName } from "../lib/auth-session";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

const ROUTES = [
  "/dashboard",
  "/orders",
  "/sales-orders/new?docType=SALES_ORDER",
  "/customers",
  "/products",
  "/inventory",
  "/warehouse",
  "/purchasing/receiving",
  "/invoices",
  "/after-sales/returns",
  "/settings",
  "/ui-system",
] as const;

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "ipad-landscape", width: 1024, height: 768 },
  { label: "ipad-portrait", width: 820, height: 1180 },
  { label: "mobile", width: 390, height: 844 },
  { label: "small-mobile", width: 360, height: 800 },
] as const;

async function installSession(page: Page) {
  const token = createSessionToken({
    userId: "phase10-product-convergence-admin",
    role: "ADMIN",
    name: "Phase 10 Synthetic Owner",
  });
  await page.context().addCookies([
    {
      name: getSessionCookieName(),
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}

test.describe("product-wide local convergence", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.label} primary routes stay warm, quiet, and usable`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installSession(page);

      const runtimeErrors: string[] = [];
      const failedResponses: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          const location = message.location();
          runtimeErrors.push(
            `${message.text()}${location.url ? ` @ ${location.url}` : ""}`,
          );
        }
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          failedResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("body")).not.toContainText("Sign In");
        await expect(page.locator("body")).not.toContainText(
          "Base framework initialized",
        );
        await expect(page.locator("body")).not.toContainText(
          /(?:\bPicking\b|\bPacking\b|Store Credit|Barcode|Scanner)/i,
        );

        const audit = await page.locator("body").evaluate(() => {
          const elements = Array.from(document.querySelectorAll("*"));
          const coloredShadow = (value: string) => {
            const colors = Array.from(
              value.matchAll(
                /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+[\d.]+)?\s*\)/g,
              ),
            );
            return colors.some((match) => {
              const channels = match.slice(1, 4).map(Number);
              return Math.max(...channels) - Math.min(...channels) > 55;
            });
          };
          const mobileNavigationItems = Array.from(
            document.querySelectorAll(
              "nav[aria-label='Primary'] a, nav[aria-label='Primary'] button",
            ),
          );
          return {
            horizontalOverflow:
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth,
            gradients: elements.filter(
              (element) => getComputedStyle(element).backgroundImage !== "none",
            ).length,
            backdropBlurs: elements.filter((element) => {
              const value = getComputedStyle(element).backdropFilter;
              return Boolean(value && value !== "none");
            }).length,
            coloredShadows: elements.filter((element) =>
              coloredShadow(getComputedStyle(element).boxShadow),
            ).length,
            searchFields: document.querySelectorAll(
              "input[type='search'],[role='searchbox']",
            ).length,
            tooSmallNavigationTargets:
              window.innerWidth < 768
                ? mobileNavigationItems.filter((element) => {
                    const rect = element.getBoundingClientRect();
                    return (
                      rect.width > 0 &&
                      rect.height > 0 &&
                      (rect.width < 44 || rect.height < 44)
                    );
                  }).length
                : 0,
            reducedMotionDuration: getComputedStyle(document.body)
              .transitionDuration,
          };
        });

        expect(audit, `${viewport.label} ${route}`).toMatchObject({
          horizontalOverflow: false,
          gradients: 0,
          backdropBlurs: 0,
          coloredShadows: 0,
        });
        expect(
          audit.searchFields,
          `${viewport.label} ${route} search budget`,
        ).toBeLessThanOrEqual(1);
        expect(
          audit.tooSmallNavigationTargets,
          `${viewport.label} ${route} touch targets`,
        ).toBe(0);
      }

      expect(runtimeErrors, `${viewport.label} runtime errors`).toEqual([]);
      expect(failedResponses, `${viewport.label} failed responses`).toEqual(
        [],
      );
    });
  }
});
