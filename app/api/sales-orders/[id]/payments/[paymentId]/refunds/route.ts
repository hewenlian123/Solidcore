import { NextRequest, NextResponse } from "next/server";
import { Prisma, SalesPaymentMethod } from "@prisma/client";
import { withSalesOrderDepositSummary } from "@/lib/deposit-summary";
import {
  computeInvoicePaidAndBalance,
  deriveInvoiceStatus,
} from "@/lib/invoices";
import { remainingRefundableCents } from "@/lib/payment-ledger";
import {
  buildPaymentIdempotencyFingerprint,
  isPaymentOverBalance,
  lockSalesOrderForPayment,
  lockSalesOrderPaymentForRefund,
  normalizeOptionalText,
  parseIdempotencyKey,
  parseOptionalReceivedAt,
  parsePositivePaymentAmount,
  requirePaymentIdempotencyKey,
} from "@/lib/payment-creation-integrity";
import { prisma } from "@/lib/prisma";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; paymentId: string }>;
};

const SALES_PAYMENT_METHOD_VALUES = [
  "CASH",
  "CHECK",
  "CARD",
  "BANK",
  "OTHER",
] as const;

async function loadOrderResponse(
  id: string,
  status: number,
  idempotent = false,
  refundId?: string | null,
) {
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
  return NextResponse.json(
    { data: withSalesOrderDepositSummary(data), idempotent, refundId },
    { status },
  );
}

