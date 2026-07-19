#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const QA_MARKER = "SOLIDCORE PHASE3A0 LEGACY QA DELETE ME";
const RUN_ID = `phase3a0-legacy-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SKU_PREFIX = `PH3A0-PDF-${RUN_ID}`;

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      if (process.env[key] !== undefined) continue;
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  }
}

function assertSafeDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required for deterministic fulfillment PDF checks.");
  const url = new URL(rawUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isExplicitTestDb = /test/i.test(url.pathname);
  if (!isLocal && !isExplicitTestDb) {
    throw new Error("Refusing to run fulfillment PDF checks against a non-local, non-test database.");
  }
  return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
}

loadLocalEnv();
const safeDatabaseLabel = assertSafeDatabase();
const prisma = new PrismaClient();

const createdCustomerIds = new Set();
const createdProductIds = new Set();
const createdVariantIds = new Set();
const createdStockVariantIds = new Set();
const createdOrderIds = new Set();
const createdFulfillmentIds = new Set();
const createdFulfillmentItemIds = new Set();

function fail(message) {
  throw new Error(message);
}

function createSessionCookie() {
  const payload = {
    userId: "phase3a0-legacy-pdf-admin",
    role: "ADMIN",
    name: "Phase 3A-0 Legacy PDF Test Admin",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `solidcore_session=${encoded}.${signature}`;
}

async function api(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: createSessionCookie() },
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
  if (!String(payload.contentType || "").includes("application/pdf")) {
    fail(`${label}: expected application/pdf, got ${payload.contentType || "empty"}`);
  }
  if (!payload.bytes || payload.bytes.length < 800) {
    fail(`${label}: PDF too small or empty (${payload.bytes?.length || 0} bytes)`);
  }
  if (payload.bytes.slice(0, 4).toString("utf8") !== "%PDF") {
    fail(`${label}: response does not start with a PDF header`);
  }
}

async function tableCounts() {
  const [
    customers,
    products,
    variants,
    stocks,
    orders,
    orderItems,
    fulfillments,
    fulfillmentItems,
    movements,
    invoices,
    payments,
    outboundQueues,
  ] = await Promise.all([
    prisma.salesCustomer.count(),
    prisma.salesProduct.count(),
    prisma.productVariant.count(),
    prisma.inventoryStock.count(),
    prisma.salesOrder.count(),
    prisma.salesOrderItem.count(),
    prisma.salesOrderFulfillment.count(),
    prisma.salesOrderFulfillmentItem.count(),
    prisma.inventoryMovement.count(),
    prisma.invoice.count(),
    prisma.salesOrderPayment.count(),
    prisma.salesOutboundQueue.count(),
  ]);
  return {
    customers,
    products,
    variants,
    stocks,
    orders,
    orderItems,
    fulfillments,
    fulfillmentItems,
    movements,
    invoices,
    payments,
    outboundQueues,
  };
}

async function taggedCounts() {
  const [
    customers,
    products,
    variants,
    orders,
    orderItems,
    fulfillments,
    fulfillmentItems,
    movements,
    outboundQueues,
  ] = await Promise.all([
    prisma.salesCustomer.count({ where: { name: { contains: QA_MARKER } } }),
    prisma.salesProduct.count({ where: { name: { contains: QA_MARKER } } }),
    prisma.productVariant.count({ where: { sku: { contains: "PH3A0-PDF-" } } }),
    prisma.salesOrder.count({
      where: {
        OR: [{ orderNumber: { contains: "SO-PH3A0-PDF-" } }, { notes: { contains: QA_MARKER } }],
      },
    }),
    prisma.salesOrderItem.count({
      where: {
        OR: [
          { productTitle: { contains: QA_MARKER } },
          { titleSnapshot: { contains: QA_MARKER } },
          { lineDescription: { contains: QA_MARKER } },
        ],
      },
    }),
    prisma.salesOrderFulfillment.count({
      where: {
        OR: [
          { shiptoName: { contains: QA_MARKER } },
          { pickupContact: { contains: QA_MARKER } },
          { notes: { contains: QA_MARKER } },
        ],
      },
    }),
    prisma.salesOrderFulfillmentItem.count({
      where: {
        OR: [{ title: { contains: QA_MARKER } }, { notes: { contains: QA_MARKER } }],
      },
    }),
    prisma.inventoryMovement.count({ where: { note: { contains: QA_MARKER } } }),
    prisma.salesOutboundQueue.count({
      where: {
        OR: [{ address: { contains: QA_MARKER } }, { notes: { contains: QA_MARKER } }],
      },
    }),
  ]);
  return {
    customers,
    products,
    variants,
    orders,
    orderItems,
    fulfillments,
    fulfillmentItems,
    movements,
    outboundQueues,
  };
}

async function createCustomer(label) {
  const customer = await prisma.salesCustomer.create({
    data: {
      name: `${QA_MARKER} ${label} ${RUN_ID}`,
      phone: "808-555-3030",
      email: `${label}-${RUN_ID}@example.com`,
      address: "300 Phase 3A PDF Way",
      city: "Honolulu",
      state: "HI",
      zipCode: "96817",
      taxExempt: false,
      taxRate: 0,
    },
  });
  createdCustomerIds.add(customer.id);
  return customer;
}

async function createVariant(label, index) {
  const product = await prisma.salesProduct.create({
    data: {
      name: `${QA_MARKER} ${label} product ${RUN_ID}`,
      title: `${QA_MARKER} ${label} product`,
      defaultDescription: `${QA_MARKER} ${label}`,
      unit: "PIECE",
      price: 12.5,
      cost: 5,
      availableStock: 20,
      active: true,
    },
  });
  createdProductIds.add(product.id);

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `${SKU_PREFIX}-${label.toUpperCase()}-${index}`,
      displayName: `${QA_MARKER} ${label} variant`,
      description: `${QA_MARKER} ${label} variant`,
      price: product.price,
      cost: product.cost,
      isStockItem: true,
    },
  });
  createdVariantIds.add(variant.id);

  await prisma.inventoryStock.create({
    data: { variantId: variant.id, onHand: 20, reserved: 0 },
  });
  createdStockVariantIds.add(variant.id);

  return {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    title: `${QA_MARKER} ${label} variant`,
    unit: "PIECE",
    price: Number(product.price),
  };
}

async function createFulfillmentFixture(type, lineCount) {
  const isDelivery = type === "DELIVERY";
  const customer = await createCustomer(type.toLowerCase());
  const lines = [];
  for (let index = 0; index < lineCount; index += 1) {
    const variant = await createVariant(`${type.toLowerCase()}-${index + 1}`, index + 1);
    const quantity = index + 2;
    lines.push({ variant, quantity });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.variant.price, 0);
  const order = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PH3A0-PDF-${RUN_ID}-${type}`,
      customerId: customer.id,
      docType: "SALES_ORDER",
      status: "CONFIRMED",
      fulfillmentMethod: type,
      deliveryName: isDelivery ? customer.name : null,
      deliveryPhone: isDelivery ? customer.phone : null,
      deliveryAddress1: isDelivery ? "300 Phase 3A PDF Way" : null,
      deliveryCity: isDelivery ? "Honolulu" : null,
      deliveryState: isDelivery ? "HI" : null,
      deliveryZip: isDelivery ? "96817" : null,
      deliveryNotes: isDelivery ? `${QA_MARKER} delivery note` : null,
      pickupNotes: isDelivery ? null : `${QA_MARKER} pickup note`,
      subtotal,
      discount: 0,
      tax: 0,
      total: subtotal,
      paidAmount: 0,
      balanceDue: subtotal,
      paymentStatus: "unpaid",
      notes: `${QA_MARKER} ${RUN_ID}`,
      items: {
        create: lines.map((line) => ({
          productId: line.variant.productId,
          variantId: line.variant.variantId,
          productSku: line.variant.sku,
          productTitle: line.variant.title,
          skuSnapshot: line.variant.sku,
          titleSnapshot: line.variant.title,
          uomSnapshot: line.variant.unit,
          lineDescription: line.variant.title,
          quantity: line.quantity,
          unitPrice: line.variant.price,
          lineDiscount: 0,
          lineTotal: line.quantity * line.variant.price,
          notes: `${QA_MARKER} order item`,
        })),
      },
    },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  createdOrderIds.add(order.id);

  const fulfillment = await prisma.salesOrderFulfillment.create({
    data: {
      salesOrderId: order.id,
      customerId: customer.id,
      type,
      status: "READY",
      scheduledAt: new Date("2026-01-15T18:00:00.000Z"),
      scheduledDate: new Date("2026-01-15T00:00:00.000Z"),
      timeWindow: "10:00 AM - 12:00 PM",
      driverName: isDelivery ? "Phase 3A Driver" : null,
      shiptoName: isDelivery ? customer.name : null,
      shiptoPhone: isDelivery ? customer.phone : null,
      shiptoAddress1: isDelivery ? "300 Phase 3A PDF Way" : null,
      shiptoCity: isDelivery ? "Honolulu" : null,
      shiptoState: isDelivery ? "HI" : null,
      shiptoZip: isDelivery ? "96817" : null,
      shiptoNotes: isDelivery ? `${QA_MARKER} delivery slip note` : null,
      pickupContact: isDelivery ? null : customer.name,
      address: isDelivery ? "300 Phase 3A PDF Way, Honolulu, HI, 96817" : null,
      notes: isDelivery ? `${QA_MARKER} delivery fulfillment` : `${QA_MARKER} pickup fulfillment`,
      items: {
        create: order.items.map((item, index) => ({
          salesOrderItemId: item.id,
          variantId: item.variantId,
          title: item.titleSnapshot || item.productTitle || `Item ${index + 1}`,
          sku: item.skuSnapshot || item.productSku || "-",
          unit: item.uomSnapshot || "PIECE",
          orderedQty: item.quantity,
          fulfilledQty: index === 0 ? 1 : 0,
          notes: `${QA_MARKER} fulfillment item`,
        })),
      },
    },
    include: { items: true },
  });
  createdFulfillmentIds.add(fulfillment.id);
  for (const item of fulfillment.items) createdFulfillmentItemIds.add(item.id);

  return { order, fulfillment };
}

