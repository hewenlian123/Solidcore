import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  completeFulfillmentHandoff,
  isFulfillmentHandoffError,
} from "@/lib/fulfillment-handoff";
import {
  isInventoryDeductionError,
} from "@/lib/fulfillment-inventory";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const requestedItems = Array.isArray(payload?.items) ? payload.items : null;

    const updated = await prisma.$transaction((tx) =>
      completeFulfillmentHandoff({
        tx,
        fulfillmentId: id,
        expectedType: "PICKUP",
        finalStatus: "PICKED_UP",
        operator: role,
        requestedItems,
        label: "Pickup",
      }),
    );

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (isInventoryDeductionError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (isFulfillmentHandoffError(error)) {
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
