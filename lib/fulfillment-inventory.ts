import { Prisma } from "@prisma/client";

const FINAL_STATUSES = new Set(["DELIVERED", "PICKED_UP", "COMPLETED"]);

export class InventoryDeductionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InventoryDeductionError";
    this.status = status;
  }
}

export function isFinalFulfillmentStatus(status: string | null | undefined) {
  return FINAL_STATUSES.has(String(status ?? "").toUpperCase());
}

function normalizeUnit(rawUnit: string | null | undefined) {
  const unit = String(rawUnit ?? "").trim().toLowerCase();
  if (unit.includes("box")) return "box";
  if (unit.includes("sqft") || unit === "sf" || unit === "ft2") return "sqft";
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc") return "piece";
  return unit || "unit";
}

function toDeductQty(input: {
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

export async function deductInventoryForFulfillment(
  tx: Prisma.TransactionClient,
  args: { fulfillmentId: string; operator?: string | null },
) {
  const fulfillment = await tx.salesOrderFulfillment.findUnique({
    where: { id: args.fulfillmentId },
    select: {
      id: true,
      status: true,
      inventoryDeductedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          sku: true,
          title: true,
          unit: true,
          fulfilledQty: true,
          orderedQty: true,
          variant: {
            select: {
              sku: true,
              boxSqft: true,
            },
          },
        },
      },
    },
  });
  if (!fulfillment) throw new InventoryDeductionError("Fulfillment not found.", 404);
  if (!isFinalFulfillmentStatus(fulfillment.status)) return { deducted: false, reason: "not_final" as const };
  if (fulfillment.inventoryDeductedAt) return { deducted: false, reason: "already_deducted" as const };

  const claimed = await tx.salesOrderFulfillment.updateMany({
    where: { id: fulfillment.id, inventoryDeductedAt: null },
    data: {
      inventoryDeductedAt: new Date(),
      inventoryDeductedBy: args.operator ? String(args.operator) : null,
    },
  });
  if (claimed.count === 0) return { deducted: false, reason: "already_deducted" as const };

  for (const item of fulfillment.items) {
    if (!item.variantId) continue;
    const fulfilledQty = new Prisma.Decimal(item.fulfilledQty ?? 0);
    const orderedQty = new Prisma.Decimal(item.orderedQty ?? 0);
    if (fulfilledQty.lt(0)) {
      throw new InventoryDeductionError(`Invalid fulfilled qty for SKU ${item.sku || item.variant?.sku || item.variantId}.`);
    }
    if (fulfilledQty.gt(orderedQty)) {
      throw new InventoryDeductionError(`fulfilled_qty cannot exceed ordered_qty for SKU ${item.sku || item.variant?.sku || item.variantId}.`);
    }
    const converted = toDeductQty({
      fulfilledQty,
      unit: item.unit,
      boxSqft: item.variant?.boxSqft ?? null,
    });
    if (!converted || converted.qty.lte(0)) continue;

    const stock = await tx.inventoryStock.findUnique({
      where: { variantId: item.variantId },
      select: { onHand: true, reserved: true },
    });
    const available = new Prisma.Decimal(stock?.onHand ?? 0);
    const currentReserved = new Prisma.Decimal(stock?.reserved ?? 0);
    if (available.lt(converted.qty)) {
      const sku = item.sku || item.variant?.sku || item.variantId;
      throw new InventoryDeductionError(
        `Insufficient stock for SKU ${sku}. Available: ${available.toString()}, required: ${converted.qty.toString()}`,
        400,
      );
    }

    const releasedReserved = currentReserved.minus(converted.qty);
    const nextReserved = releasedReserved.lt(0) ? new Prisma.Decimal(0) : releasedReserved;

    await tx.inventoryStock.update({
      where: { variantId: item.variantId },
      data: {
        onHand: { decrement: converted.qty },
        reserved: nextReserved,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        variantId: item.variantId,
        fulfillmentId: fulfillment.id,
        fulfillmentItemId: item.id,
        type: "FULFILLMENT_DEDUCT",
        qty: converted.qty.negated(),
        unit: converted.unit,
        note: converted.noteSuffix
          ? `Fulfillment completed - ${item.title}: ${converted.noteSuffix}`
          : `Fulfillment completed - ${item.title}`,
      },
    });
  }

  return { deducted: true, reason: "ok" as const };
}
