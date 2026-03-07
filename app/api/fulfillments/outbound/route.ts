import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const CLOSED_STATUSES = ["COMPLETED", "CANCELLED", "DELIVERED", "PICKED_UP"] as const;

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const rows = await prisma.salesOrderFulfillment.findMany({
      where: {
        status: { notIn: [...CLOSED_STATUSES] },
      },
      select: {
        id: true,
        type: true,
        status: true,
        scheduledAt: true,
        scheduledDate: true,
        timeWindow: true,
        driverName: true,
        pickupContact: true,
        shiptoPhone: true,
        shiptoNotes: true,
        notes: true,
        shiptoAddress1: true,
        shiptoAddress2: true,
        shiptoCity: true,
        shiptoState: true,
        shiptoZip: true,
        items: {
          select: {
            orderedQty: true,
            fulfilledQty: true,
          },
        },
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    });

    const data = rows
      .map((row) => {
        const scheduledAt = row.scheduledAt ?? row.scheduledDate;
        const address =
          row.type === "DELIVERY"
            ? [row.shiptoAddress1, row.shiptoAddress2, row.shiptoCity, row.shiptoState, row.shiptoZip]
                .map((part) => String(part ?? "").trim())
                .filter(Boolean)
                .join(", ")
            : "";

        const itemCount = row.items.length;
        const itemsCompleted = row.items.filter(
          (item) => Number(item.fulfilledQty ?? 0) >= Number(item.orderedQty ?? 0),
        ).length;
        const itemsAnyFulfilled = row.items.some((item) => Number(item.fulfilledQty ?? 0) > 0);
        const itemsAllCompleted = itemCount > 0 && itemsCompleted === itemCount;

        return {
          id: row.id,
          type: row.type,
          status: row.status,
          scheduledAt,
          timeWindow: row.timeWindow ?? null,
          driverName: row.driverName ?? null,
          pickupContact: row.pickupContact ?? null,
          phone: row.shiptoPhone ?? null,
          shiptoNotes: row.shiptoNotes ?? null,
          notes: row.notes ?? null,
          salesOrderId: row.salesOrder.id,
          salesOrderNumber: row.salesOrder.orderNumber,
          customerName: row.salesOrder.customer?.name ?? "-",
          address: address || "-",
          itemCount,
          itemsCompleted,
          itemsAnyFulfilled,
          itemsAllCompleted,
        };
      })
      .sort((a, b) => {
        if (!a.scheduledAt && !b.scheduledAt) return 0;
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/fulfillments/outbound error:", error);
    return NextResponse.json({ error: "Failed to load outbound fulfillments." }, { status: 500 });
  }
}
