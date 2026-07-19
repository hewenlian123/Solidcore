import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isInventoryDeductionError,
  setFulfillmentItemFulfilledQuantity,
} from "@/lib/fulfillment-inventory";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing fulfillment item id." }, { status: 400 });

    const payload = await request.json();
    const data: {
      fulfilledQty?: number;
      notes?: string | null;
    } = {};

    if (payload.fulfilledQty !== undefined) {
      const value = Number(payload.fulfilledQty);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json({ error: "fulfilledQty must be >= 0." }, { status: 400 });
      }
      data.fulfilledQty = value;
    }
    if (payload.notes !== undefined) {
      const notes = String(payload.notes ?? "").trim();
      data.notes = notes.length > 0 ? notes : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.fulfilledQty !== undefined) {
        return setFulfillmentItemFulfilledQuantity(tx, {
          fulfillmentItemId: id,
          fulfilledQty: data.fulfilledQty,
          notes: data.notes,
          operator: role,
        });
      }
      const nextItem = await tx.salesOrderFulfillmentItem.update({
        where: { id },
        data,
      });
      return nextItem;
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (isInventoryDeductionError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/fulfillment-item/[id] error:", error);
    return NextResponse.json({ error: "Failed to update fulfillment item." }, { status: 500 });
  }
}
