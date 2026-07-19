import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInventoryDeductionError, setFulfillmentStatus } from "@/lib/fulfillment-inventory";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; fulfillmentId: string }>;
};

const FULFILLMENT_STATUSES = [
  "PENDING",
  "READY",
  "VOIDED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
const FULFILLMENT_STATUS_MAP: Record<string, "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"> = {
  PENDING: "SCHEDULED",
  READY: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  VOIDED: "CANCELLED",
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  CANCELLED: "CANCELLED",
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id, fulfillmentId } = await params;
    const payload = await request.json();
    const status = payload.status ? String(payload.status).toUpperCase() : null;
    if (status && !FULFILLMENT_STATUSES.includes(status as (typeof FULFILLMENT_STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid fulfillment status." }, { status: 400 });
    }
    const mappedStatus = status ? FULFILLMENT_STATUS_MAP[status] : null;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrderFulfillment.findUnique({
        where: { id: fulfillmentId },
      });
      if (!existing || existing.salesOrderId !== id) {
        throw new Error("FULFILLMENT_NOT_FOUND");
      }

      await tx.salesOrderFulfillment.update({
        where: { id: fulfillmentId },
        data: {
          scheduledDate: payload.scheduledDate ? new Date(payload.scheduledDate) : undefined,
          address: payload.address !== undefined ? String(payload.address || "") || null : undefined,
          notes: payload.notes !== undefined ? String(payload.notes || "") || null : undefined,
        },
      });
      if (mappedStatus) {
        await setFulfillmentStatus(tx, {
          fulfillmentId,
          status: mappedStatus as any,
          operator: role,
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
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "FULFILLMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Fulfillment not found." }, { status: 404 });
    }
    if (isInventoryDeductionError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(
      "PATCH /api/sales-orders/[id]/fulfillments/[fulfillmentId] error:",
      error,
    );
    return NextResponse.json({ error: "Failed to update fulfillment." }, { status: 500 });
  }
}
