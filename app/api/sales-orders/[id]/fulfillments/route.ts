import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import { ensureFulfillmentFromSalesOrder } from "@/lib/fulfillment";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const FULFILLMENT_TYPES = ["PICKUP", "DELIVERY"] as const;
const FULFILLMENT_STATUS_MAP: Record<string, "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"> = {
  PENDING: "SCHEDULED",
  READY: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  VOIDED: "CANCELLED",
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  CANCELLED: "CANCELLED",
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;
    const payload = await request.json();
    const type = String(payload.type ?? "").toUpperCase();
    if (!FULFILLMENT_TYPES.includes(type as (typeof FULFILLMENT_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid fulfillment type." }, { status: 400 });
    }
    const mappedStatus = FULFILLMENT_STATUS_MAP[String(payload.status ?? "PENDING").toUpperCase()];
    if (!mappedStatus) {
      return NextResponse.json({ error: "Invalid fulfillment status." }, { status: 400 });
    }
    const scheduledDate = payload.scheduledDate ? new Date(payload.scheduledDate) : new Date();

    let createdFulfillmentId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const ensured = await ensureFulfillmentFromSalesOrder(tx, {
        salesOrderId: id,
        type: type as any,
      });
      const updated = await tx.salesOrderFulfillment.update({
        where: { id: ensured.fulfillment.id },
        data: {
          scheduledDate,
          status: mappedStatus,
          address: payload.address ? String(payload.address) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
        },
      });
      createdFulfillmentId = updated.id;
      if (updated.status === "IN_PROGRESS") {
        await tx.salesOrder.update({
          where: { id },
          data: { status: "READY" },
        });
      }
      await syncSalesOutboundQueue(tx, id);
    });

    const data = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true }, orderBy: { createdAt: "asc" } },
        payments: { orderBy: { receivedAt: "desc" } },
        fulfillments: { orderBy: { scheduledDate: "desc" } },
        outboundQueue: true,
      },
    });
    return NextResponse.json({ data, meta: { createdFulfillmentId } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales-orders/[id]/fulfillments error:", error);
    return NextResponse.json({ error: "Failed to add fulfillment." }, { status: 500 });
  }
}
