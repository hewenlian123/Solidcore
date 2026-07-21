import { NextRequest, NextResponse } from "next/server";
import { Prisma, SalesPaymentMethod, SalesPaymentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildPaymentIdempotencyFingerprint,
  getSalesOrderRemainingCents,
  isPaymentOverBalance,
  lockSalesOrderForPayment,
  moneyToCents,
  normalizeOptionalText,
  parseIdempotencyKey,
  parseOptionalReceivedAt,
  parsePositivePaymentAmount,
  requirePaymentIdempotencyKey,
} from "@/lib/payment-creation-integrity";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const SALES_PAYMENT_METHOD_VALUES = ["CASH", "CHECK", "CARD", "BANK", "OTHER"] as const;
const SALES_PAYMENT_TYPE_VALUES = ["DEPOSIT", "FINAL", "REFUND"] as const;

export async function POST(request: NextRequest, { params }: Params) {
  let idempotencyKey: string | null = null;
  let idempotencyFingerprint: string | null = null;
  let orderId: string | null = null;

  const loadOrderResponse = async (id: string, status: number, idempotent = false) => {
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
    return NextResponse.json({ data, idempotent }, { status });
  };

  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    orderId = id;
    const payload = await request.json();
    const amount = parsePositivePaymentAmount(payload.amount);
    const method = String(payload.method ?? "OTHER").toUpperCase();
    const paymentType = String(payload.type ?? "FINAL").toUpperCase();
    const parsedKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
    const receivedAt = parseOptionalReceivedAt(payload.receivedAt);
    const referenceNumber = normalizeOptionalText(payload.referenceNumber, { trim: false });
    const notes = normalizeOptionalText(payload.notes, { trim: false });

    if (!amount) {
      return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
    }
    if (!SALES_PAYMENT_METHOD_VALUES.includes(method as (typeof SALES_PAYMENT_METHOD_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }
    if (!SALES_PAYMENT_TYPE_VALUES.includes(paymentType as (typeof SALES_PAYMENT_TYPE_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid payment type." }, { status: 400 });
    }
    if (!parsedKey.ok) {
      return NextResponse.json({ error: parsedKey.error }, { status: 400 });
    }
    if (!receivedAt.ok) {
      return NextResponse.json({ error: receivedAt.error }, { status: 400 });
    }
    if (paymentType !== "REFUND") {
      const requiredKey = requirePaymentIdempotencyKey(parsedKey);
      if (!requiredKey.ok) {
        return NextResponse.json({ error: requiredKey.error }, { status: 400 });
      }
    }

    idempotencyKey = parsedKey.key;
    idempotencyFingerprint = idempotencyKey
      ? buildPaymentIdempotencyFingerprint({
          amount: amount.amount,
          method,
          notes,
          receivedAt: receivedAt.fingerprintValue,
          referenceNumber,
          salesOrderId: id,
          scope: "sales-order-payment",
          type: paymentType,
        })
      : null;

    const result = await prisma.$transaction(
      async (tx) => {
        const locked = await lockSalesOrderForPayment(tx, id);
        if (!locked) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (idempotencyKey) {
          const existingPayment = await tx.salesOrderPayment.findUnique({
            where: { idempotencyKey },
            select: { id: true, salesOrderId: true, idempotencyFingerprint: true },
          });
          if (existingPayment) {
            if (
              existingPayment.salesOrderId !== id ||
              existingPayment.idempotencyFingerprint !== idempotencyFingerprint
            ) {
              throw new Error("IDEMPOTENCY_CONFLICT");
            }
            return { idempotent: true };
          }
        }

        const order = await tx.salesOrder.findUnique({
          where: { id },
          select: { id: true, total: true },
        });
        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }
        try {
          moneyToCents(order.total);
        } catch {
          throw new Error("ORDER_TOTAL_MISSING");
        }

        if (paymentType !== "REFUND") {
          const remainingCents = await getSalesOrderRemainingCents(tx, id);
          if (isPaymentOverBalance(amount.cents, remainingCents)) {
            throw new Error("OVERPAYMENT");
          }
        }

        await tx.salesOrderPayment.create({
          data: {
            salesOrderId: id,
            amount: amount.amount,
            method: method as SalesPaymentMethod,
            paymentType: paymentType as SalesPaymentType,
            status: "POSTED",
            referenceNumber,
            receivedAt: receivedAt.receivedAt,
            notes,
            idempotencyKey,
            idempotencyFingerprint,
          },
        });
        await recalculateSalesOrder(tx, id);
        return { idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return loadOrderResponse(id, result.idempotent ? 200 : 201, result.idempotent);
  } catch (error) {
    if (
      idempotencyKey &&
      idempotencyFingerprint &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingPayment = await prisma.salesOrderPayment.findUnique({
        where: { idempotencyKey },
        select: { salesOrderId: true, idempotencyFingerprint: true },
      });
      if (
        existingPayment?.salesOrderId === orderId &&
        existingPayment.idempotencyFingerprint === idempotencyFingerprint &&
        orderId
      ) {
        return loadOrderResponse(orderId, 200, true);
      }
      return NextResponse.json(
        { error: "Idempotency key was already used for a different payment request." },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ORDER_TOTAL_MISSING") {
      return NextResponse.json({ error: "Order total is missing." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "OVERPAYMENT") {
      return NextResponse.json(
        { error: "Payment exceeds current order balance. Please adjust amount." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
      return NextResponse.json(
        { error: "Idempotency key was already used for a different payment request." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "MONEY_VALUE_INVALID") {
      return NextResponse.json({ error: "Order total is missing." }, { status: 400 });
    }
    console.error("POST /api/sales-orders/[id]/payments error:", error);
    return NextResponse.json({ error: "Failed to add payment." }, { status: 500 });
  }
}
