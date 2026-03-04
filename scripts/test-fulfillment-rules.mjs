#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const ROLE = process.env.TEST_ROLE || "ADMIN";
const prisma = new PrismaClient();

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "x-user-role": ROLE,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { res, payload };
}

async function main() {
  console.log(`Running fulfillment rule checks against ${BASE_URL}`);

  const so = await prisma.salesOrder.findFirst({
    where: {
      status: { in: ["CONFIRMED", "READY", "PARTIALLY_FULFILLED"] },
      items: { some: {} },
    },
    select: { id: true, orderNumber: true },
    orderBy: { createdAt: "asc" },
  });
  if (!so) fail("No eligible sales order with items found (need CONFIRMED/READY/PARTIALLY_FULFILLED)");
  console.log(`Using sales order ${so.orderNumber} (${so.id})`);

  const ensureResp = await api("/api/fulfillment/from-sales-order", {
    method: "POST",
    body: JSON.stringify({ salesOrderId: so.id, type: "delivery" }),
  });
  if (!ensureResp.res.ok) fail(`Unable to ensure fulfillment (${ensureResp.res.status})`);
  const fulfillment = ensureResp.payload?.data?.fulfillment;
  if (!fulfillment?.id) fail("No fulfillment returned from from-sales-order API");
  if (!Array.isArray(fulfillment.items) || fulfillment.items.length === 0) fail("Fulfillment has no items");
  console.log(
    `Fulfillment ${fulfillment.id} (${ensureResp.payload?.data?.existed ? "existing" : "created"}) with ${fulfillment.items.length} items`,
  );

  const detailResp = await api(`/api/fulfillment/${fulfillment.id}`);
  if (!detailResp.res.ok) fail(`Unable to read fulfillment detail (${detailResp.res.status})`);
  const original = detailResp.payload?.data;
  const originalStatus = String(original?.status || "SCHEDULED");
  const originalItems = (original?.items || []).map((item) => ({
    id: item.id,
    fulfilledQty: Number(item.fulfilledQty || 0),
    orderedQty: Number(item.orderedQty || 0),
    notes: item.notes || "",
  }));
  if (originalItems.length === 0) fail("Fulfillment detail has no items");

  const first = originalItems[0];

  // 1) Can't mark completed when not fully fulfilled.
  const forceShortResp = await api(`/api/fulfillment-item/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({ fulfilledQty: 0 }),
  });
  if (!forceShortResp.res.ok) fail(`Failed to make first item short (${forceShortResp.res.status})`);

  const completeWhileShortResp = await api(`/api/fulfillment/${fulfillment.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
  if (completeWhileShortResp.res.status !== 409) {
    fail(`Expected 409 when completing short fulfillment, got ${completeWhileShortResp.res.status}`);
  }
  console.log("PASS: Completed is blocked when some items are short");

  // 2) Complete all items and mark completed.
  for (const item of originalItems) {
    const r = await api(`/api/fulfillment-item/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fulfilledQty: item.orderedQty }),
    });
    if (!r.res.ok) fail(`Failed to set full fulfilledQty for item ${item.id} (${r.res.status})`);
  }
  const completeResp = await api(`/api/fulfillment/${fulfillment.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
  if (!completeResp.res.ok) fail(`Failed to mark completed (${completeResp.res.status})`);
  console.log("PASS: Completed works when all items are fulfilled");

  // 3) Decrease one item from completed and expect partial.
  const backDownResp = await api(`/api/fulfillment-item/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({ fulfilledQty: 0 }),
  });
  if (!backDownResp.res.ok) fail(`Failed to lower fulfilledQty after complete (${backDownResp.res.status})`);
  const refreshed = await api(`/api/fulfillment/${fulfillment.id}`);
  if (!refreshed.res.ok) fail(`Unable to refresh fulfillment (${refreshed.res.status})`);
  const finalStatus = String(refreshed.payload?.data?.status || "");
  if (finalStatus !== "PARTIAL") {
    fail(`Expected PARTIAL after lowering completed item, got ${finalStatus || "empty"}`);
  }
  console.log("PASS: Completed auto-downgrades to PARTIAL when item is lowered");

  // Restore baseline so the test doesn't leave dirty operational state.
  for (const item of originalItems) {
    await api(`/api/fulfillment-item/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fulfilledQty: item.fulfilledQty, notes: item.notes }),
    });
  }
  await api(`/api/fulfillment/${fulfillment.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: originalStatus.toLowerCase() }),
  });

  console.log("All fulfillment rule checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
