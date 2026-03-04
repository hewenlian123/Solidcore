import { Prisma, SalesOrderStatus } from "@prisma/client";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toFlooringRequiredBoxes(quantitySqft: number, sqftPerBox: number) {
  if (!Number.isFinite(quantitySqft) || quantitySqft <= 0) return 0;
  if (!Number.isFinite(sqftPerBox) || sqftPerBox <= 0) return 0;
  return Math.ceil(quantitySqft / sqftPerBox);
}

export class FlooringAllocationError extends Error {
  variantName: string;
  requiredBoxes: number;
  availableBoxes: number;

  constructor(args: { variantName: string; requiredBoxes: number; availableBoxes: number }) {
    super("FLOORING_ALLOCATION_FAILED");
    this.name = "FlooringAllocationError";
    this.variantName = args.variantName;
    this.requiredBoxes = args.requiredBoxes;
    this.availableBoxes = args.availableBoxes;
  }
}

export class ReserveApplyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReserveApplyError";
    this.status = status;
  }
}

export class ReserveReleaseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReserveReleaseError";
    this.status = status;
  }
}

function normalizeReserveUnit(rawUnit: string | null | undefined, hasBoxCoverage: boolean) {
  if (hasBoxCoverage) return "box";
  const unit = String(rawUnit ?? "").trim().toLowerCase();
  if (unit.includes("sqft") || unit === "sf" || unit === "ft2" || unit === "sqm") return "sqft";
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc") return "piece";
  return unit || "piece";
}

export function canTransitionSalesOrderStatus(
  from: SalesOrderStatus,
  to: SalesOrderStatus,
) {
  if (from === to) return true;
  if (from === "CANCELLED" || from === "FULFILLED") return false;
  if (from === "DRAFT") return to === "QUOTED" || to === "CONFIRMED" || to === "CANCELLED";
  if (from === "QUOTED")
    return to === "CONFIRMED" || to === "DRAFT" || to === "CANCELLED";
  if (from === "CONFIRMED")
    return (
      to === "READY" ||
      to === "PARTIALLY_FULFILLED" ||
      to === "FULFILLED" ||
      to === "CANCELLED"
    );
  if (from === "READY")
    return to === "PARTIALLY_FULFILLED" || to === "FULFILLED" || to === "CANCELLED";
  if (from === "PARTIALLY_FULFILLED")
    return to === "FULFILLED" || to === "CANCELLED";
  return false;
}

export async function generateNextSalesOrderNumber(
  tx: Prisma.TransactionClient,
  docType: "QUOTE" | "SALES_ORDER" = "SALES_ORDER",
) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.salesOrderCounter.upsert({
    where: { year },
    update: { lastValue: { increment: 1 } },
    create: { year, lastValue: 1 },
  });
  const serial = String(counter.lastValue).padStart(4, "0");
  const prefix = docType === "QUOTE" ? "QT" : "SO";
  return `${prefix}-${year}-${serial}`;
}

export async function recalculateSalesOrder(tx: Prisma.TransactionClient, salesOrderId: string) {
  const [order, items, payments] = await Promise.all([
    tx.salesOrder.findUnique({
      where: { id: salesOrderId },
      select: { id: true, discount: true, tax: true, commissionRate: true },
    }),
    tx.salesOrderItem.findMany({
      where: { salesOrderId },
      select: { lineTotal: true },
    }),
    tx.salesOrderPayment.findMany({
      where: { salesOrderId, status: "POSTED" },
      select: { amount: true },
    }),
  ]);

  if (!order) {
    throw new Error("Sales order not found");
  }

  const subtotal = roundCurrency(
    items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
  );
  const paidAmount = roundCurrency(
    payments.reduce((sum, p) => sum + Number(p.amount), 0),
  );
  const discount = Number(order.discount);
  const tax = Number(order.tax);
  const total = roundCurrency(subtotal - discount + tax);
  const balanceDue = roundCurrency(total - paidAmount);
  const commissionAmount = roundCurrency(paidAmount * Number(order.commissionRate));
  const paymentStatus = getSalesPaymentStatusLabel(paidAmount, balanceDue);

  return tx.salesOrder.update({
    where: { id: salesOrderId },
    data: {
      subtotal,
      total,
      paidAmount,
      balanceDue,
      paymentStatus,
      commissionAmount,
    },
  });
}

export function getSalesPaymentStatusLabel(paidAmount: number, balanceDue: number) {
  if (balanceDue <= 0) return "paid";
  if (paidAmount > 0) return "partial";
  return "unpaid";
}

