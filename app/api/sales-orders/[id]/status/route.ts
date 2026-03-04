import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  applyReservedForSalesOrder,
  applyFlooringFulfillmentDeduction,
  canTransitionSalesOrderStatus,
  FlooringAllocationError,
  ReserveApplyError,
  ReserveReleaseError,
  releaseReservedForSalesOrder,
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";
import { ensureFulfillmentFromSalesOrder } from "@/lib/fulfillment";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const SALES_ORDER_STATUS_VALUES = [
  "DRAFT",
  "QUOTED",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
] as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;
    const payload = await request.json();
    const rawStatus = String(payload.status ?? "").toUpperCase();
    const nextStatus = rawStatus === "PROCESSING" ? "READY" : rawStatus;
    if (!SALES_ORDER_STATUS_VALUES.includes(nextStatus as (typeof SALES_ORDER_STATUS_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const current = await prisma.salesOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (!canTransitionSalesOrderStatus(current.status, nextStatus as any)) {
      return NextResponse.json(
        { error: "Status transition is not allowed." },
        { status: 400 },
      );
    }

    const data = await prisma.$transaction(async (tx) => {
      if (nextStatus === "FULFILLED" && current.status !== "FULFILLED") {
        await applyFlooringFulfillmentDeduction(tx, id);
      }
      await tx.salesOrder.update({
        where: { id },
        data: { status: nextStatus as any },
      });
      if (nextStatus === "CONFIRMED") {
        await ensureFulfillmentFromSalesOrder(tx, {
          salesOrderId: id,
        });
        await applyReservedForSalesOrder(tx, id);
      }
      if (nextStatus === "CANCELLED") {
        await releaseReservedForSalesOrder(tx, id);
      }
      await syncSalesOutboundQueue(tx, id);
      await syncInventoryReservationForSalesOrder(tx, id);
      return tx.salesOrder.findUnique({
        where: { id },
        include: {
          customer: true,
          items: { include: { product: true }, orderBy: { createdAt: "asc" } },
          payments: { orderBy: { receivedAt: "desc" } },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof ReserveApplyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReserveReleaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof FlooringAllocationError) {
      return NextResponse.json(
        {
          error: `Insufficient stock for ${error.variantName}: need ${error.requiredBoxes} boxes, available ${error.availableBoxes} boxes.`,
        },
        { status: 400 },
      );
    }
    console.error("PATCH /api/sales-orders/[id]/status error:", error);
    return NextResponse.json({ error: "Failed to update status." }, { status: 500 });
  }
}
