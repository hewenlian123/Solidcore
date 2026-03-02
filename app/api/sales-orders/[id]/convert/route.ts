import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateNextSalesOrderNumber,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;

    const order = await prisma.salesOrder.findUnique({
      where: { id },
      select: { id: true, docType: true, status: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (order.docType !== "QUOTE") {
      return NextResponse.json(
        { error: "Only quotes can be converted." },
        { status: 400 },
      );
    }
    if (order.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cancelled quotes cannot be converted." },
        { status: 400 },
      );
    }

    const data = await prisma.$transaction(async (tx) => {
      const orderNumber = await generateNextSalesOrderNumber(tx, "SALES_ORDER");
      await tx.salesOrder.update({
        where: { id },
        data: { docType: "SALES_ORDER", status: "CONFIRMED", orderNumber },
      });
      await syncSalesOutboundQueue(tx, id);
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
    console.error("PATCH /api/sales-orders/[id]/convert error:", error);
    return NextResponse.json({ error: "Failed to convert quote." }, { status: 500 });
  }
}