export async function syncSalesOutboundQueue(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
) {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      fulfillments: {
        where: { status: { notIn: ["CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!order) return;

  const latest = order.fulfillments[0];
  const shouldQueue =
    (order.status === "CONFIRMED" ||
      order.status === "READY" ||
      order.status === "PARTIALLY_FULFILLED") &&
    !!latest;

  if (!shouldQueue || !latest) {
    await tx.salesOutboundQueue.deleteMany({ where: { salesOrderId } });
    return;
  }

  await tx.salesOutboundQueue.upsert({
    where: { salesOrderId },
    create: {
      salesOrderId,
      fulfillmentId: latest.id,
      type: latest.type,
      status: latest.status,
      scheduledDate: latest.scheduledDate ?? new Date(),
      address: latest.address,
      notes: latest.notes,
    },
    update: {
      fulfillmentId: latest.id,
      type: latest.type,
      status: latest.status,
      scheduledDate: latest.scheduledDate ?? new Date(),
      address: latest.address,
      notes: latest.notes,
    },
  });
}

export async function applyReservedForSalesOrder(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
) {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: {
      id: true,
      orderNumber: true,
      reservedAppliedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
        },
      },
    },
  });
  if (!order) throw new ReserveApplyError("Sales order not found.", 404);
  if (order.reservedAppliedAt) return { applied: false, reason: "already_applied" as const };

  const claimed = await tx.salesOrder.updateMany({
    where: { id: salesOrderId, reservedAppliedAt: null },
    data: { reservedAppliedAt: new Date() },
  });
  if (claimed.count === 0) return { applied: false, reason: "already_applied" as const };

  const variantIds = Array.from(
    new Set(order.items.map((item) => item.variantId).filter(Boolean)),
  ) as string[];
  const variantRows = variantIds.length
    ? await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          boxSqft: true,
          product: { select: { unit: true } },
        },
      })
    : [];
  const variantById = new Map(variantRows.map((row) => [row.id, row]));

  for (const item of order.items) {
    const qty = Number(item.quantity ?? 0);
    if (qty <= 0) continue;
    if (!item.variantId) {
      throw new ReserveApplyError(`Item ${item.id} is missing variant_id.`, 400);
    }

    await tx.inventoryStock.upsert({
      where: { variantId: item.variantId },
      create: { variantId: item.variantId, onHand: 0, reserved: qty },
      update: { reserved: { increment: qty } },
    });

    const variantMeta = variantById.get(item.variantId);
    await tx.inventoryMovement.create({
      data: {
        variantId: item.variantId,
        type: "RESERVE",
        qty,
        unit: normalizeReserveUnit(
          variantMeta?.product?.unit ?? null,
          Number(variantMeta?.boxSqft ?? 0) > 0,
        ),
        note: `Reserved for SO ${order.orderNumber}`,
      },
    });
  }

  return { applied: true, reason: "ok" as const };
}

export async function releaseReservedForSalesOrder(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
) {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: {
      id: true,
      reservedAppliedAt: true,
      reservedReleasedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          fulfillQty: true,
        },
      },
    },
  });
  if (!order) throw new ReserveReleaseError("Sales order not found.", 404);
  if (!order.reservedAppliedAt) return { released: false, reason: "not_applied" as const };
  if (order.reservedReleasedAt) return { released: false, reason: "already_released" as const };

  const claimed = await tx.salesOrder.updateMany({
    where: {
      id: salesOrderId,
      reservedAppliedAt: { not: null },
      reservedReleasedAt: null,
    },
    data: { reservedReleasedAt: new Date() },
  });
  if (claimed.count === 0) return { released: false, reason: "already_released" as const };

  for (const item of order.items) {
    if (!item.variantId) continue;
    const qtyReservedOriginal = Number(item.quantity ?? 0);
    if (qtyReservedOriginal <= 0) continue;
    const qtyAlreadyFulfilled = Math.max(0, Number(item.fulfillQty ?? 0));
    const remaining = Math.max(qtyReservedOriginal - qtyAlreadyFulfilled, 0);
    if (remaining <= 0) continue;

    const stock = await tx.inventoryStock.findUnique({
      where: { variantId: item.variantId },
      select: { reserved: true },
    });
    const currentReserved = Number(stock?.reserved ?? 0);
    const nextReserved = Math.max(currentReserved - remaining, 0);
    await tx.inventoryStock.upsert({
      where: { variantId: item.variantId },
      create: { variantId: item.variantId, onHand: 0, reserved: 0 },
      update: { reserved: nextReserved },
    });
  }

  return { released: true, reason: "ok" as const };
}

