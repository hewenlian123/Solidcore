import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const TARGET_PATH = "/warehouse/packing";
const CHROME_PATH =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loginViaApi(page) {
  const res = await fetch(new URL("/api/auth/login", BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  // eslint-disable-next-line no-console
  console.log("loginViaApi status:", res.status, "set-cookie:", Boolean(res.headers.get("set-cookie")));
  if (!res.ok) return false;
  const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
  const setCookies = getSetCookie ? getSetCookie() : [];
  const fallback = res.headers.get("set-cookie");
  const cookieHeaders = setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];
  if (cookieHeaders.length === 0) return false;

  for (const header of cookieHeaders) {
    const first = String(header || "").split(";")[0] || "";
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const name = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    if (!name) continue;
    await page.setCookie({ name, value, domain: "127.0.0.1", path: "/" });
  }
  return true;
}

async function main() {
  const outDir = path.join(process.cwd(), "artifacts", "phase2");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(60000);

    const url = new URL(TARGET_PATH, BASE_URL).toString();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for session to resolve (AppShell shows "Loading session..." while fetching /api/auth/session).
    await page
      .waitForFunction(() => !document.body.innerText.includes("Loading session"), { timeout: 60000 })
      .catch(() => undefined);

    // If we ended up at login after session resolution, authenticate (demo) and retry.
    if (new URL(page.url()).pathname === "/login") {
      const apiLoggedIn = await loginViaApi(page);
      if (apiLoggedIn) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page
          .waitForFunction(() => !document.body.innerText.includes("Loading session"), { timeout: 60000 })
          .catch(() => undefined);
      }
    }

    // Prefer waiting for the page header to render.
    await page
      .waitForFunction(() => document.body.innerText.includes("Packing"), { timeout: 30000 })
      .catch(() => undefined);

    await sleep(750);

    const shot1 = path.join(outDir, "packing-01.png");
    await page.screenshot({ path: shot1, fullPage: true });

    const clicked = await page.$$eval("button", (buttons) => {
      const match = buttons.find((b) => (b.textContent || "").trim().toLowerCase() === "checklist");
      if (!match) return false;
      match.click();
      return true;
    });

    let shot2 = null;
    if (clicked) {
      await sleep(900);
      shot2 = path.join(outDir, "packing-02-checklist.png");
      await page.screenshot({ path: shot2, fullPage: true });
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          url: page.url(),
          checklistExpanded: Boolean(clicked),
          screenshots: [shot1, shot2].filter(Boolean),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

await main();

