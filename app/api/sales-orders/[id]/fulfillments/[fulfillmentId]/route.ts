import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import {
  assertSufficientVariantInventory,
  InsufficientInventoryError,
} from "@/lib/inventory-safety";
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
          status: mappedStatus ? (mappedStatus as any) : undefined,
          scheduledDate: payload.scheduledDate ? new Date(payload.scheduledDate) : undefined,
          address: payload.address !== undefined ? String(payload.address || "") || null : undefined,
          notes: payload.notes !== undefined ? String(payload.notes || "") || null : undefined,
        },
      });
      if (mappedStatus === "COMPLETED") {
        const orderItems = await tx.salesOrderItem.findMany({
          where: { salesOrderId: id },
          select: { variantId: true, quantity: true, fulfillQty: true },
        });
        const deductionByVariant = new Map<string, number>();
        for (const item of orderItems) {
          if (!item.variantId) continue;
          const remaining = Math.max(Number(item.quantity) - Number(item.fulfillQty), 0);
          if (remaining <= 0) continue;
          deductionByVariant.set(
            item.variantId,
            (deductionByVariant.get(item.variantId) ?? 0) + remaining,
          );
        }
        for (const [variantId, deductionQty] of deductionByVariant.entries()) {
          await assertSufficientVariantInventory(tx, { variantId, deductionQty });
        }
      }
      if (mappedStatus === "IN_PROGRESS") {
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
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "FULFILLMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Fulfillment not found." }, { status: 404 });
    }
    if (error instanceof InsufficientInventoryError) {
      return NextResponse.json(
        {
          error: "Insufficient inventory",
          detail: {
            variantId: error.variantId,
            available: error.available,
            requested: error.requested,
          },
        },
        { status: 400 },
      );
    }
    console.error(
      "PATCH /api/sales-orders/[id]/fulfillments/[fulfillmentId] error:",
      error,
    );
    return NextResponse.json({ error: "Failed to update fulfillment." }, { status: 500 });
  }
}
