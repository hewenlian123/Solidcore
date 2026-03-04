import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureFulfillmentFromSalesOrder } from "@/lib/fulfillment";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const TYPES = new Set(["DELIVERY", "PICKUP"]);

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const payload = await request.json();
    const salesOrderId = String(payload?.salesOrderId ?? "").trim();
    const type = String(payload?.type ?? "").toUpperCase();
    if (!salesOrderId) {
      return NextResponse.json({ error: "salesOrderId is required." }, { status: 400 });
    }
    if (!TYPES.has(type)) {
      return NextResponse.json({ error: "type must be delivery or pickup." }, { status: 400 });
    }

    const data = await prisma.$transaction(async (tx) => {
      const ensured = await ensureFulfillmentFromSalesOrder(tx, {
        salesOrderId,
        type: type as "DELIVERY" | "PICKUP",
      });
      await syncSalesOutboundQueue(tx, salesOrderId);
      const full = await tx.salesOrderFulfillment.findUnique({
        where: { id: ensured.fulfillment.id },
        include: {
          items: { orderBy: { createdAt: "asc" } },
        },
      });
      return {
        fulfillment: full,
        existed: ensured.existed,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "SALES_ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    console.error("POST /api/fulfillment/from-sales-order error:", error);
    return NextResponse.json({ error: "Failed to create fulfillment from sales order." }, { status: 500 });
  }
}