export async function syncInventoryReservationForSalesOrder(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
) {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { id: true, status: true },
  });
  if (!order) return;

  const reservableStatuses = ["CONFIRMED", "READY", "PARTIALLY_FULFILLED"];
  const items = await tx.salesOrderItem.findMany({
    where: { salesOrderId },
    select: { variantId: true, productId: true, quantity: true, fulfillQty: true },
  });
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[];
  const productMetaRows = productIds.length
    ? await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, category: true, flooringBoxCoverageSqft: true },
      })
    : [];
  const productMetaById = new Map(productMetaRows.map((row) => [row.id, row]));
  const reservationByVariant = new Map<string, number>();
  if (reservableStatuses.includes(order.status)) {
    for (const item of items) {
      if (!item.variantId) continue;
      const qty = Number(item.quantity || 0);
      const fulfilled = Number(item.fulfillQty || 0);
      const productMeta = productMetaById.get(String(item.productId ?? ""));
      const isFlooring = productMeta?.category === "FLOOR";
      const reserved = isFlooring
        ? toFlooringRequiredBoxes(qty, Number(productMeta?.flooringBoxCoverageSqft ?? 0))
        : Math.max(qty - fulfilled, 0);
      reservationByVariant.set(
        item.variantId,
        roundCurrency((reservationByVariant.get(item.variantId) ?? 0) + reserved),
      );
    }
  }

  const variantIdsInOrder = Array.from(
    new Set(items.map((it) => it.variantId).filter(Boolean)),
  ) as string[];
  const stockRows = variantIdsInOrder.length
    ? await tx.inventoryStock.findMany({
        where: { variantId: { in: variantIdsInOrder } },
        select: {
          variantId: true,
          onHand: true,
          reserved: true,
          variant: {
            select: {
              description: true,
              sku: true,
            },
          },
        },
      })
    : [];
  const stockByVariant = new Map(stockRows.map((row) => [row.variantId, row]));

  for (const variantId of variantIdsInOrder) {
    const targetReserved = Number(reservationByVariant.get(variantId) ?? 0);
    const stock = stockByVariant.get(variantId);
    const onHand = Number(stock?.onHand ?? 0);
    const currentReserved = Number(stock?.reserved ?? 0);
    const availableBoxes = onHand - currentReserved;
    const delta = targetReserved - currentReserved;
    if (delta > availableBoxes) {
      const variantName =
        String(stock?.variant?.description ?? "").trim() ||
        String(stock?.variant?.sku ?? "").trim() ||
        variantId;
      throw new FlooringAllocationError({
        variantName,
        requiredBoxes: Math.ceil(delta),
        availableBoxes: Math.max(0, Math.floor(availableBoxes)),
      });
    }
    await tx.inventoryStock.upsert({
      where: { variantId },
      create: { variantId, onHand: 0, reserved: targetReserved },
      update: { reserved: targetReserved },
    });
  }
}

export async function applyFlooringFulfillmentDeduction(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
) {
  const items = await tx.salesOrderItem.findMany({
    where: { salesOrderId },
    select: { variantId: true, productId: true, quantity: true },
  });
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[];
  const productMetaRows = productIds.length
    ? await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, category: true, flooringBoxCoverageSqft: true },
      })
    : [];
  const productMetaById = new Map(productMetaRows.map((row) => [row.id, row]));
  const deductionByVariant = new Map<string, number>();

  for (const item of items) {
    if (!item.variantId) continue;
    const productMeta = productMetaById.get(String(item.productId ?? ""));
    if (productMeta?.category !== "FLOOR") continue;
    const boxes = toFlooringRequiredBoxes(
      Number(item.quantity ?? 0),
      Number(productMeta.flooringBoxCoverageSqft ?? 0),
    );
    if (boxes <= 0) continue;
    deductionByVariant.set(item.variantId, (deductionByVariant.get(item.variantId) ?? 0) + boxes);
  }

  for (const [variantId, boxes] of deductionByVariant.entries()) {
    const stock = await tx.inventoryStock.findUnique({
      where: { variantId },
      select: {
        onHand: true,
        reserved: true,
        variant: { select: { description: true, sku: true } },
      },
    });
    const onHand = Number(stock?.onHand ?? 0);
    const reserved = Number(stock?.reserved ?? 0);
    if (boxes > onHand) {
      const variantName =
        String(stock?.variant?.description ?? "").trim() ||
        String(stock?.variant?.sku ?? "").trim() ||
        variantId;
      throw new FlooringAllocationError({
        variantName,
        requiredBoxes: boxes,
        availableBoxes: Math.max(0, Math.floor(onHand)),
      });
    }
    await tx.inventoryStock.upsert({
      where: { variantId },
      create: {
        variantId,
        onHand: onHand - boxes,
        reserved: Math.max(reserved - boxes, 0),
      },
      update: {
        onHand: onHand - boxes,
        reserved: Math.max(reserved - boxes, 0),
      },
    });
  }
}

export function computeLineTotal(quantity: number, unitPrice: number, lineDiscount: number) {
  return quantity * unitPrice - lineDiscount;
}
