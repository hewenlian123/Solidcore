import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSalesOutboundQueue, syncSalesOrderFulfillmentFromFulfillment } from "@/lib/sales-orders";
import { deductInventoryForFulfillment, InventoryDeductionError, isFinalFulfillmentStatus } from "@/lib/fulfillment-inventory";
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
      const existingItem = await tx.salesOrderFulfillmentItem.findUnique({
        where: { id },
        select: { id: true, orderedQty: true },
      });
      if (!existingItem) throw new Error("FULFILLMENT_ITEM_NOT_FOUND");
      if (data.fulfilledQty !== undefined && data.fulfilledQty > Number(existingItem.orderedQty)) {
        throw new Error("FULFILLED_QTY_EXCEEDS_ORDERED");
      }

      const nextItem = await tx.salesOrderFulfillmentItem.update({
        where: { id },
        data,
      });

      const siblings = await tx.salesOrderFulfillmentItem.findMany({
        where: { fulfillmentId: nextItem.fulfillmentId },
        select: { orderedQty: true, fulfilledQty: true },
      });
      const allCompleted =
        siblings.length > 0 &&
        siblings.every((row) => Number(row.fulfilledQty) >= Number(row.orderedQty));
      const anyShort = siblings.some((row) => Number(row.fulfilledQty) < Number(row.orderedQty));
      const anyFulfilled = siblings.some((row) => Number(row.fulfilledQty) > 0);

      const fulfillment = await tx.salesOrderFulfillment.findUnique({
        where: { id: nextItem.fulfillmentId },
        select: { id: true, status: true, salesOrderId: true },
      });
      if (!fulfillment) throw new Error("FULFILLMENT_NOT_FOUND");

      const isCanceled = fulfillment.status === "CANCELLED";
      if (!isCanceled) {
        if (allCompleted && fulfillment.status !== "COMPLETED") {
          const updatedFulfillment = await tx.salesOrderFulfillment.update({
            where: { id: fulfillment.id },
            data: { status: "COMPLETED" },
          });
          if (isFinalFulfillmentStatus(updatedFulfillment.status)) {
            await deductInventoryForFulfillment(tx, { fulfillmentId: fulfillment.id, operator: role });
          }
          await syncSalesOrderFulfillmentFromFulfillment(tx, fulfillment.id);
        } else if (anyShort && anyFulfilled && fulfillment.status !== "PARTIAL") {
          await tx.salesOrderFulfillment.update({
            where: { id: fulfillment.id },
            data: { status: "PARTIAL" },
          });
        }
        await syncSalesOutboundQueue(tx, fulfillment.salesOrderId);
      }

      return nextItem;
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof InventoryDeductionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "FULFILLMENT_ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Fulfillment item not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "FULFILLED_QTY_EXCEEDS_ORDERED") {
      return NextResponse.json(
        { error: "fulfilled_qty cannot exceed ordered_qty." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "FULFILLMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Fulfillment not found." }, { status: 404 });
    }
    console.error("PATCH /api/fulfillment-item/[id] error:", error);
    return NextResponse.json({ error: "Failed to update fulfillment item." }, { status: 500 });
  }
}
