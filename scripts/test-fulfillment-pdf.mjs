#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const ROLE = process.env.TEST_ROLE || "ADMIN";
const prisma = new PrismaClient();

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-user-role": ROLE },
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    disposition: res.headers.get("content-disposition"),
    bytes,
  };
}

function assertPdfResponse(label, payload) {
  if (payload.status !== 200) fail(`${label}: expected 200, got ${payload.status}`);
  if (payload.contentType !== "application/pdf") {
    fail(`${label}: expected application/pdf, got ${payload.contentType || "empty"}`);
  }
  if (!payload.bytes || payload.bytes.length < 800) {
    fail(`${label}: PDF too small or empty (${payload.bytes?.length || 0} bytes)`);
  }
}

async function main() {
  console.log(`Running fulfillment PDF checks against ${BASE_URL}`);

  const delivery = await prisma.salesOrderFulfillment.findFirst({
    where: { type: "DELIVERY", items: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      salesOrder: { select: { orderNumber: true } },
      _count: { select: { items: true } },
    },
  });
  const pickup = await prisma.salesOrderFulfillment.findFirst({
    where: { type: "PICKUP", items: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      salesOrder: { select: { orderNumber: true } },
      _count: { select: { items: true } },
    },
  });
  if (!delivery) fail("No delivery fulfillment with items found");
  if (!pickup) fail("No pickup fulfillment with items found");
  if (delivery._count.items < 2) {
    console.warn("WARN: delivery sample has <2 items; multi-item visual check should be done manually");
  }

  const pickPdf = await api(`/api/fulfillments/${delivery.id}/pdf?type=pick`);
  assertPdfResponse("delivery pick list", pickPdf);
  if (!String(pickPdf.disposition || "").includes("inline")) {
    fail(`delivery pick list: expected inline disposition, got ${pickPdf.disposition || "empty"}`);
  }
  console.log("PASS: Pick List PDF endpoint returns valid inline PDF");

  const deliverySlip = await api(`/api/fulfillments/${delivery.id}/pdf?type=slip`);
  assertPdfResponse("delivery slip", deliverySlip);
  console.log("PASS: Delivery Slip PDF endpoint returns valid PDF");

  const pickupSlip = await api(`/api/fulfillments/${pickup.id}/pdf?type=slip`);
  assertPdfResponse("pickup slip", pickupSlip);
  console.log("PASS: Pickup Slip PDF endpoint returns valid PDF");

  const downloadPick = await api(`/api/fulfillments/${delivery.id}/pdf?type=pick&download=true`);
  assertPdfResponse("download pick list", downloadPick);
  if (!String(downloadPick.disposition || "").includes("attachment")) {
    fail(`download pick list: expected attachment disposition, got ${downloadPick.disposition || "empty"}`);
  }
  console.log("PASS: Download mode returns attachment disposition");

  const badType = await api(`/api/fulfillments/${delivery.id}/pdf?type=unknown`);
  if (badType.status !== 400) fail(`invalid type should return 400, got ${badType.status}`);
  console.log("PASS: Invalid type is rejected");

  console.log("All fulfillment PDF checks passed.");
}

main()
  .catch((error) => fail(error instanceof Error ? error.message : String(error)))
  .finally(async () => {
    await prisma.$disconnect();
  });
