import { NextRequest, NextResponse } from "next/server";
import { withSalesOrderDepositSummary } from "@/lib/deposit-summary";
import { voidSalesOrderPaymentWithReconciliation } from "@/lib/payment-void-reconciliation";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ paymentId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { paymentId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const voidResult = await voidSalesOrderPaymentWithReconciliation(tx, paymentId);
      const data = await tx.salesOrder.findUnique({
        where: { id: voidResult.salesOrderId },
        include: {
          customer: true,
          items: { include: { product: true }, orderBy: { createdAt: "asc" } },
          payments: { orderBy: { receivedAt: "desc" } },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
      return { data: withSalesOrderDepositSummary(data), void: voidResult };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PAYMENT_VOID_CONFLICT") {
      return NextResponse.json(
        { error: "Payment changed while voiding. Refresh and try again." },
        { status: 409 },
      );
    }
    console.error("POST /api/sales-order-payments/[paymentId]/void error:", error);
    return NextResponse.json({ error: "Failed to void payment." }, { status: 500 });
  }
}