export async function POST(request: NextRequest, { params }: Params) {
  let idempotencyKey: string | null = null;
  let idempotencyFingerprint: string | null = null;
  let orderId: string | null = null;

  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) {
      return NextResponse.json(
        {
          error:
            "Refund posting requires Owner/Manager approval and accounting review.",
        },
        { status: 403 },
      );
    }
    const requestUser = getRequestUser(request);
    if (!requestUser) return deny();
    const approvalActor = `${requestUser.name} (${requestUser.userId})`;

    const { id, paymentId } = await params;
    orderId = id;
    if (!id || !paymentId) {
      return NextResponse.json(
        { error: "Missing order id or payment id." },
        { status: 400 },
      );
    }

    const payload = await request.json();
    const amount = parsePositivePaymentAmount(payload?.amount);
    const parsedKey = parseIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
    const requiredKey = requirePaymentIdempotencyKey(parsedKey);
    const receivedAt = parseOptionalReceivedAt(payload?.receivedAt);
    const requestedMethod =
      payload?.method == null || payload?.method === ""
        ? null
        : String(payload.method).trim().toUpperCase();
    const referenceNumber = normalizeOptionalText(payload?.referenceNumber, {
      trim: false,
    });
    const notes = normalizeOptionalText(payload?.notes, { trim: false });
    let approvedReturnId = normalizeOptionalText(payload?.approvedReturnId);

    if (!amount) {
      return NextResponse.json(
        { error: "Refund amount must be greater than 0." },
        { status: 400 },
      );
    }
    if (!parsedKey.ok) {
      return NextResponse.json({ error: parsedKey.error }, { status: 400 });
    }
    if (!requiredKey.ok) {
      return NextResponse.json({ error: requiredKey.error }, { status: 400 });
    }
    if (!receivedAt.ok) {
      return NextResponse.json({ error: receivedAt.error }, { status: 400 });
    }
    if (
      requestedMethod &&
      !SALES_PAYMENT_METHOD_VALUES.includes(
        requestedMethod as (typeof SALES_PAYMENT_METHOD_VALUES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Invalid refund method." },
        { status: 400 },
      );
    }

    idempotencyKey = requiredKey.key;

    const result = await prisma.$transaction(
      async (tx) => {
        const orderLocked = await lockSalesOrderForPayment(tx, id);
        if (!orderLocked) throw new Error("ORDER_NOT_FOUND");

        const originalLocked = await lockSalesOrderPaymentForRefund(
          tx,
          paymentId,
        );
        if (!originalLocked) throw new Error("PAYMENT_NOT_FOUND");

        const original = await tx.salesOrderPayment.findUnique({
          where: { id: paymentId },
          select: {
            id: true,
            amount: true,
            invoiceId: true,
            method: true,
            paymentType: true,
            refundOfPaymentId: true,
            salesOrderId: true,
            status: true,
          },
        });
        if (!original) throw new Error("PAYMENT_NOT_FOUND");
        if (original.salesOrderId !== id)
          throw new Error("PAYMENT_WRONG_ORDER");
        if (original.status !== "POSTED") throw new Error("PAYMENT_NOT_POSTED");
        if (original.paymentType === "REFUND" || original.refundOfPaymentId) {
          throw new Error("REFUND_OF_REFUND");
        }

        let commercialReductionSnapshot = new Prisma.Decimal(0);
        if (original.invoiceId) {
          const invoice = await tx.invoice.findUnique({
            where: { id: original.invoiceId },
            select: { discountAmount: true },
          });
          commercialReductionSnapshot = new Prisma.Decimal(
            invoice?.discountAmount ?? 0,
          );
        }

        if (!approvedReturnId) {
          const candidates = await tx.afterSalesReturn.findMany({
            where: {
              salesOrderId: id,
              refundMethod: "REFUND_PAYMENT",
              status: { in: ["APPROVED", "RECEIVED", "REFUNDED"] },
              ...(original.invoiceId
                ? {
                    OR: [
                      { invoiceId: original.invoiceId },
                      { invoiceId: null },
                    ],
                  }
                : {}),
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true, refundTotal: true },
          });
          for (const candidate of candidates) {
            const posted = await tx.salesOrderPayment.aggregate({
              where: {
                approvedReturnId: candidate.id,
                paymentType: "REFUND",
                status: "POSTED",
              },
              _sum: { amount: true },
            });
            const remainingCents = Math.max(
              Math.round(Number(candidate.refundTotal) * 100) -
                Math.round(Number(posted._sum.amount ?? 0) * 100),
              0,
            );
            if (!isPaymentOverBalance(amount.cents, remainingCents)) {
              approvedReturnId = candidate.id;
              break;
            }
          }
        }

        if (approvedReturnId) {
          const approvedReturn = await tx.afterSalesReturn.findUnique({
            where: { id: approvedReturnId },
            select: {
              id: true,
              invoiceId: true,
              refundMethod: true,
              refundTotal: true,
              salesOrderId: true,
              status: true,
            },
          });
          if (!approvedReturn) throw new Error("APPROVED_RETURN_NOT_FOUND");
          if (
            approvedReturn.salesOrderId !== id ||
            (approvedReturn.invoiceId &&
              original.invoiceId &&
              approvedReturn.invoiceId !== original.invoiceId)
          ) {
            throw new Error("APPROVED_RETURN_WRONG_SCOPE");
          }
          if (
            !["APPROVED", "RECEIVED", "REFUNDED", "CLOSED"].includes(
              approvedReturn.status,
            ) ||
            approvedReturn.refundMethod !== "REFUND_PAYMENT"
          ) {
            throw new Error("RETURN_NOT_APPROVED_FOR_REFUND");
          }
          const priorAuthorizedRefunds = await tx.salesOrderPayment.aggregate({
            where: {
              approvedReturnId,
              paymentType: "REFUND",
              status: "POSTED",
            },
            _sum: { amount: true },
          });
          const authorizedRemainingCents = Math.max(
            Math.round(Number(approvedReturn.refundTotal) * 100) -
              Math.round(Number(priorAuthorizedRefunds._sum.amount ?? 0) * 100),
            0,
          );
          if (
            authorizedRemainingCents <= 0 ||
            isPaymentOverBalance(amount.cents, authorizedRemainingCents)
          ) {
            throw new Error("RETURN_REFUND_AUTHORITY_EXCEEDED");
          }
        }

        const method = requestedMethod ?? original.method;
        idempotencyFingerprint = buildPaymentIdempotencyFingerprint({
          amount: amount.amount,
          method,
          notes,
          originalPaymentId: original.id,
          approvedReturnId,
          approvalActor,
          receivedAt: receivedAt.fingerprintValue,
          referenceNumber,
          salesOrderId: id,
          scope: "sales-order-payment-refund",
        });

        const existingPayment = await tx.salesOrderPayment.findUnique({
          where: { idempotencyKey: requiredKey.key },
          select: {
            id: true,
            idempotencyFingerprint: true,
            paymentType: true,
            refundOfPaymentId: true,
            salesOrderId: true,
          },
        });
        if (existingPayment) {
          if (
            existingPayment.salesOrderId !== id ||
            existingPayment.paymentType !== "REFUND" ||
            existingPayment.refundOfPaymentId !== original.id ||
            existingPayment.idempotencyFingerprint !== idempotencyFingerprint
          ) {
            throw new Error("IDEMPOTENCY_CONFLICT");
          }
          return { idempotent: true, refundId: existingPayment.id };
        }

        const orderPayments = await tx.salesOrderPayment.findMany({
          where: { salesOrderId: id },
          select: {
            amount: true,
            id: true,
            invoiceId: true,
            paymentType: true,
            refundOfPaymentId: true,
            status: true,
          },
        });
        const remainingCents = remainingRefundableCents(
          original,
          orderPayments,
        );
        if (
          remainingCents <= 0 ||
          isPaymentOverBalance(amount.cents, remainingCents)
        ) {
          throw new Error("OVER_REFUND");
        }

        const refund = await tx.salesOrderPayment.create({
          data: {
            salesOrderId: id,
            invoiceId: original.invoiceId,
            refundOfPaymentId: original.id,
            approvedReturnId,
            refundApprovalActor: approvalActor,
            refundReviewActor: approvalActor,
            commercialReductionSnapshot,
            amount: amount.amount,
            method: method as SalesPaymentMethod,
            paymentType: "REFUND",
            status: "POSTED",
            referenceNumber,
            receivedAt: receivedAt.receivedAt,
            notes,
            idempotencyKey,
            idempotencyFingerprint,
          },
          select: { id: true },
        });

        if (original.invoiceId) {
          const invoice = await tx.invoice.findUnique({
            where: { id: original.invoiceId },
            select: { id: true, status: true, total: true },
          });
          if (invoice) {
            const totals = await computeInvoicePaidAndBalance(
              tx,
              invoice.id,
              Number(invoice.total),
            );
            const nextStatus = deriveInvoiceStatus(
              invoice.status,
              totals.paidTotal,
              Number(invoice.total),
            );
            await tx.invoice.update({
              where: { id: invoice.id },
              data: { status: nextStatus },
            });
          }
        }

        await recalculateSalesOrder(tx, id);
        return { idempotent: false, refundId: refund.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return loadOrderResponse(
      id,
      result.idempotent ? 200 : 201,
      result.idempotent,
      result.refundId,
    );
  } catch (error) {
    if (
      idempotencyKey &&
      idempotencyFingerprint &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingPayment = await prisma.salesOrderPayment.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          idempotencyFingerprint: true,
          paymentType: true,
          salesOrderId: true,
        },
      });
      if (
        existingPayment?.salesOrderId === orderId &&
        existingPayment.paymentType === "REFUND" &&
        existingPayment.idempotencyFingerprint === idempotencyFingerprint &&
        orderId
      ) {
        return loadOrderResponse(orderId, 200, true, existingPayment.id);
      }
      return NextResponse.json(
        {
          error:
            "Idempotency key was already used for a different refund request.",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") {
      return NextResponse.json(
        { error: "Original payment not found." },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "PAYMENT_WRONG_ORDER") {
      return NextResponse.json(
        { error: "Payment belongs to a different sales order." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "PAYMENT_NOT_POSTED") {
      return NextResponse.json(
        { error: "Only posted original payments can be refunded." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "REFUND_OF_REFUND") {
      return NextResponse.json(
        { error: "Refund payments cannot be refunded." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "OVER_REFUND") {
      return NextResponse.json(
        {
          error:
            "Refund exceeds the remaining refundable amount for this payment.",
        },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "APPROVED_RETURN_NOT_FOUND"
    ) {
      return NextResponse.json(
        { error: "Approved return not found." },
        { status: 404 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "APPROVED_RETURN_WRONG_SCOPE"
    ) {
      return NextResponse.json(
        { error: "Approved return belongs to a different order or invoice." },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "RETURN_NOT_APPROVED_FOR_REFUND"
    ) {
      return NextResponse.json(
        { error: "Return is not approved for a payment refund." },
        { status: 409 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "RETURN_REFUND_AUTHORITY_EXCEEDED"
    ) {
      return NextResponse.json(
        { error: "Refund exceeds the approved return amount." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
      return NextResponse.json(
        {
          error:
            "Idempotency key was already used for a different refund request.",
        },
        { status: 409 },
      );
    }
    console.error(
      "POST /api/sales-orders/[id]/payments/[paymentId]/refunds error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to create refund." },
      { status: 500 },
    );
  }
}
