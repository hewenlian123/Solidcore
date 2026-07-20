import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isInventoryDeductionError,
  setFulfillmentItemFulfilledQuantity,
  setFulfillmentStatus,
} from "@/lib/fulfillment-inventory";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

function toDecimal(value: unknown) {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal((value ?? 0) as Prisma.Decimal.Value);
}

function parseQuantity(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value))
    return new Prisma.Decimal(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed)))
      return new Prisma.Decimal(trimmed);
  }
  return null;
}

function normalizeNotes(value: unknown) {
  if (value === undefined) return undefined;
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const requestedItems = Array.isArray(payload?.items) ? payload.items : null;

    const updated = await prisma.$transaction(async (tx) => {
      const fulfillment = await tx.salesOrderFulfillment.findUnique({
        where: { id },
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
        throw new Error("FULFILLMENT_NOT_FOUND");
      }
      if (fulfillment.type !== "PICKUP") {
        throw new Error("NOT_PICKUP");
      }

      const byId = new Map(fulfillment.items.map((item) => [item.id, item]));
      const requestedById = new Map<
        string,
        { fulfilledQty: Prisma.Decimal; notes?: string | null }
      >();

      if (requestedItems) {
        for (const item of requestedItems) {
          const itemId = String(item?.id ?? "").trim();
          const existing = byId.get(itemId);
          if (!existing) throw new Error("INVALID_PICKUP_ITEM");
          const quantity = parseQuantity(item?.fulfilledQty);
          if (!quantity) throw new Error("INVALID_PICKUP_QTY");
          requestedById.set(itemId, {
            fulfilledQty: quantity,
            notes: normalizeNotes(item?.notes),
          });
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
          throw new Error("INVALID_PICKUP_QTY");
        }
        if (target.fulfilledQty.gt(target.orderedQty)) {
          throw new Error("PICKUP_QTY_EXCEEDS_ORDERED");
        }
        if (target.fulfilledQty.lt(target.currentFulfilledQty)) {
          throw new Error("PICKUP_QTY_BELOW_CURRENT");
        }
      }

      const anyFulfilled = targets.some((target) => target.fulfilledQty.gt(0));
      if (!anyFulfilled) throw new Error("PICKUP_QTY_REQUIRED");

      const allCompleted = targets.every((target) =>
        target.fulfilledQty.gte(target.orderedQty),
      );

      for (const target of targets) {
        await setFulfillmentItemFulfilledQuantity(tx, {
          fulfillmentItemId: target.id,
          fulfilledQty: target.fulfilledQty,
          notes: target.notes,
          operator: role,
          syncAfter: false,
        });
      }

      if (allCompleted) {
        await setFulfillmentStatus(tx, {
          fulfillmentId: fulfillment.id,
          status: "PICKED_UP",
          operator: role,
        });
      } else {
        const syncTarget =
          targets.find((target) => target.fulfilledQty.gt(0)) ?? targets[0];
        await setFulfillmentItemFulfilledQuantity(tx, {
          fulfillmentItemId: syncTarget.id,
          fulfilledQty: syncTarget.fulfilledQty,
          notes: syncTarget.notes,
          operator: role,
        });
      }

      return tx.salesOrderFulfillment.findUnique({
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
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (isInventoryDeductionError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof Error) {
      const statusMap: Record<string, { status: number; message: string }> = {
        FULFILLMENT_NOT_FOUND: {
          status: 404,
          message: "Fulfillment not found.",
        },
        NOT_PICKUP: {
          status: 409,
          message: "Complete Pickup is available only for pickup fulfillments.",
        },
        INVALID_PICKUP_ITEM: {
          status: 400,
          message: "Pickup items must belong to this fulfillment.",
        },
        INVALID_PICKUP_QTY: {
          status: 400,
          message:
            "Pickup quantity must be a finite number greater than or equal to 0.",
        },
        PICKUP_QTY_EXCEEDS_ORDERED: {
          status: 400,
          message: "Pickup quantity cannot exceed ordered quantity.",
        },
        PICKUP_QTY_BELOW_CURRENT: {
          status: 409,
          message:
            "Pickup quantity cannot be less than the already fulfilled quantity.",
        },
        PICKUP_QTY_REQUIRED: {
          status: 400,
          message: "At least one pickup quantity must be greater than 0.",
        },
      };
      const mapped = statusMap[error.message];
      if (mapped)
        return NextResponse.json(
          { error: mapped.message },
          { status: mapped.status },
        );
    }
    console.error("PATCH /api/fulfillments/[id]/pickup error:", error);
    return NextResponse.json(
      { error: "Failed to complete pickup." },
      { status: 500 },
    );
  }
}
