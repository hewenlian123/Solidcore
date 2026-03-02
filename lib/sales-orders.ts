import { Prisma, SalesOrderStatus } from "@prisma/client";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function canTransitionSalesOrderStatus(
  from: SalesOrderStatus,
  to: SalesOrderStatus,
) {
  if (from === to) return true;
  if (from === "CANCELLED" || from === "FULFILLED") return false;
  if (from === "DRAFT") return to === "QUOTED" || to === "CANCELLED";
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
        where: { status: { not: "CANCELLED" } },
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
      scheduledDate: latest.scheduledDate,
      address: latest.address,
      notes: latest.notes,
    },
    update: {
      fulfillmentId: latest.id,
      type: latest.type,
      status: latest.status,
      scheduledDate: latest.scheduledDate,
      address: latest.address,
      notes: latest.notes,
    },
  });
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
    select: { variantId: true, quantity: true, fulfillQty: true },
  });
  const reservationByVariant = new Map<string, number>();
  if (reservableStatuses.includes(order.status)) {
    for (const item of items) {
      if (!item.variantId) continue;
      const qty = Number(item.quantity || 0);
      const fulfilled = Number(item.fulfillQty || 0);
      const reserved = Math.max(qty - fulfilled, 0);
      reservationByVariant.set(
        item.variantId,
        roundCurrency((reservationByVariant.get(item.variantId) ?? 0) + reserved),
      );
    }
  }

  for (const [variantId, reserved] of reservationByVariant.entries()) {
    await tx.inventoryStock.upsert({
      where: { variantId },
      create: { variantId, onHand: 0, reserved },
      update: { reserved },
    });
  }

  // For variant lines on this order with no active reservation, clear reserved.
  const variantIdsInOrder = Array.from(
    new Set(items.map((it) => it.variantId).filter(Boolean)),
  ) as string[];
  for (const variantId of variantIdsInOrder) {
    if (reservationByVariant.has(variantId)) continue;
    await tx.inventoryStock.updateMany({
      where: { variantId },
      data: { reserved: 0 },
    });
  }
}

export function computeLineTotal(quantity: number, unitPrice: number, lineDiscount: number) {
  return quantity * unitPrice - lineDiscount;
}
