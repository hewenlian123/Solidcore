import { Prisma, SalesFulfillmentStatus, SalesFulfillmentType } from "@prisma/client";
import {
  setFulfillmentItemFulfilledQuantity,
  setFulfillmentStatus,
} from "@/lib/fulfillment-inventory";

export class FulfillmentHandoffError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FulfillmentHandoffError";
    this.status = status;
  }
}

export function isFulfillmentHandoffError(error: unknown): error is FulfillmentHandoffError {
  return (
    error instanceof FulfillmentHandoffError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "FulfillmentHandoffError" &&
      typeof (error as { status?: unknown }).status === "number" &&
      typeof (error as { message?: unknown }).message === "string")
  );
}

export function parseHandoffQuantity(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Prisma.Decimal(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const quantity = new Prisma.Decimal(trimmed);
      return quantity.isFinite() ? quantity : null;
    } catch {
      return null;
    }
  }
  return null;
}

function toDecimal(value: unknown) {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal((value ?? 0) as Prisma.Decimal.Value);
}

function normalizeNotes(value: unknown) {
  if (value === undefined) return undefined;
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

type RequestedHandoffItem = {
  id: string;
  fulfilledQty: Prisma.Decimal;
  notes?: string | null;
};

type CompleteFulfillmentHandoffArgs = {
  tx: Prisma.TransactionClient;
  fulfillmentId: string;
  expectedType: SalesFulfillmentType;
  finalStatus: SalesFulfillmentStatus;
  operator?: string | null;
  requestedItems: unknown;
  label: "Pickup" | "Delivery";
  requireItems?: boolean;
  requireEveryItem?: boolean;
  eligibleStatuses?: ReadonlyArray<SalesFulfillmentStatus>;
};

export async function completeFulfillmentHandoff(args: CompleteFulfillmentHandoffArgs) {
  const fulfillment = await args.tx.salesOrderFulfillment.findUnique({
    where: { id: args.fulfillmentId },
    select: {
      id: true,
      type: true,
      status: true,
      salesOrder: { select: { id: true, status: true, docType: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          orderedQty: true,
          fulfilledQty: true,
          notes: true,
        },
      },
    },
  });
  if (!fulfillment) {
    throw new FulfillmentHandoffError("Fulfillment not found.", 404);
  }
  if (fulfillment.type !== args.expectedType) {
    throw new FulfillmentHandoffError(
      `Complete ${args.label} is available only for ${args.label.toLowerCase()} fulfillments.`,
      409,
    );
  }

  const currentStatus = String(fulfillment.status ?? "").toUpperCase();
  if (args.eligibleStatuses?.length) {
    const eligibleStatuses = new Set(args.eligibleStatuses.map((status) => String(status)));
    if (!eligibleStatuses.has(currentStatus)) {
      throw new FulfillmentHandoffError(
        `${args.label} cannot be completed while fulfillment status is ${fulfillment.status}.`,
        409,
      );
    }
  }

  if (!Array.isArray(args.requestedItems)) {
    if (args.requireItems) {
      throw new FulfillmentHandoffError(`${args.label} items are required.`, 400);
    }
  } else if (args.requestedItems.length === 0 && args.requireItems) {
    throw new FulfillmentHandoffError(`${args.label} items are required.`, 400);
  }

  const byId = new Map(fulfillment.items.map((item) => [item.id, item]));
  const requestedById = new Map<string, RequestedHandoffItem>();

  if (Array.isArray(args.requestedItems)) {
    for (const item of args.requestedItems) {
      const itemId = String((item as { id?: unknown } | null)?.id ?? "").trim();
      const existing = byId.get(itemId);
      if (!existing) {
        throw new FulfillmentHandoffError(
          `${args.label} items must belong to this fulfillment.`,
          400,
        );
      }
      const quantity = parseHandoffQuantity(
        (item as { fulfilledQty?: unknown } | null)?.fulfilledQty,
      );
      if (!quantity) {
        throw new FulfillmentHandoffError(
          `${args.label} quantity must be a finite number greater than or equal to 0.`,
          400,
        );
      }
      requestedById.set(itemId, {
        id: itemId,
        fulfilledQty: quantity,
        notes: normalizeNotes((item as { notes?: unknown } | null)?.notes),
      });
    }
  }

  if (args.requireEveryItem) {
    for (const item of fulfillment.items) {
      if (!requestedById.has(item.id)) {
        throw new FulfillmentHandoffError(
          `${args.label} quantity is required for every fulfillment item.`,
          400,
        );
      }
    }
  }

  const targets = fulfillment.items.map((item) => {
    const requested = requestedById.get(item.id);
    return {
      id: item.id,
      orderedQty: toDecimal(item.orderedQty),
      currentFulfilledQty: toDecimal(item.fulfilledQty),
      fulfilledQty: requested?.fulfilledQty ?? toDecimal(item.orderedQty),
      notes: requested?.notes,
    };
  });

  for (const target of targets) {
    if (!target.fulfilledQty.isFinite() || target.fulfilledQty.lt(0)) {
      throw new FulfillmentHandoffError(
        `${args.label} quantity must be a finite number greater than or equal to 0.`,
        400,
      );
    }
    if (target.fulfilledQty.gt(target.orderedQty)) {
      throw new FulfillmentHandoffError(
        `${args.label} quantity cannot exceed ordered quantity.`,
        400,
      );
    }
    if (target.fulfilledQty.lt(target.currentFulfilledQty)) {
      throw new FulfillmentHandoffError(
        `${args.label} quantity cannot be less than the already fulfilled quantity.`,
        409,
      );
    }
  }

  const anyFulfilled = targets.some((target) => target.fulfilledQty.gt(0));
  if (!anyFulfilled) {
    throw new FulfillmentHandoffError(
      `At least one ${args.label.toLowerCase()} quantity must be greater than 0.`,
      400,
    );
  }

  const allCompleted = targets.every((target) => target.fulfilledQty.gte(target.orderedQty));

  for (const target of targets) {
    await setFulfillmentItemFulfilledQuantity(args.tx, {
      fulfillmentItemId: target.id,
      fulfilledQty: target.fulfilledQty,
      notes: target.notes,
      operator: args.operator,
      syncAfter: false,
    });
  }

  if (allCompleted) {
    await setFulfillmentStatus(args.tx, {
      fulfillmentId: fulfillment.id,
      status: args.finalStatus,
      operator: args.operator,
    });
  } else {
    const syncTarget =
      targets.find((target) => target.fulfilledQty.gt(0)) ?? targets[0];
    await setFulfillmentItemFulfilledQuantity(args.tx, {
      fulfillmentItemId: syncTarget.id,
      fulfilledQty: syncTarget.fulfilledQty,
      notes: syncTarget.notes,
      operator: args.operator,
    });
  }

  return args.tx.salesOrderFulfillment.findUnique({
    where: { id: fulfillment.id },
    include: {
      salesOrder: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
        },
      },
      items: { orderBy: { createdAt: "asc" } },
    },
  });
}