async function cleanup() {
  const variantIds = Array.from(createdVariantIds);
  const fulfillmentIds = Array.from(createdFulfillmentIds);
  const fulfillmentItemIds = Array.from(createdFulfillmentItemIds);
  await prisma.inventoryMovement.deleteMany({
    where: {
      OR: [
        { variantId: { in: variantIds } },
        { fulfillmentId: { in: fulfillmentIds } },
        { fulfillmentItemId: { in: fulfillmentItemIds } },
        { note: { contains: RUN_ID } },
      ],
    },
  });
  await prisma.salesOrder.deleteMany({ where: { id: { in: Array.from(createdOrderIds) } } });
  await prisma.inventoryStock.deleteMany({ where: { variantId: { in: Array.from(createdStockVariantIds) } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  await prisma.salesProduct.deleteMany({ where: { id: { in: Array.from(createdProductIds) } } });
  await prisma.salesCustomer.deleteMany({ where: { id: { in: Array.from(createdCustomerIds) } } });
}

function assertNoTaggedRecords(counts) {
  const dirty = Object.entries(counts).filter(([, count]) => Number(count) !== 0);
  if (dirty.length > 0) {
    fail(`Tagged QA records remain after cleanup: ${JSON.stringify(Object.fromEntries(dirty))}`);
  }
}

async function main() {
  console.log(`Running deterministic fulfillment PDF checks against ${BASE_URL}`);
  console.log(`Using local/test database ${safeDatabaseLabel}`);

  const beforeCounts = await tableCounts();
  const beforeTagged = await taggedCounts();
  if (Object.values(beforeTagged).some((count) => count !== 0)) {
    fail(`Existing tagged Phase 3A-0 PDF records found before test: ${JSON.stringify(beforeTagged)}`);
  }

  const delivery = await createFulfillmentFixture("DELIVERY", 2);
  const pickup = await createFulfillmentFixture("PICKUP", 1);
  console.log(`Created delivery fixture ${delivery.order.orderNumber} (${delivery.fulfillment.items.length} items)`);
  console.log(`Created pickup fixture ${pickup.order.orderNumber} (${pickup.fulfillment.items.length} items)`);

  const pickPdf = await api(`/api/fulfillments/${delivery.fulfillment.id}/pdf?type=pick`);
  assertPdfResponse("delivery pick list", pickPdf);
  if (!String(pickPdf.disposition || "").includes("inline")) {
    fail(`delivery pick list: expected inline disposition, got ${pickPdf.disposition || "empty"}`);
  }
  if (!String(pickPdf.disposition || "").includes(delivery.order.orderNumber)) {
    fail("delivery pick list: filename does not include the order number");
  }
  console.log("PASS: Delivery pick list returns a valid inline PDF with order-number filename");

  const deliverySlip = await api(`/api/fulfillments/${delivery.fulfillment.id}/pdf?type=slip`);
  assertPdfResponse("delivery slip", deliverySlip);
  if (!String(deliverySlip.disposition || "").includes("delivery-slip")) {
    fail("delivery slip: filename does not identify delivery slip");
  }
  console.log("PASS: Delivery slip returns a valid PDF");

  const pickupSlip = await api(`/api/fulfillments/${pickup.fulfillment.id}/pdf?type=slip`);
  assertPdfResponse("pickup slip", pickupSlip);
  if (!String(pickupSlip.disposition || "").includes("pickup-slip")) {
    fail("pickup slip: filename does not identify pickup slip");
  }
  console.log("PASS: Pickup slip returns a valid PDF");

  const downloadPick = await api(`/api/fulfillments/${delivery.fulfillment.id}/pdf?type=pick&download=true`);
  assertPdfResponse("download pick list", downloadPick);
  if (!String(downloadPick.disposition || "").includes("attachment")) {
    fail(`download pick list: expected attachment disposition, got ${downloadPick.disposition || "empty"}`);
  }
  console.log("PASS: Download mode returns attachment disposition");

  const badType = await api(`/api/fulfillments/${delivery.fulfillment.id}/pdf?type=unknown`);
  if (badType.status !== 400) fail(`invalid type should return 400, got ${badType.status}`);
  console.log("PASS: Invalid type is rejected");

  await cleanup();
  const afterCounts = await tableCounts();
  const afterTagged = await taggedCounts();
  assertNoTaggedRecords(afterTagged);
  console.log(`PASS: Fixture cleanup removed all tagged records (${JSON.stringify(afterTagged)})`);
  console.log(`Before counts: ${JSON.stringify(beforeCounts)}`);
  console.log(`After counts: ${JSON.stringify(afterCounts)}`);
  console.log("All deterministic fulfillment PDF checks passed.");
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      const afterTagged = await taggedCounts();
      assertNoTaggedRecords(afterTagged);
    } catch (error) {
      console.error(`FAIL: cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
