import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import { ensureFulfillmentFromSalesOrder } from "@/lib/fulfillment";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const ALLOWED_SO_STATUSES = new Set(["CONFIRMED", "READY", "PARTIALLY_FULFILLED"]);
const FULFILLMENT_TYPES = new Set(["PICKUP", "DELIVERY"]);

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const type = String(payload?.type ?? "").toUpperCase();
    if (!FULFILLMENT_TYPES.has(type)) {
      return NextResponse.json({ error: "Invalid fulfillment type." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id },
        include: {
          items: { select: { id: true } },
        },
      });
      if (!salesOrder) throw new Error("NOT_FOUND");
      if (!ALLOWED_SO_STATUSES.has(String(salesOrder.status ?? "").toUpperCase())) {
        throw new Error("INELIGIBLE_STATUS");
      }
      if (salesOrder.items.length === 0) {
        throw new Error("NO_ITEMS");
      }
      const ensured = await ensureFulfillmentFromSalesOrder(tx, {
        salesOrderId: id,
        type: type as "PICKUP" | "DELIVERY",
      });
      await syncSalesOutboundQueue(tx, id);
      return { fulfillmentId: ensured.fulfillment.id, existed: ensured.existed };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INELIGIBLE_STATUS") {
      return NextResponse.json(
        { error: "Confirm the sales order before starting fulfillment." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "NO_ITEMS") {
      return NextResponse.json({ error: "Add items before fulfillment." }, { status: 400 });
    }
    console.error("POST /api/sales-orders/[id]/fulfillments/ensure error:", error);
    return NextResponse.json({ error: "Failed to start fulfillment." }, { status: 500 });
  }
}
