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
  console.log(`Running fulfillment inventory checks against ${BASE_URL}`);

  let fulfillmentId = "";
  let originalStatus = "DRAFT";
  let originalDeductedAt = null;
  let originalDeductedBy = null;
  const originalItemQty = new Map();
  const touchedStocks = new Map();
  const touchedItems = [];

  try {
    const so = await prisma.salesOrder.findFirst({
      where: {
        status: { in: ["CONFIRMED", "READY", "PARTIALLY_FULFILLED"] },
        items: { some: { variantId: { not: null } } },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!so) fail("No eligible sales order with variant items found");

    const ensured = await api("/api/fulfillment/from-sales-order", {
      method: "POST",
      body: JSON.stringify({ salesOrderId: so.id, type: "delivery" }),
    });
    if (!ensured.res.ok) fail(`Failed to ensure fulfillment (${ensured.res.status})`);
    fulfillmentId = ensured.payload?.data?.fulfillment?.id ?? "";
    if (!fulfillmentId) fail("No fulfillment id returned");

    const detail = await prisma.salesOrderFulfillment.findUnique({
      where: { id: fulfillmentId },
      select: {
        status: true,
        inventoryDeductedAt: true,
        inventoryDeductedBy: true,
        items: {
          select: {
            id: true,
            variantId: true,
            orderedQty: true,
            fulfilledQty: true,
            variant: {
              select: {
                sku: true,
                inventoryStock: { select: { onHand: true } },
              },
            },
          },
        },
      },
    });
    if (!detail) fail("Fulfillment not found");

    originalStatus = detail.status;
    originalDeductedAt = detail.inventoryDeductedAt;
    originalDeductedBy = detail.inventoryDeductedBy;

    for (const item of detail.items) {
      originalItemQty.set(item.id, Number(item.fulfilledQty || 0));
      const reset = await api(`/api/fulfillment-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fulfilledQty: 0 }),
      });
      if (!reset.res.ok) fail(`Unable to reset fulfilled qty for item ${item.id}`);
    }

    const candidates = detail.items.filter((item) => item.variantId && item.variant?.inventoryStock);
    if (candidates.length < 2) fail("Need fulfillment with at least 2 stocked variant items");

    for (const item of candidates.slice(0, 2)) {
      const onHand = Number(item.variant.inventoryStock.onHand || 0);
      const ordered = Number(item.orderedQty || 0);
      const testQty = Math.max(1, Math.min(ordered, Math.floor(onHand / 4) || 1));
      if (onHand < testQty) fail(`Not enough stock to prepare test for ${item.variant?.sku || item.variantId}`);
      touchedItems.push({
        id: item.id,
        variantId: item.variantId,
        sku: item.variant?.sku || item.variantId,
        qty: testQty,
      });
      touchedStocks.set(item.variantId, onHand);
      const upd = await api(`/api/fulfillment-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fulfilledQty: testQty }),
      });
      if (!upd.res.ok) fail(`Unable to set test fulfilled qty (${upd.res.status})`);
    }

    await prisma.salesOrderFulfillment.update({
      where: { id: fulfillmentId },
      data: { status: "READY", inventoryDeductedAt: null, inventoryDeductedBy: null },
    });
    await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId } });

    const delivered = await api(`/api/fulfillments/${fulfillmentId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "delivered" }),
    });
    if (!delivered.res.ok) fail(`Mark delivered failed (${delivered.res.status}) ${delivered.payload?.error || ""}`);

    const afterFirst = await prisma.salesOrderFulfillment.findUnique({
      where: { id: fulfillmentId },
      select: { inventoryDeductedAt: true },
    });
    if (!afterFirst?.inventoryDeductedAt) fail("inventory_deducted_at was not set");

    const movements = await prisma.inventoryMovement.findMany({ where: { fulfillmentId } });
    if (movements.length < 2) fail(`Expected movement rows for deducted lines, got ${movements.length}`);

    for (const item of touchedItems) {
      const before = touchedStocks.get(item.variantId);
      const stock = await prisma.inventoryStock.findUnique({
        where: { variantId: item.variantId },
        select: { onHand: true },
      });
      const after = Number(stock?.onHand || 0);
      const moved = movements.filter((m) => m.variantId === item.variantId);
      const movedQty = -moved.reduce((sum, m) => sum + Number(m.qty), 0);
      if (before === undefined) fail("Missing baseline stock");
      const expectedAfter = before - movedQty;
      if (Math.abs(after - expectedAfter) > 0.0001) {
        fail(`Stock mismatch for ${item.sku}. before=${before}, moved=${movedQty}, after=${after}`);
      }
    }
    console.log("PASS: final status deducts stock and writes movements");

    const movementCountBefore = await prisma.inventoryMovement.count({ where: { fulfillmentId } });
    const stockBeforeSecond = new Map();
    for (const item of touchedItems) {
      const stock = await prisma.inventoryStock.findUnique({
        where: { variantId: item.variantId },
        select: { onHand: true },
      });
      stockBeforeSecond.set(item.variantId, Number(stock?.onHand || 0));
    }
    const deliveredAgain = await api(`/api/fulfillments/${fulfillmentId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "delivered" }),
    });
    if (!deliveredAgain.res.ok) fail(`Second delivered failed (${deliveredAgain.res.status})`);
    const movementCountAfter = await prisma.inventoryMovement.count({ where: { fulfillmentId } });
    if (movementCountAfter !== movementCountBefore) fail("Idempotency failed: movement count changed");
    for (const item of touchedItems) {
      const stock = await prisma.inventoryStock.findUnique({
        where: { variantId: item.variantId },
        select: { onHand: true },
      });
      const before = stockBeforeSecond.get(item.variantId);
      const after = Number(stock?.onHand || 0);
      if (Math.abs((before ?? 0) - after) > 0.0001) fail("Idempotency failed: stock changed on second final update");
    }
    console.log("PASS: repeated final status is idempotent (no second deduction)");

    const insufficient = touchedItems[0];
    if (!insufficient) fail("No item available for insufficient-stock scenario");
    const current = await prisma.inventoryStock.findUnique({
      where: { variantId: insufficient.variantId },
      select: { onHand: true },
    });
    const currentOnHand = Number(current?.onHand || 0);
    await prisma.inventoryStock.update({
      where: { variantId: insufficient.variantId },
      data: { onHand: 0 },
    });
    await prisma.salesOrderFulfillment.update({
      where: { id: fulfillmentId },
      data: { status: "READY", inventoryDeductedAt: null, inventoryDeductedBy: null },
    });
    await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId } });

    const blocked = await api(`/api/fulfillments/${fulfillmentId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "delivered" }),
    });
    if (blocked.res.status !== 400) {
      fail(`Expected 400 when stock is insufficient, got ${blocked.res.status}`);
    }
    if (!String(blocked.payload?.error || "").includes("Insufficient stock for SKU")) {
      fail(`Unexpected insufficient-stock error message: ${blocked.payload?.error || "empty"}`);
    }
    await prisma.inventoryStock.update({
      where: { variantId: insufficient.variantId },
      data: { onHand: currentOnHand },
    });
    console.log("PASS: insufficient stock blocks finalization");

    console.log("All fulfillment inventory checks passed.");
  } finally {
    if (fulfillmentId) {
      for (const [itemId, qty] of originalItemQty.entries()) {
        await api(`/api/fulfillment-items/${itemId}`, {
          method: "PATCH",
          body: JSON.stringify({ fulfilledQty: qty }),
        }).catch(() => {});
      }
      await prisma.salesOrderFulfillment
        .update({
          where: { id: fulfillmentId },
          data: {
            status: originalStatus,
            inventoryDeductedAt: originalDeductedAt,
            inventoryDeductedBy: originalDeductedBy,
          },
        })
        .catch(() => {});
      await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId } }).catch(() => {});
    }
    for (const [variantId, onHand] of touchedStocks.entries()) {
      await prisma.inventoryStock.update({ where: { variantId }, data: { onHand } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
