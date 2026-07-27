import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function loadLocalEnv() {
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
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(
      "Refusing to run customer workspace tests outside the local database.",
    );
  }
}

function sessionToken(role: "ADMIN" | "SALES" | "WAREHOUSE" = "ADMIN") {
  const payload = {
    userId: `customer-workspace-${role.toLowerCase()}`,
    role,
    name: role === "ADMIN" ? "Test Owner" : `Test ${role}`,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const secret =
    process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function authenticate(page: Page) {
  await page.context().addCookies([
    {
      name: "solidcore_session",
      value: sessionToken(),
      url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

loadLocalEnv();
assertLocalDatabase();

const prisma = new PrismaClient();
const runId = randomUUID();
const customerName = `Aloha Build Contact ${runId}`;
const companyName = `Aloha Build Company ${runId}`;
const primaryEmail = `aloha-${runId}@example.com`;
let customerId = "";
let orderId = "";
let duplicateGuardCustomerId = "";
let mergeSourceCustomerId = "";
let mergeSourceOrderId = "";

test.describe.serial("Customer operational workspace", () => {
  test.beforeAll(async () => {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: customerName,
        companyName,
        customerType: "COMMERCIAL",
        phone: "808-555-4401",
        email: primaryEmail,
        address: "100 Original Job Site Road",
        billingAddress: "800 Billing Avenue",
        city: "Honolulu",
        state: "HI",
        zipCode: "96813",
        contacts: {
          create: {
            name: customerName,
            role: "Project Manager",
            phone: "808-555-4401",
            email: primaryEmail,
            isPrimary: true,
          },
        },
        jobSites: {
          create: {
            name: "Original Job Site",
            address1: "100 Original Job Site Road",
            city: "Honolulu",
            state: "HI",
            zipCode: "96813",
          },
        },
      },
    });
    customerId = customer.id;
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-CUSTOMER-${runId}`,
        customerId,
        status: "DRAFT",
        fulfillmentMethod: "DELIVERY",
        projectName: "Immutable Snapshot Site",
        deliveryName: customerName,
        deliveryPhone: "808-555-4401",
        deliveryAddress1: "55 Historical Snapshot Lane",
        deliveryCity: "Kailua",
        deliveryState: "HI",
        deliveryZip: "96734",
        depositRequired: 25,
        total: 100,
        balanceDue: 100,
      },
    });
    orderId = order.id;
  });

  test.afterAll(async () => {
    if (mergeSourceOrderId) {
      await prisma.salesOrder.deleteMany({ where: { id: mergeSourceOrderId } });
    }
    if (mergeSourceCustomerId) {
      await prisma.customerAlias.deleteMany({
        where: { sourceCustomerId: mergeSourceCustomerId },
      });
      await prisma.customerLifecycleEvent.deleteMany({
        where: {
          OR: [
            { customerId: mergeSourceCustomerId },
            { sourceCustomerId: mergeSourceCustomerId },
          ],
        },
      });
      await prisma.salesCustomer.deleteMany({
        where: { id: mergeSourceCustomerId },
      });
    }
    if (orderId) await prisma.salesOrder.deleteMany({ where: { id: orderId } });
    if (duplicateGuardCustomerId) {
      await prisma.salesCustomer.deleteMany({
        where: { id: duplicateGuardCustomerId },
      });
    }
    if (customerId) {
      await prisma.salesCustomer.deleteMany({ where: { id: customerId } });
    }
    await prisma.$disconnect();
  });

  test("Sales perspective completes customer, Job Site, and Follow-Up work", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto("/customers");
    await expect(
      page.getByRole("searchbox", { name: "Search customers" }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(1);
    await page
      .getByRole("searchbox", { name: "Search customers" })
      .fill(companyName);
    const customerRow = page.getByRole("row").filter({ hasText: companyName });
    await expect(customerRow).toBeVisible();
    await customerRow.click();

    await expect(page).toHaveURL(`/customers/${customerId}`);
    await expect(
      page.getByRole("heading", { name: companyName }),
    ).toBeVisible();
    await expect(
      page.getByText(`Primary contact: ${customerName}`),
    ).toBeVisible();
    await expect(
      page.getByText("Original Job Site", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Project Manager", { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add Job Site" }).click();
    await page.getByLabel("Job Site name").fill("Kakaako Tower");
    await page.getByLabel("Site contact").selectOption({ label: customerName });
    await page.getByLabel("Street address").fill("600 Queen Street");
    await page.getByLabel("City").fill("Honolulu");
    await page.getByLabel("ZIP").fill("96813");
    await page.getByRole("button", { name: "Add Job Site" }).click();
    await expect(
      page.getByText("Kakaako Tower", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Follow-Up", exact: true }).click();
    await page.getByLabel("Owner").fill("Test Owner");
    await page.getByLabel("Due date and time").fill("2026-07-27T09:00");
    await page
      .getByLabel("Next action")
      .fill("Confirm Kakaako delivery access with site superintendent.");
    await page.getByRole("button", { name: "Create Follow-Up" }).click();
    await expect(
      page.getByText(
        "Confirm Kakaako delivery access with site superintendent.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(page.getByText(/Jul 27, 2026.*Test Owner/)).toBeVisible();

    await page.reload();
    await expect(
      page.getByText(
        "Confirm Kakaako delivery access with site superintendent.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Complete", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Outcome")
      .fill(
        "Site superintendent confirmed the loading zone and arrival window.",
      );
    await page.getByRole("button", { name: "Complete Follow-Up" }).click();
    await expect(page.getByText("Open Follow-Ups").locator("..")).toContainText(
      "0",
    );
    await page.getByRole("button", { name: "Activity" }).click();
    await expect(
      page.getByText(
        "Site superintendent confirmed the loading zone and arrival window.",
      ),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test("Owner perspective sees duplicate safety, idempotency, and snapshot integrity", async ({
    request,
  }) => {
    const headers = { Cookie: `solidcore_session=${sessionToken()}` };
    const strong = await request.post(`/api/customers/${customerId}/contacts`, {
      headers,
      data: {
        name: "Different Contact",
        email: primaryEmail.toUpperCase(),
        phone: "808-555-9999",
      },
    });
    expect(strong.status()).toBe(409);
    await expect(strong.json()).resolves.toMatchObject({
      code: "CONTACT_STRONG_MATCH",
    });

    const possible = await request.post(
      `/api/customers/${customerId}/contacts`,
      {
        headers,
        data: {
          name: customerName,
          email: `different-${runId}@example.com`,
          phone: "808-555-7711",
        },
      },
    );
    expect(possible.status()).toBe(409);
    await expect(possible.json()).resolves.toMatchObject({
      code: "CONTACT_POSSIBLE_MATCH",
    });

    const duplicateGuardCustomer = await prisma.salesCustomer.create({
      data: {
        name: `Duplicate Guard ${runId}`,
        contacts: {
          create: {
            name: "Guard Contact",
            email: `guard-${runId}@example.com`,
            phone: "808-555-7722",
            isPrimary: true,
          },
        },
      },
    });
    duplicateGuardCustomerId = duplicateGuardCustomer.id;
    const unsafeUpdate = await request.patch(`/api/customers/${customerId}`, {
      headers,
      data: {
        name: customerName,
        email: `guard-${runId}@example.com`,
      },
    });
    expect(unsafeUpdate.status()).toBe(409);
    await expect(unsafeUpdate.json()).resolves.toMatchObject({
      code: "CUSTOMER_STRONG_MATCH",
    });

    const followUpKey = `customer-follow-up-${runId}`;
    const followUpData = {
      owner: "Test Owner",
      dueAt: "2026-07-29T18:00:00.000Z",
      nextAction: "Review final delivery instructions.",
    };
    const [first, retry] = await Promise.all([
      request.post(`/api/customers/${customerId}/follow-ups`, {
        headers: { ...headers, "Idempotency-Key": followUpKey },
        data: followUpData,
      }),
      request.post(`/api/customers/${customerId}/follow-ups`, {
        headers: { ...headers, "Idempotency-Key": followUpKey },
        data: followUpData,
      }),
    ]);
    expect(first.ok()).toBe(true);
    expect(retry.ok()).toBe(true);
    const [firstBody, retryBody] = await Promise.all([
      first.json(),
      retry.json(),
    ]);
    expect(firstBody.data.id).toBe(retryBody.data.id);
    await expect(
      prisma.customerFollowUp.count({ where: { creationKey: followUpKey } }),
    ).resolves.toBe(1);

    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      select: {
        projectName: true,
        deliveryName: true,
        deliveryAddress1: true,
        deliveryCity: true,
        deliveryState: true,
        deliveryZip: true,
      },
    });
    expect(order).toEqual({
      projectName: "Immutable Snapshot Site",
      deliveryName: customerName,
      deliveryAddress1: "55 Historical Snapshot Lane",
      deliveryCity: "Kailua",
      deliveryState: "HI",
      deliveryZip: "96734",
    });
    await expect(
      prisma.salesCustomer.count({
        where: { OR: [{ id: customerId }, { companyName }] },
      }),
    ).resolves.toBe(1);
  });

  test("manager merge, archive, and restore preserve history and enforce role boundaries", async ({
    request,
    page,
  }) => {
    const source = await prisma.salesCustomer.create({
      data: {
        name: `Legacy Buyer ${runId}`,
        companyName: `Legacy Build ${runId}`,
        customerType: "COMMERCIAL",
        phone: "808-555-6622",
        email: `legacy-${runId}@example.com`,
        contacts: {
          create: {
            name: `Legacy Contact ${runId}`,
            phone: "808-555-6622",
            email: `legacy-${runId}@example.com`,
            isPrimary: true,
          },
        },
        jobSites: {
          create: {
            name: "Legacy Job Site",
            address1: "77 Historical Link Road",
            city: "Honolulu",
            state: "HI",
            zipCode: "96813",
          },
        },
        followUps: {
          create: {
            owner: "Test Owner",
            dueAt: new Date("2026-08-01T18:00:00.000Z"),
            nextAction: "Preserve this follow-up through the merge.",
          },
        },
      },
    });
    mergeSourceCustomerId = source.id;
    const sourceOrder = await prisma.salesOrder.create({
      data: {
        orderNumber: `SO-MERGE-${runId}`,
        customerId: source.id,
        status: "DRAFT",
        fulfillmentMethod: "PICKUP",
        total: 275,
        balanceDue: 275,
      },
    });
    mergeSourceOrderId = sourceOrder.id;

    const salesHeaders = {
      Cookie: `solidcore_session=${sessionToken("SALES")}`,
    };
    const adminHeaders = {
      Cookie: `solidcore_session=${sessionToken("ADMIN")}`,
    };

    const deniedMerge = await request.post(
      `/api/customers/${source.id}/merge`,
      {
        headers: salesHeaders,
        data: {
          targetCustomerId: customerId,
          reason: "Confirmed duplicate customer.",
        },
      },
    );
    expect(deniedMerge.status()).toBe(401);

    const missingMerge = await request.post(
      `/api/customers/${randomUUID()}/merge`,
      {
        headers: adminHeaders,
        data: {
          targetCustomerId: customerId,
          reason: "Confirmed duplicate customer.",
        },
      },
    );
    expect(missingMerge.status()).toBe(404);

    const merged = await request.post(`/api/customers/${source.id}/merge`, {
      headers: adminHeaders,
      data: {
        targetCustomerId: customerId,
        reason: "Same company and confirmed customer identity.",
      },
    });
    expect(merged.status()).toBe(200);

    await expect(
      prisma.salesCustomer.findUnique({
        where: { id: source.id },
        select: { mergedIntoId: true, archivedAt: true },
      }),
    ).resolves.toMatchObject({
      mergedIntoId: customerId,
      archivedAt: expect.any(Date),
    });
    await expect(
      prisma.salesOrder.findUnique({
        where: { id: sourceOrder.id },
        select: { customerId: true },
      }),
    ).resolves.toEqual({ customerId: source.id });
    await expect(
      prisma.customerContact.count({
        where: { customerId, email: `legacy-${runId}@example.com` },
      }),
    ).resolves.toBe(1);

    const sourceWorkspace = await request.get(
      `/api/customers/${source.id}/workspace`,
      { headers: adminHeaders },
    );
    expect(sourceWorkspace.status()).toBe(409);
    await expect(sourceWorkspace.json()).resolves.toMatchObject({
      code: "CUSTOMER_MERGED",
      redirectCustomerId: customerId,
    });

    const targetWorkspace = await request.get(
      `/api/customers/${customerId}/workspace`,
      { headers: adminHeaders },
    );
    expect(targetWorkspace.ok()).toBe(true);
    const targetPayload = await targetWorkspace.json();
    expect(
      targetPayload.data.orders.some(
        (order: { id: string }) => order.id === sourceOrder.id,
      ),
    ).toBe(true);
    expect(
      targetPayload.data.aliases.some(
        (alias: { value: string }) => alias.value === `Legacy Build ${runId}`,
      ),
    ).toBe(true);
    expect(
      targetPayload.data.mergedCustomers.some(
        (item: { id: string }) => item.id === source.id,
      ),
    ).toBe(true);

    const aliasSearch = await request.get(
      `/api/customers?q=${encodeURIComponent(`Legacy Build ${runId}`)}`,
      { headers: salesHeaders },
    );
    expect(aliasSearch.ok()).toBe(true);
    await expect(aliasSearch.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: customerId }),
      ]),
    });

    const deniedArchive = await request.patch(
      `/api/customers/${customerId}/archive`,
      {
        headers: salesHeaders,
        data: { action: "ARCHIVE", reason: "No longer active customer." },
      },
    );
    expect(deniedArchive.status()).toBe(401);

    const archived = await request.patch(
      `/api/customers/${customerId}/archive`,
      {
        headers: adminHeaders,
        data: { action: "ARCHIVE", reason: "No longer active customer." },
      },
    );
    expect(archived.ok()).toBe(true);
    await expect(
      prisma.salesCustomer.findUnique({
        where: { id: customerId },
        select: { archivedAt: true },
      }),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });

    const blockedWrite = await request.post(
      `/api/customers/${customerId}/notes`,
      {
        headers: salesHeaders,
        data: { note: "This must not write while archived." },
      },
    );
    expect(blockedWrite.status()).toBe(409);
    await expect(blockedWrite.json()).resolves.toMatchObject({
      code: "CUSTOMER_ARCHIVED",
    });

    const activeList = await request.get("/api/customers", {
      headers: salesHeaders,
    });
    expect(activeList.ok()).toBe(true);
    expect(
      (await activeList.json()).data.some(
        (item: { id: string }) => item.id === customerId,
      ),
    ).toBe(false);

    const restored = await request.patch(
      `/api/customers/${customerId}/archive`,
      {
        headers: adminHeaders,
        data: {
          action: "RESTORE",
          reason: "Customer relationship resumed.",
        },
      },
    );
    expect(restored.ok()).toBe(true);
    await expect(
      prisma.salesCustomer.findUnique({
        where: { id: customerId },
        select: { archivedAt: true },
      }),
    ).resolves.toEqual({ archivedAt: null });

    await authenticate(page);
    await page.goto(`/customers/${customerId}`);
    await expect(
      page.getByRole("heading", { name: "Aliases and merged history" }),
    ).toBeVisible();
    await expect(
      page.getByText(`Legacy Build ${runId}`, { exact: true }).first(),
    ).toBeVisible();
  });

  test("customer-originated New sale preselects the correct customer", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto(`/customers/${customerId}`);
    await page.getByRole("button", { name: "New sale" }).click();
    await expect(page).toHaveURL(
      `/sales-orders/new?docType=SALES_ORDER&customerId=${customerId}`,
    );
    await expect(
      page.getByRole("button", { name: new RegExp(`Customer ${companyName}`) }),
    ).toBeVisible();
  });
});
