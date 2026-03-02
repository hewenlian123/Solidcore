import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SALES_PAYMENT_METHOD_VALUES = ["CASH", "CHECK", "CARD", "BANK", "OTHER"] as const;
const SALES_PAYMENT_TYPE_VALUES = ["DEPOSIT", "FINAL", "REFUND"] as const;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const amount = toNumber(payload.amount, 0);
    const method = String(payload.method ?? "OTHER").toUpperCase();
    const paymentType = String(payload.type ?? "FINAL").toUpperCase();
    if (amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
    }
    if (!SALES_PAYMENT_METHOD_VALUES.includes(method as (typeof SALES_PAYMENT_METHOD_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }
    if (!SALES_PAYMENT_TYPE_VALUES.includes(paymentType as (typeof SALES_PAYMENT_TYPE_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid payment type." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        select: { id: true, total: true },
      });
      if (!order) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (!Number.isFinite(Number(order.total))) {
        throw new Error("ORDER_TOTAL_MISSING");
      }
      await tx.salesOrderPayment.create({
        data: {
          salesOrderId: id,
          amount,
          method: method as any,
          paymentType: paymentType as any,
          status: "POSTED",
          referenceNumber: payload.referenceNumber ? String(payload.referenceNumber) : null,
          receivedAt: payload.receivedAt ? new Date(payload.receivedAt) : new Date(),
          notes: payload.notes ? String(payload.notes) : null,
        },
      });
      await recalculateSalesOrder(tx, id);
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
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ORDER_TOTAL_MISSING") {
      return NextResponse.json({ error: "Order total is missing." }, { status: 400 });
    }
    console.error("POST /api/sales-orders/[id]/payments error:", error);
    return NextResponse.json({ error: "Failed to add payment." }, { status: 500 });
  }
}
