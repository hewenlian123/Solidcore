import { Prisma, SalesFulfillmentStatus } from "@prisma/client";
import {
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";

const FINAL_STATUSES = new Set(["DELIVERED", "PICKED_UP", "COMPLETED"]);
const ACTIVE_SALES_ORDER_STATUSES = new Set([
  "CONFIRMED",
  "READY",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
]);
const NON_MUTABLE_FULFILLMENT_STATUSES = new Set(["CANCELLED"]);

export class InventoryDeductionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InventoryDeductionError";
    this.status = status;
  }
}

export function isInventoryDeductionError(
  error: unknown,
): error is InventoryDeductionError {
  return (
    error instanceof InventoryDeductionError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "InventoryDeductionError" &&
      typeof (error as { status?: unknown }).status === "number" &&
      typeof (error as { message?: unknown }).message === "string")
  );
}

export function isFinalFulfillmentStatus(status: string | null | undefined) {
  return FINAL_STATUSES.has(String(status ?? "").toUpperCase());
}

function toDecimal(value: unknown) {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal((value ?? 0) as Prisma.Decimal.Value);
}

function normalizeUnit(rawUnit: string | null | undefined) {
  const unit = String(rawUnit ?? "")
    .trim()
    .toLowerCase();
  if (unit.includes("box")) return "box";
  if (unit.includes("sqft") || unit === "sf" || unit === "ft2") return "sqft";
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc")
    return "piece";
  return unit || "unit";
}

function toStockDeductQty(input: {
  fulfilledQty: Prisma.Decimal;
  unit: string;
  boxSqft: Prisma.Decimal | null;
}) {
  if (input.fulfilledQty.lte(0)) return null;
  const normalized = normalizeUnit(input.unit);
  if (normalized === "sqft" && input.boxSqft && input.boxSqft.gt(0)) {
    const boxes = input.fulfilledQty.div(input.boxSqft).ceil();
    return {
      qty: boxes,
      unit: "box",
      noteSuffix: `converted from ${input.fulfilledQty.toString()} sqft using ${input.boxSqft.toString()} sqft/box`,
    };
  }
  return {
    qty: input.fulfilledQty,
    unit: normalized,
    noteSuffix: null as string | null,
  };
}

async function lockFulfillmentRows(
  tx: Prisma.TransactionClient,
  fulfillmentId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM sales_order_fulfillments WHERE id = ${fulfillmentId} FOR UPDATE`,
  );
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM sales_order_fulfillment_items WHERE fulfillment_id = ${fulfillmentId} ORDER BY created_at FOR UPDATE`,
  );
}

