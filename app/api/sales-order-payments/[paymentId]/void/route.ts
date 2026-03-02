import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ paymentId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { paymentId } = await params;

    const data = await prisma.$transaction(async (tx) => {
      const payment = await tx.salesOrderPayment.findUnique({
        where: { id: paymentId },
        select: { id: true, salesOrderId: true, status: true },
      });
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");
      if (payment.status === "VOIDED") throw new Error("ALREADY_VOIDED");

      await tx.salesOrderPayment.update({
        where: { id: paymentId },
        data: { status: "VOIDED" },
      });
      await recalculateSalesOrder(tx, payment.salesOrderId);
      return tx.salesOrder.findUnique({
        where: { id: payment.salesOrderId },
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
    if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ALREADY_VOIDED") {
      return NextResponse.json({ error: "Payment is already voided." }, { status: 400 });
    }
    console.error("POST /api/sales-order-payments/[paymentId]/void error:", error);
    return NextResponse.json({ error: "Failed to void payment." }, { status: 500 });
  }
}
