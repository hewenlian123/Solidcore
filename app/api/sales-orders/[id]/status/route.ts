import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canTransitionSalesOrderStatus,
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const SALES_ORDER_STATUS_VALUES = [
  "DRAFT",
  "QUOTED",
  "CONFIRMED",
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
    const nextStatus = String(payload.status ?? "").toUpperCase();
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
      await tx.salesOrder.update({
        where: { id },
        data: { status: nextStatus as any },
      });
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
    console.error("PATCH /api/sales-orders/[id]/status error:", error);
    return NextResponse.json({ error: "Failed to update status." }, { status: 500 });
  }
}
