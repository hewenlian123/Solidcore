import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  completeFulfillmentHandoff,
  isFulfillmentHandoffError,
} from "@/lib/fulfillment-handoff";
import { isInventoryDeductionError } from "@/lib/fulfillment-inventory";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json().catch(() => ({}));

    const updated = await prisma.$transaction((tx) =>
      completeFulfillmentHandoff({
        tx,
        fulfillmentId: id,
        expectedType: "DELIVERY",
        finalStatus: "DELIVERED",
        operator: role,
        requestedItems: payload?.items,
        label: "Delivery",
        requireItems: true,
        requireEveryItem: true,
        eligibleStatuses: [
          "READY",
          "OUT_FOR_DELIVERY",
          "IN_PROGRESS",
          "PARTIAL",
          "DELIVERED",
          "COMPLETED",
        ],
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
    console.error("PATCH /api/fulfillments/[id]/delivery error:", error);
    return NextResponse.json(
      { error: "Failed to complete delivery." },
      { status: 500 },
    );
  }
}
