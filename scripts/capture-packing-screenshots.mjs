import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

function tsSlug(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-");
}

async function tryClickFirst(page, patterns) {
  for (const re of patterns) {
    const btn = page.getByRole("button", { name: re }).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 2000 });
        return { clicked: true, pattern: String(re) };
      } catch {
        // keep trying other candidates
      }
    }

    const link = page.getByRole("link", { name: re }).first();
    if (await link.count()) {
      try {
        await link.click({ timeout: 2000 });
        return { clicked: true, pattern: String(re) };
      } catch {
        // keep trying other candidates
      }
    }
  }
  return { clicked: false };
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3001";
  const outDir = process.env.OUT_DIR ?? path.join(process.cwd(), "artifacts", "warehouse-packing");
  const stamp = tsSlug();

  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const url = `${baseUrl.replace(/\/$/, "")}/warehouse/packing`;

  const result = {
    url,
    screenshots: {},
    notes: [],
  };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(800);

    const loadingSession = page.getByText(/loading session/i);
    if (await loadingSession.count()) {
      result.notes.push("Saw “Loading session…”; waiting up to 20s for it to finish.");
      await loadingSession.waitFor({ state: "detached", timeout: 20000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(600);
    }

    const looksLikeLogin =
      (await page.locator('input[type="password"]').count()) > 0 ||
      (await page.getByRole("heading", { name: /login|log in|sign in/i }).count()) > 0 ||
      (await page.getByRole("button", { name: /log in|sign in/i }).count()) > 0;

    if (looksLikeLogin) {
      result.notes.push("Landed on a login-like screen; attempting obvious demo/default actions.");

      const clickAttempt = await tryClickFirst(page, [
        /continue as demo/i,
        /use demo/i,
        /demo/i,
        /continue/i,
        /enter app/i,
        /open dashboard/i,
        /log in/i,
        /sign in/i,
      ]);

      if (clickAttempt.clicked) {
        result.notes.push(`Clicked an auth affordance matching ${clickAttempt.pattern}.`);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1200);
      } else {
        result.notes.push("No obvious demo/default login buttons found to proceed.");
      }
    }

    const shot1 = path.join(outDir, `packing-as-is-${stamp}.png`);
    await page.screenshot({ path: shot1, fullPage: true });
    result.screenshots.asIs = shot1;

    const checklistButtons = page.getByRole("button", { name: /checklist/i });
    const checklistCount = await checklistButtons.count();

    if (checklistCount > 0) {
      result.notes.push(`Found ${checklistCount} “Checklist” button(s); expanding the first row.`);
      try {
        await checklistButtons.first().click({ timeout: 5000 });
        await page.waitForTimeout(900);

        const shot2 = path.join(outDir, `packing-checklist-expanded-${stamp}.png`);
        await page.screenshot({ path: shot2, fullPage: true });
        result.screenshots.checklistExpanded = shot2;
      } catch (e) {
        result.notes.push(`Tried to expand checklist but clicking failed: ${String(e)}`);
      }
    } else {
      result.notes.push("No “Checklist” button found (likely empty state or different UI).");
    }
  } finally {
    await browser.close();
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
