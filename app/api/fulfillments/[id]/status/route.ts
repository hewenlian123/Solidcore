import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deductInventoryForFulfillment, InventoryDeductionError, isFinalFulfillmentStatus } from "@/lib/fulfillment-inventory";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

const QUICK_STATUS_MAP: Record<string, "OUT_FOR_DELIVERY" | "DELIVERED" | "PICKED_UP" | "COMPLETED"> = {
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  picked_up: "PICKED_UP",
  completed: "COMPLETED",
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    const payload = await request.json();
    const mapped = QUICK_STATUS_MAP[String(payload?.status ?? "").toLowerCase()];
    if (!mapped) {
      return NextResponse.json({ error: "Invalid quick status." }, { status: 400 });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.salesOrderFulfillment.update({
        where: { id },
        data: {
          status: mapped,
          markedOutAt: mapped === "OUT_FOR_DELIVERY" ? now : undefined,
          markedDoneAt: mapped === "DELIVERED" || mapped === "PICKED_UP" || mapped === "COMPLETED" ? now : undefined,
        },
        select: { id: true, salesOrderId: true, status: true, markedOutAt: true, markedDoneAt: true },
      });
      if (isFinalFulfillmentStatus(next.status)) {
        await deductInventoryForFulfillment(tx, { fulfillmentId: next.id, operator: role });
      }
      await syncSalesOutboundQueue(tx, next.salesOrderId);
      return next;
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof InventoryDeductionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/fulfillments/[id]/status error:", error);
    return NextResponse.json({ error: "Failed to update fulfillment status." }, { status: 500 });
  }
}
