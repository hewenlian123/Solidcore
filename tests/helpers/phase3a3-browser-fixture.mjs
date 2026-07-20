import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PROJECT_ROOT = "/Users/solidcore/Desktop/Solidcore Webapp";
const STATE_PATH = "/private/tmp/solidcore-phase3a3-browser-fixture.json";
const MARKER = "SOLIDCORE PHASE3A3 PICKUP BROWSER QA DELETE ME";

function loadEnvValue(key) {
  for (const file of [".env.local", ".env"]) {
    const path = `${PROJECT_ROOT}/${file}`;
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      if (trimmed.slice(0, separatorIndex).trim() !== key) continue;
      return trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return process.env[key] ?? null;
}

function prisma() {
  const url = loadEnvValue("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(url);
  const safeHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!safeHost && !/test/i.test(parsed.pathname)) {
    throw new Error(`Refusing non-local database ${parsed.hostname}${parsed.pathname}`);
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

async function cleanup() {
  const db = prisma();
  try {
    const state = existsSync(STATE_PATH)
      ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
      : {
          customerIds: [],
          productIds: [],
          variantIds: [],
          orderIds: [],
          fulfillmentIds: [],
          fulfillmentItemIds: [],
          supplierIds: [],
          purchaseOrderIds: [],
        };

    await db.inventoryMovement.deleteMany({
      where: {
        OR: [
          { variantId: { in: state.variantIds ?? [] } },
          { fulfillmentId: { in: state.fulfillmentIds ?? [] } },
          { fulfillmentItemId: { in: state.fulfillmentItemIds ?? [] } },
          { note: { contains: state.runId ?? MARKER } },
        ],
      },
    });
    await db.salesOrder.deleteMany({ where: { id: { in: state.orderIds ?? [] } } });
    await db.inventoryStock.deleteMany({ where: { variantId: { in: state.variantIds ?? [] } } });
    await db.productVariant.deleteMany({ where: { id: { in: state.variantIds ?? [] } } });
    await db.salesProduct.deleteMany({ where: { id: { in: state.productIds ?? [] } } });
    await db.purchaseOrder.deleteMany({ where: { id: { in: state.purchaseOrderIds ?? [] } } });
    await db.supplier.deleteMany({ where: { id: { in: state.supplierIds ?? [] } } });
    await db.salesCustomer.deleteMany({ where: { id: { in: state.customerIds ?? [] } } });

    const evidence = {
      remainingOrders: await db.salesOrder.count({ where: { orderNumber: { contains: state.runId ?? MARKER } } }),
      remainingCustomers: await db.salesCustomer.count({ where: { name: { contains: state.runId ?? MARKER } } }),
      remainingProducts: await db.salesProduct.count({ where: { name: { contains: state.runId ?? MARKER } } }),
      remainingVariants: await db.productVariant.count({ where: { sku: { contains: state.runId ?? MARKER } } }),
      remainingMovements: await db.inventoryMovement.count({
        where: {
          OR: [
            { variantId: { in: state.variantIds ?? [] } },
            { fulfillmentId: { in: state.fulfillmentIds ?? [] } },
            { fulfillmentItemId: { in: state.fulfillmentItemIds ?? [] } },
          ],
        },
      }),
      remainingPurchaseOrders: await db.purchaseOrder.count({
        where: { poNumber: { contains: state.runId ?? MARKER } },
      }),
      remainingSuppliers: await db.supplier.count({ where: { name: { contains: state.runId ?? MARKER } } }),
    };
    writeFileSync(STATE_PATH, JSON.stringify({ ...state, cleanup: evidence }, null, 2));
    console.log(JSON.stringify({ cleanup: evidence }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

async function create() {
  await cleanup().catch(() => {});
  const db = prisma();
  const runId = `phase3a3-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const state = {
    runId,
    marker: MARKER,
    customerIds: [],
    productIds: [],
    variantIds: [],
    orderIds: [],
    fulfillmentIds: [],
    fulfillmentItemIds: [],
    supplierIds: [],
    purchaseOrderIds: [],
    routes: {},
  };

  async function customer(label) {
    const row = await db.salesCustomer.create({
      data: {
        name: `${MARKER} ${label} ${runId}`,
        phone: "808-555-3399",
        email: `${label}-${runId}@example.com`,
        address: "3399 Browser Pickup Way",
        taxExempt: false,
        taxRate: 0,
      },
    });
    state.customerIds.push(row.id);
    return row;
  }

  async function variant(label, onHand) {
    const product = await db.salesProduct.create({
      data: {
        name: `${MARKER} ${label} product ${runId}`,
        title: `${label} browser product`,
        defaultDescription: `${MARKER} ${label}`,
        unit: "PIECE",
        price: 15,
        cost: 6,
        availableStock: onHand,
        active: true,
      },
    });
    state.productIds.push(product.id);
    const row = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: `PH3A3-BROWSER-${label.toUpperCase()}-${runId}`,
        displayName: `${label} browser variant`,
        description: `${MARKER} ${label}`,
        price: 15,
        cost: 6,
        isStockItem: true,
      },
    });
    state.variantIds.push(row.id);
    await db.inventoryStock.create({ data: { variantId: row.id, onHand, reserved: 0 } });
    return { product, variant: row };
  }

  async function purchaseOrder(label) {
    const supplier = await db.supplier.create({
      data: {
        name: `${MARKER} ${label} Supplier ${runId}`,
        contactName: "Browser Supplier Contact",
        phone: "808-555-3398",
        category: "Special Order Browser QA",
      },
    });
    state.supplierIds.push(supplier.id);
    const po = await db.purchaseOrder.create({
      data: {
        poNumber: `PO-PH3A3-BROWSER-${runId}-${label}`,
        supplierId: supplier.id,
        status: "ORDERED",
        orderDate: new Date("2026-07-20T00:00:00.000Z"),
        expectedArrival: new Date("2026-08-15T00:00:00.000Z"),
        totalCost: 30,
        notes: MARKER,
      },
    });
    state.purchaseOrderIds.push(po.id);
    return po;
  }

  async function pickup(label, variantInfo, qty, options = {}) {
    const account = await customer(label);
    const total = qty * 15;
    const order = await db.salesOrder.create({
      data: {
        orderNumber: `SO-PH3A3-BROWSER-${runId}-${label}`,
        customerId: account.id,
        docType: "SALES_ORDER",
        status: options.orderStatus ?? "READY",
        fulfillmentMethod: "PICKUP",
        specialOrder: Boolean(options.special),
        specialOrderStatus: options.special ? "ARRIVED" : null,
        etaDate: options.special ? new Date("2026-08-15T00:00:00.000Z") : null,
        subtotal: total,
        discount: 0,
        tax: 0,
        total,
        paidAmount: 0,
        balanceDue: total,
        paymentStatus: "unpaid",
        notes: MARKER,
        items: {
          create: {
            productId: variantInfo.product.id,
            variantId: variantInfo.variant.id,
            productSku: variantInfo.variant.sku,
            productTitle: variantInfo.product.title ?? variantInfo.product.name,
            skuSnapshot: variantInfo.variant.sku,
            titleSnapshot: variantInfo.variant.displayName ?? variantInfo.product.title,
            uomSnapshot: "PIECE",
            lineDescription: variantInfo.variant.displayName ?? variantInfo.product.title,
            quantity: qty,
            unitPrice: 15,
            lineDiscount: 0,
            lineTotal: total,
            isSpecialOrder: Boolean(options.special),
            specialOrderStatus: options.special ? "ARRIVED" : null,
            linkedPoId: options.poId ?? null,
            notes: MARKER,
          },
        },
      },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    state.orderIds.push(order.id);
    await db.inventoryStock.update({
      where: { variantId: variantInfo.variant.id },
      data: { reserved: { increment: qty } },
    });
    const fulfillment = await db.salesOrderFulfillment.create({
      data: {
        salesOrderId: order.id,
        customerId: account.id,
        type: "PICKUP",
        status: options.fulfillmentStatus ?? "READY",
        scheduledAt: new Date("2026-07-20T15:00:00.000Z"),
        scheduledDate: new Date("2026-07-20T00:00:00.000Z"),
        pickupContact: `${MARKER} Pickup Contact`,
        notes: MARKER,
        items: {
          create: order.items.map((item) => ({
            salesOrderItemId: item.id,
            variantId: item.variantId,
            title: item.titleSnapshot ?? item.lineDescription,
            sku: item.skuSnapshot ?? "-",
            unit: item.uomSnapshot ?? "PIECE",
            orderedQty: item.quantity,
            fulfilledQty: options.fulfilledQty ?? 0,
            notes: MARKER,
          })),
        },
      },
      include: { items: true },
    });
    state.fulfillmentIds.push(fulfillment.id);
    fulfillment.items.forEach((item) => state.fulfillmentItemIds.push(item.id));
    await db.salesOutboundQueue.create({
      data: {
        salesOrderId: order.id,
        fulfillmentId: fulfillment.id,
        type: "PICKUP",
        status: fulfillment.status,
        scheduledDate: fulfillment.scheduledDate ?? new Date("2026-07-20T00:00:00.000Z"),
        notes: MARKER,
      },
    });
    return { order, fulfillment };
  }

  try {
    const ready = await pickup("ready-pickup", await variant("ready", 10), 2);
    const partial = await pickup("partial-pickup", await variant("partial", 10), 5);
    const error = await pickup("error-pickup", await variant("error", 1), 4);
    const specialPo = await purchaseOrder("special");
    const special = await pickup("special-pickup", await variant("special", 8), 2, {
      special: true,
      poId: specialPo.id,
    });
    const completedVariant = await variant("completed", 6);
    const completed = await pickup("completed-pickup", completedVariant, 1, {
      orderStatus: "FULFILLED",
      fulfillmentStatus: "PICKED_UP",
      fulfilledQty: 1,
    });
    await db.salesOrderItem.update({
      where: { id: completed.order.items[0].id },
      data: { fulfillQty: 1 },
    });
    await db.inventoryStock.update({
      where: { variantId: completedVariant.variant.id },
      data: { onHand: 5, reserved: 0 },
    });
    await db.inventoryMovement.create({
      data: {
        variantId: completedVariant.variant.id,
        fulfillmentId: completed.fulfillment.id,
        fulfillmentItemId: completed.fulfillment.items[0].id,
        type: "FULFILLMENT_DEDUCT",
        qty: -1,
        unit: "piece",
        note: `${MARKER} completed browser fixture`,
      },
    });

    state.routes = {
      pickupQueue: `/warehouse?method=pickup&section=ready&search=${runId}`,
      ready: `/fulfillment/${ready.fulfillment.id}`,
      partial: `/fulfillment/${partial.fulfillment.id}`,
      error: `/fulfillment/${error.fulfillment.id}`,
      special: `/fulfillment/${special.fulfillment.id}`,
      completed: `/fulfillment/${completed.fulfillment.id}`,
      readyOrderNumber: ready.order.orderNumber,
      partialOrderNumber: partial.order.orderNumber,
      errorOrderNumber: error.order.orderNumber,
      specialOrderNumber: special.order.orderNumber,
      completedOrderNumber: completed.order.orderNumber,
      errorVariantId: state.variantIds[2],
    };
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(JSON.stringify(state.routes, null, 2));
  } finally {
    await db.$disconnect();
  }
}

async function restoreErrorStock() {
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const db = prisma();
  try {
    await db.inventoryStock.update({
      where: { variantId: state.routes.errorVariantId },
      data: { onHand: 4 },
    });
    console.log(JSON.stringify({ restored: state.routes.errorVariantId, onHand: 4 }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

const command = process.argv[2] ?? "create";
if (command === "create") await create();
else if (command === "cleanup") await cleanup();
else if (command === "restore-error-stock") await restoreErrorStock();
else throw new Error(`Unknown command ${command}`);
