import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";
const EVIDENCE_DIR = "/tmp/solidcore-release-1";
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
  { label: "ipad-portrait", width: 820, height: 1180 },
  { label: "mobile", width: 390, height: 844 },
] as const;

type RouteEvidence = {
  viewport: string;
  route: string;
  status: number | null;
  finalUrl: string;
  navigationMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  transferSize: number;
  horizontalOverflow: boolean;
  gradients: number;
  backdropBlurs: number;
  coloredShadows: number;
  searchFields: number;
  visiblePrimaryActions: number;
  visiblePrimaryActionDetails: string[];
  mainRegions: number;
  headings: number;
  missingAccessibleNames: number;
  duplicateIds: number;
  imagesWithoutAlt: number;
  undersizedMobileNavigationTargets: number;
  undersizedMobileControls: number;
  undersizedMobileControlDetails: Array<{
    tag: string;
    name: string;
    width: number;
    height: number;
    href: string | null;
  }>;
  runtimeErrors: string[];
  failedResponses: string[];
};

function sessionToken() {
  return createSessionToken({
    userId: "release-acceptance-admin",
    role: "ADMIN",
    name: "Release Acceptance Admin",
  });
}

async function installSession(page: Page) {
  await page.context().addCookies([
    {
      name: getSessionCookieName(),
      value: sessionToken(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}

function percentile(values: number[], percent: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

async function verifyPwaCacheBoundary(browser: Browser) {
  const context = await browser.newContext({
    serviceWorkers: "allow",
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies([
    {
      name: getSessionCookieName(),
      value: sessionToken(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload({ waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const names = await caches.keys();
      await fetch("/api/auth/session");
      await fetch("/manifest.json");
      const cachedUrls = (
        await Promise.all(
          names.map(async (name) => {
            const cache = await caches.open(name);
            return (await cache.keys()).map((request) => request.url);
          }),
        )
      ).flat();

      return {
        controllerActive: Boolean(navigator.serviceWorker.controller),
        workerState: registration.active?.state ?? null,
        cacheNames: names,
        cachedUrls,
        apiCached: cachedUrls.some((url) =>
          new URL(url).pathname.startsWith("/api/"),
        ),
        navigationCached: cachedUrls.some(
          (url) => new URL(url).pathname === "/dashboard",
        ),
        manifestCached: cachedUrls.some(
          (url) => new URL(url).pathname === "/manifest.json",
        ),
      };
    });

    expect(result.controllerActive).toBe(true);
    expect(result.workerState).toBe("activated");
    expect(result.cacheNames).toEqual(["solidcore-static-v2"]);
    expect(result.apiCached).toBe(false);
    expect(result.navigationCached).toBe(false);
    expect(result.manifestCached).toBe(true);
    return result;
  } finally {
    await context.close();
  }
}

test("release acceptance: PWA boundary, responsive UX, accessibility, and performance", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const serviceWorkerSource = readFileSync("public/sw.js", "utf8");
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src?: string; sizes?: string }>;
  };
  expect(serviceWorkerSource).toContain('request.method !== "GET"');
  expect(serviceWorkerSource).toContain('request.mode === "navigate"');
  expect(serviceWorkerSource).toContain('url.pathname.startsWith("/api/")');
  expect(serviceWorkerSource).toContain(
    'url.pathname.startsWith("/_next/static/")',
  );
  expect(manifest).toMatchObject({
    name: "SolidCore",
    start_url: "/dashboard",
    display: "standalone",
  });
  expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);

  const pwa = await verifyPwaCacheBoundary(browser);
  const routeEvidence: RouteEvidence[] = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await installSession(page);

    try {
      for (const route of ROUTES) {
        const runtimeErrors: string[] = [];
        const failedResponses: string[] = [];
        const pageError = (error: Error) => runtimeErrors.push(error.message);
        const consoleError = (message: {
          type(): string;
          text(): string;
          location(): { url?: string };
        }) => {
          if (message.type() !== "error") return;
          const location = message.location();
          runtimeErrors.push(
            `${message.text()}${location.url ? ` @ ${location.url}` : ""}`,
          );
        };
        const failedResponse = (response: {
          status(): number;
          url(): string;
        }) => {
          if (response.status() >= 400) {
            failedResponses.push(`${response.status()} ${response.url()}`);
          }
        };
        page.on("pageerror", pageError);
        page.on("console", consoleError);
        page.on("response", failedResponse);

        const response = await page.goto(`${BASE_URL}${route}`, {
          waitUntil: "networkidle",
        });
        await expect(page.locator("body")).not.toContainText("Sign In");
        await expect(page.locator("body")).not.toContainText(
          /(?:\bPicking\b|\bPacking\b|Store Credit|Barcode|Scanner)/i,
        );

        const audit = await page.locator("body").evaluate(() => {
          const elements = Array.from(
            document.querySelectorAll<HTMLElement>("*"),
          );
          const visible = (element: Element) => {
            const htmlElement = element as HTMLElement;
            const rect = htmlElement.getBoundingClientRect();
            const style = getComputedStyle(htmlElement);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          };
          const accessibleName = (element: HTMLElement) => {
            const labelledBy = element.getAttribute("aria-labelledby");
            const labelledText = labelledBy
              ?.split(/\s+/)
              .map(
                (id) => document.getElementById(id)?.textContent?.trim() ?? "",
              )
              .join(" ")
              .trim();
            if (labelledText) return labelledText;
            const ownId = element.id;
            const explicitLabel = ownId
              ? document.querySelector(`label[for="${CSS.escape(ownId)}"]`)
                  ?.textContent
              : "";
            const wrappedLabel = element.closest("label")?.textContent;
            return (
              element.getAttribute("aria-label") ||
              explicitLabel ||
              wrappedLabel ||
              element.getAttribute("alt") ||
              element.getAttribute("title") ||
              element.textContent ||
              (element as HTMLInputElement).placeholder ||
              ""
            ).trim();
          };
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
          const controls = Array.from(
            document.querySelectorAll<HTMLElement>(
              "button,a[href],input:not([type='hidden']),select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[role='switch'],[role='tab']",
            ),
          ).filter(visible);
          const mobileNavigationItems = Array.from(
            document.querySelectorAll<HTMLElement>(
              "nav[aria-label='Primary'] a, nav[aria-label='Primary'] button",
            ),
          ).filter(visible);
          const undersized = (element: HTMLElement, minimum: number) => {
            const target =
              element.tagName === "INPUT" && element.closest("label")
                ? (element.closest("label") as HTMLElement)
                : element;
            const rect = target.getBoundingClientRect();
            return rect.width < minimum || rect.height < minimum;
          };
          const undersizedMobileControlDetails =
            window.innerWidth < 768
              ? controls
                  .filter((element) => undersized(element, 24))
                  .map((element) => {
                    const target =
                      element.tagName === "INPUT" && element.closest("label")
                        ? (element.closest("label") as HTMLElement)
                        : element;
                    const rect = target.getBoundingClientRect();
                    return {
                      tag: element.tagName,
                      name: accessibleName(element),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height),
                      href: element.getAttribute("href"),
                    };
                  })
              : [];
          const ids = elements
            .map((element) => element.id)
            .filter((id): id is string => Boolean(id));
          const uniqueIds = new Set(ids);
          const navigation = performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined;
          const visiblePrimaryActionDetails = elements
            .filter((element) => {
              if (!visible(element)) return false;
              const style = getComputedStyle(element);
              return (
                (element.tagName === "BUTTON" || element.tagName === "A") &&
                style.backgroundColor === "rgb(41, 42, 38)"
              );
            })
            .map(accessibleName);

          return {
            navigationMs: Math.round(navigation?.duration ?? 0),
            domContentLoadedMs: Math.round(
              navigation?.domContentLoadedEventEnd ?? 0,
            ),
            loadMs: Math.round(navigation?.loadEventEnd ?? 0),
            transferSize: navigation?.transferSize ?? 0,
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
            visiblePrimaryActions: visiblePrimaryActionDetails.length,
            visiblePrimaryActionDetails,
            mainRegions: document.querySelectorAll("main,[role='main']").length,
            headings: elements.filter(
              (element) => visible(element) && /^H[1-6]$/.test(element.tagName),
            ).length,
            missingAccessibleNames: controls.filter(
              (element) => !accessibleName(element),
            ).length,
            duplicateIds: ids.length - uniqueIds.size,
            imagesWithoutAlt: Array.from(
              document.querySelectorAll<HTMLImageElement>("img"),
            ).filter(
              (image) =>
                visible(image) &&
                !image.hasAttribute("alt") &&
                image.getAttribute("role") !== "presentation",
            ).length,
            undersizedMobileNavigationTargets:
              window.innerWidth < 768
                ? mobileNavigationItems.filter((element) =>
                    undersized(element, 44),
                  ).length
                : 0,
            undersizedMobileControls: undersizedMobileControlDetails.length,
            undersizedMobileControlDetails,
          };
        });

        await page.keyboard.press("Tab");
        const focusLanded = await page.evaluate(
          () =>
            document.activeElement !== document.body &&
            document.activeElement !== document.documentElement,
        );

        routeEvidence.push({
          viewport: viewport.label,
          route,
          status: response?.status() ?? null,
          finalUrl: page.url(),
          ...audit,
          runtimeErrors,
          failedResponses,
        });

        expect
          .soft(response?.status(), `${viewport.label} ${route} status`)
          .toBe(200);
        expect
          .soft(audit.horizontalOverflow, `${viewport.label} ${route} overflow`)
          .toBe(false);
        expect
          .soft(audit.gradients, `${viewport.label} ${route} gradients`)
          .toBe(0);
        expect
          .soft(audit.backdropBlurs, `${viewport.label} ${route} backdrop blur`)
          .toBe(0);
        expect
          .soft(
            audit.coloredShadows,
            `${viewport.label} ${route} colored shadows`,
          )
          .toBe(0);
        expect
          .soft(audit.searchFields, `${viewport.label} ${route} search fields`)
          .toBeLessThanOrEqual(1);
        expect
          .soft(audit.mainRegions, `${viewport.label} ${route} main landmark`)
          .toBeGreaterThanOrEqual(1);
        expect
          .soft(audit.headings, `${viewport.label} ${route} headings`)
          .toBeGreaterThanOrEqual(1);
        expect
          .soft(
            audit.missingAccessibleNames,
            `${viewport.label} ${route} accessible names`,
          )
          .toBe(0);
        expect
          .soft(audit.duplicateIds, `${viewport.label} ${route} duplicate IDs`)
          .toBe(0);
        expect
          .soft(audit.imagesWithoutAlt, `${viewport.label} ${route} image alt`)
          .toBe(0);
        expect
          .soft(
            audit.undersizedMobileNavigationTargets,
            `${viewport.label} ${route} mobile navigation targets`,
          )
          .toBe(0);
        expect
          .soft(
            audit.undersizedMobileControlDetails,
            `${viewport.label} ${route} mobile control targets`,
          )
          .toEqual([]);
        expect
          .soft(focusLanded, `${viewport.label} ${route} keyboard focus`)
          .toBe(true);
        expect
          .soft(runtimeErrors, `${viewport.label} ${route} runtime errors`)
          .toEqual([]);
        expect
          .soft(failedResponses, `${viewport.label} ${route} failed responses`)
          .toEqual([]);

        page.off("pageerror", pageError);
        page.off("console", consoleError);
        page.off("response", failedResponse);
      }
    } finally {
      await context.close();
    }
  }

  const navigationTimes = routeEvidence.map((entry) => entry.navigationMs);
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    readOnlyBusinessAudit: true,
    routeCount: ROUTES.length,
    viewportCount: VIEWPORTS.length,
    sampleCount: routeEvidence.length,
    performance: {
      medianNavigationMs: percentile(navigationTimes, 50),
      p95NavigationMs: percentile(navigationTimes, 95),
      maxNavigationMs: Math.max(...navigationTimes),
    },
    pwa,
    totals: {
      runtimeErrors: routeEvidence.reduce(
        (sum, entry) => sum + entry.runtimeErrors.length,
        0,
      ),
      failedResponses: routeEvidence.reduce(
        (sum, entry) => sum + entry.failedResponses.length,
        0,
      ),
      overflow: routeEvidence.filter((entry) => entry.horizontalOverflow)
        .length,
      gradients: routeEvidence.reduce((sum, entry) => sum + entry.gradients, 0),
      backdropBlurs: routeEvidence.reduce(
        (sum, entry) => sum + entry.backdropBlurs,
        0,
      ),
      coloredShadows: routeEvidence.reduce(
        (sum, entry) => sum + entry.coloredShadows,
        0,
      ),
      missingAccessibleNames: routeEvidence.reduce(
        (sum, entry) => sum + entry.missingAccessibleNames,
        0,
      ),
      duplicateIds: routeEvidence.reduce(
        (sum, entry) => sum + entry.duplicateIds,
        0,
      ),
      imagesWithoutAlt: routeEvidence.reduce(
        (sum, entry) => sum + entry.imagesWithoutAlt,
        0,
      ),
      undersizedMobileNavigationTargets: routeEvidence.reduce(
        (sum, entry) => sum + entry.undersizedMobileNavigationTargets,
        0,
      ),
      undersizedMobileControls: routeEvidence.reduce(
        (sum, entry) => sum + entry.undersizedMobileControls,
        0,
      ),
    },
    routes: routeEvidence,
  };

  expect(summary.performance.p95NavigationMs).toBeLessThan(3_000);
  writeFileSync(
    `${EVIDENCE_DIR}/release-acceptance.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
});