async function lockInventoryRows(
  tx: Prisma.TransactionClient,
  variantIds: Array<string | null | undefined>,
) {
  const ids = Array.from(new Set(variantIds.filter(Boolean))) as string[];
  if (ids.length === 0) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT variant_id FROM inventory_stock WHERE variant_id IN (${Prisma.join(
      ids,
    )}) FOR UPDATE`,
  );
}

async function getDeductedStockQtyForFulfillmentItem(
  tx: Prisma.TransactionClient,
  fulfillmentItemId: string,
) {
  const aggregate = await tx.inventoryMovement.aggregate({
    where: {
      fulfillmentItemId,
      type: "FULFILLMENT_DEDUCT",
    },
    _sum: { qty: true },
  });
  const sum = toDecimal(aggregate._sum.qty);
  return sum.lt(0) ? sum.negated() : sum;
}

function assertFulfillmentCanMutate(args: {
  fulfillmentStatus: string;
  salesOrderStatus: string;
  docType: string;
}) {
  const orderStatus = String(args.salesOrderStatus ?? "").toUpperCase();
  const fulfillmentStatus = String(args.fulfillmentStatus ?? "").toUpperCase();
  const docType = String(args.docType ?? "").toUpperCase();

  if (
    docType === "QUOTE" ||
    orderStatus === "DRAFT" ||
    orderStatus === "QUOTED"
  ) {
    throw new InventoryDeductionError(
      "Fulfillment is available only after a Sales Order is confirmed.",
      409,
    );
  }
  if (orderStatus === "CANCELLED") {
    throw new InventoryDeductionError(
      "Cancelled Sales Orders cannot be fulfilled.",
      409,
    );
  }
  if (!ACTIVE_SALES_ORDER_STATUSES.has(orderStatus)) {
    throw new InventoryDeductionError(
      "Sales Order status does not allow fulfillment.",
      409,
    );
  }
  if (NON_MUTABLE_FULFILLMENT_STATUSES.has(fulfillmentStatus)) {
    throw new InventoryDeductionError(
      "Cancelled fulfillments cannot be updated.",
      409,
    );
  }
}

async function syncFulfillmentState(
  tx: Prisma.TransactionClient,
  fulfillmentId: string,
  options: {
    forceStatus?: SalesFulfillmentStatus;
    operator?: string | null;
  } = {},
) {
  const fulfillment = await tx.salesOrderFulfillment.findUnique({
    where: { id: fulfillmentId },
    select: {
      id: true,
      status: true,
      salesOrderId: true,
      items: {
        select: {
          id: true,
          fulfilledQty: true,
          orderedQty: true,
        },
      },
    },
  });
  if (!fulfillment)
    throw new InventoryDeductionError("Fulfillment not found.", 404);

  const allCompleted =
    fulfillment.items.length > 0 &&
    fulfillment.items.every((item) =>
      toDecimal(item.fulfilledQty).gte(toDecimal(item.orderedQty)),
    );
  const anyFulfilled = fulfillment.items.some((item) =>
    toDecimal(item.fulfilledQty).gt(0),
  );
  const now = new Date();

  let nextStatus = options.forceStatus;
  if (!nextStatus) {
    if (allCompleted) {
      nextStatus = "COMPLETED";
    } else if (anyFulfilled) {
      nextStatus = "PARTIAL";
    }
  }

  const finalStatus = nextStatus && isFinalFulfillmentStatus(nextStatus);
  await tx.salesOrderFulfillment.update({
    where: { id: fulfillment.id },
    data: {
      status: nextStatus,
      markedDoneAt: finalStatus ? now : undefined,
      inventoryDeductedAt: finalStatus && allCompleted ? now : undefined,
      inventoryDeductedBy:
        finalStatus && allCompleted && options.operator
          ? String(options.operator)
          : undefined,
    },
  });

  const nextSalesOrderStatus = allCompleted
    ? "FULFILLED"
    : anyFulfilled
      ? "PARTIALLY_FULFILLED"
      : undefined;
  if (nextSalesOrderStatus) {
    await tx.salesOrder.update({
      where: { id: fulfillment.salesOrderId },
      data: { status: nextSalesOrderStatus },
    });
  }

  await syncSalesOutboundQueue(tx, fulfillment.salesOrderId);
  await syncInventoryReservationForSalesOrder(tx, fulfillment.salesOrderId);
}

export async function setFulfillmentItemFulfilledQuantity(
  tx: Prisma.TransactionClient,
  args: {
    fulfillmentItemId: string;
    fulfilledQty: number | Prisma.Decimal;
    notes?: string | null;
    operator?: string | null;
    syncAfter?: boolean;
  },
) {
  const requestedQty = toDecimal(args.fulfilledQty);
  if (!requestedQty.isFinite() || requestedQty.lt(0)) {
    throw new InventoryDeductionError("fulfilledQty must be >= 0.", 400);
  }

  const itemForLock = await tx.salesOrderFulfillmentItem.findUnique({
    where: { id: args.fulfillmentItemId },
    select: { fulfillmentId: true },
  });
  if (!itemForLock)
    throw new InventoryDeductionError("Fulfillment item not found.", 404);
  await lockFulfillmentRows(tx, itemForLock.fulfillmentId);

  const item = await tx.salesOrderFulfillmentItem.findUnique({
    where: { id: args.fulfillmentItemId },
    select: {
      id: true,
      fulfillmentId: true,
      salesOrderItemId: true,
      variantId: true,
      title: true,
      sku: true,
      unit: true,
      orderedQty: true,
      fulfilledQty: true,
      variant: { select: { sku: true, boxSqft: true } },
      fulfillment: {
        select: {
          id: true,
          status: true,
          salesOrderId: true,
          salesOrder: { select: { id: true, status: true, docType: true } },
        },
      },
    },
  });
  if (!item)
    throw new InventoryDeductionError("Fulfillment item not found.", 404);
  assertFulfillmentCanMutate({
    fulfillmentStatus: item.fulfillment.status,
    salesOrderStatus: item.fulfillment.salesOrder.status,
    docType: item.fulfillment.salesOrder.docType,
  });

  const orderedQty = toDecimal(item.orderedQty);
  if (requestedQty.gt(orderedQty)) {
    throw new InventoryDeductionError(
      `fulfilled_qty cannot exceed ordered_qty for SKU ${item.sku || item.variant?.sku || item.variantId}.`,
      400,
    );
  }

  const targetDeduction = toStockDeductQty({
    fulfilledQty: requestedQty,
    unit: item.unit,
    boxSqft: item.variant?.boxSqft ?? null,
  });
  const targetStockQty = targetDeduction?.qty ?? new Prisma.Decimal(0);
  const alreadyDeducted = await getDeductedStockQtyForFulfillmentItem(
    tx,
    item.id,
  );

  if (targetStockQty.lt(alreadyDeducted)) {
    throw new InventoryDeductionError(
      "Fulfilled quantity cannot be reduced below quantity already deducted from inventory.",
      409,
    );
  }

  const delta = targetStockQty.minus(alreadyDeducted);
  if (item.variantId && delta.gt(0)) {
    await lockInventoryRows(tx, [item.variantId]);
    const stock = await tx.inventoryStock.findUnique({
      where: { variantId: item.variantId },
      select: { onHand: true, hold: true },
    });
    const onHand = toDecimal(stock?.onHand);
    const usableOnHand = onHand.minus(toDecimal(stock?.hold));
    if (usableOnHand.lt(delta)) {
      const sku = item.sku || item.variant?.sku || item.variantId;
      const available = usableOnHand.lt(0)
        ? new Prisma.Decimal(0)
        : usableOnHand;
      throw new InventoryDeductionError(
        `Insufficient stock for SKU ${sku}. Available: ${available.toString()}, required: ${delta.toString()}`,
        400,
      );
    }

    await tx.inventoryStock.update({
      where: { variantId: item.variantId },
      data: { onHand: { decrement: delta } },
    });

    await tx.inventoryMovement.create({
      data: {
        variantId: item.variantId,
        fulfillmentId: item.fulfillmentId,
        fulfillmentItemId: item.id,
        type: "FULFILLMENT_DEDUCT",
        qty: delta.negated(),
        unit: targetDeduction?.unit ?? normalizeUnit(item.unit),
        note: targetDeduction?.noteSuffix
          ? `Fulfillment completed - ${item.title}: ${targetDeduction.noteSuffix}`
          : `Fulfillment completed - ${item.title}`,
      },
    });
  }

  const updated = await tx.salesOrderFulfillmentItem.update({
    where: { id: item.id },
    data: {
      fulfilledQty: requestedQty,
      notes: args.notes !== undefined ? args.notes : undefined,
    },
  });

  await tx.salesOrderItem.update({
    where: { id: item.salesOrderItemId },
    data: { fulfillQty: requestedQty },
  });

  if (args.syncAfter !== false) {
    await syncFulfillmentState(tx, item.fulfillmentId, {
      operator: args.operator,
    });
  }
  return updated;
}

export async function setFulfillmentStatus(
  tx: Prisma.TransactionClient,
  args: {
    fulfillmentId: string;
    status: SalesFulfillmentStatus;
    operator?: string | null;
    markedOutAt?: Date | null;
    markedDoneAt?: Date | null;
  },
) {
  await lockFulfillmentRows(tx, args.fulfillmentId);
  const fulfillment = await tx.salesOrderFulfillment.findUnique({
    where: { id: args.fulfillmentId },
    select: {
      id: true,
      status: true,
      salesOrderId: true,
      salesOrder: { select: { id: true, status: true, docType: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: { id: true, orderedQty: true },
      },
    },
  });
  if (!fulfillment)
    throw new InventoryDeductionError("Fulfillment not found.", 404);

  const nextStatus = args.status;
  const finalStatus = isFinalFulfillmentStatus(nextStatus);
  if (finalStatus) {
    assertFulfillmentCanMutate({
      fulfillmentStatus: fulfillment.status,
      salesOrderStatus: fulfillment.salesOrder.status,
      docType: fulfillment.salesOrder.docType,
    });

    for (const item of fulfillment.items) {
      await setFulfillmentItemFulfilledQuantity(tx, {
        fulfillmentItemId: item.id,
        fulfilledQty: item.orderedQty,
        operator: args.operator,
        syncAfter: false,
      });
    }
  } else if (nextStatus === "CANCELLED") {
    const deducted = await tx.inventoryMovement.count({
      where: { fulfillmentId: fulfillment.id, type: "FULFILLMENT_DEDUCT" },
    });
    if (deducted > 0) {
      throw new InventoryDeductionError(
        "Fulfillment with deducted inventory cannot be cancelled without a return or reversal.",
        409,
      );
    }
  }

  const now = new Date();
  const updated = await tx.salesOrderFulfillment.update({
    where: { id: fulfillment.id },
    data: {
      status: nextStatus,
      markedOutAt:
        args.markedOutAt ??
        (nextStatus === "OUT_FOR_DELIVERY" ? now : undefined),
      markedDoneAt: args.markedDoneAt ?? (finalStatus ? now : undefined),
      inventoryDeductedAt: finalStatus ? now : undefined,
      inventoryDeductedBy:
        finalStatus && args.operator ? String(args.operator) : undefined,
    },
  });

  if (nextStatus === "IN_PROGRESS" || nextStatus === "READY") {
    await tx.salesOrder.update({
      where: { id: fulfillment.salesOrderId },
      data: { status: "READY" },
    });
  }

  await syncFulfillmentState(tx, fulfillment.id, {
    forceStatus: nextStatus,
    operator: args.operator,
  });
  return updated;
}

export async function deductInventoryForFulfillment(
  tx: Prisma.TransactionClient,
  args: { fulfillmentId: string; operator?: string | null },
) {
  const fulfillment = await tx.salesOrderFulfillment.findUnique({
    where: { id: args.fulfillmentId },
    select: { id: true, status: true },
  });
  if (!fulfillment)
    throw new InventoryDeductionError("Fulfillment not found.", 404);
  if (!isFinalFulfillmentStatus(fulfillment.status)) {
    return { deducted: false, reason: "not_final" as const };
  }

  await setFulfillmentStatus(tx, {
    fulfillmentId: args.fulfillmentId,
    status: fulfillment.status,
    operator: args.operator,
  });
  return { deducted: true, reason: "ok" as const };
}
