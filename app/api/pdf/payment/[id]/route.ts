import { NextRequest } from "next/server";
import {
  centsToNumber,
  remainingRefundableCents,
  sumPostedRefundCentsForPayment,
} from "@/lib/payment-ledger";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { generatePaymentPDF } from "@/lib/pdf/generatePaymentPDF";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

  const { id } = await params;
  const payment = await prisma.salesOrderPayment.findUnique({
    where: { id },
    include: {
      invoice: {
        select: {
          id: true,
          discountAmount: true,
          invoiceNumber: true,
          total: true,
        },
      },
      approvedReturn: {
        select: { id: true, returnNumber: true, status: true },
      },
      refundOfPayment: {
        select: {
          id: true,
          amount: true,
          referenceNumber: true,
          status: true,
          paymentType: true,
        },
      },
      salesOrder: {
        include: {
          customer: true,
          payments: {
            select: {
              id: true,
              amount: true,
              createdAt: true,
              invoiceId: true,
              paymentType: true,
              refundOfPaymentId: true,
              status: true,
            },
          },
        },
      },
    },
  });
  if (!payment) {
    return new Response("Payment not found", { status: 404 });
  }

  const order = payment.salesOrder;
  const isRefund = payment.paymentType === "REFUND";
  const originalPayment = isRefund ? payment.refundOfPayment : payment;
  const originalPaymentId = originalPayment?.id ?? null;
  const refundedTotal = originalPaymentId
    ? centsToNumber(
        sumPostedRefundCentsForPayment(originalPaymentId, order.payments),
      )
    : 0;
  const remainingRefundable = originalPayment
    ? centsToNumber(remainingRefundableCents(originalPayment, order.payments))
    : 0;
  const priorNetPaid = order.payments
    .filter((row) => {
      if (row.createdAt.getTime() < payment.createdAt.getTime()) return true;
      if (row.createdAt.getTime() > payment.createdAt.getTime()) return false;
      return row.id.localeCompare(payment.id) < 0;
    })
    .filter((row) => row.status === "POSTED")
    .filter((row) =>
      payment.invoiceId ? row.invoiceId === payment.invoiceId : true,
    )
    .reduce(
      (sum, row) =>
        sum +
        (row.paymentType === "REFUND"
          ? -Math.abs(Number(row.amount))
          : Math.abs(Number(row.amount))),
      0,
    );
  const financialTotal = Number(payment.invoice?.total ?? order.total);
  const priorBalance = Math.max(financialTotal - priorNetPaid, 0);
  const eventImpact =
    payment.status !== "POSTED"
      ? 0
      : payment.paymentType === "REFUND"
        ? -Math.abs(Number(payment.amount))
        : Math.abs(Number(payment.amount));
  const newBalance = Math.max(priorBalance - eventImpact, 0);
  const pdfBytes = await generatePaymentPDF({
    receiptNumber: payment.id.slice(0, 8).toUpperCase(),
    paymentId: payment.id,
    invoiceId: payment.invoice?.id ?? null,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    customerEmail: order.customer.email,
    amount: Number(payment.amount),
    invoiceNumber: payment.invoice?.invoiceNumber ?? null,
    method: payment.method,
    paymentType: payment.paymentType,
    referenceNumber: payment.referenceNumber,
    receivedAt: payment.receivedAt,
    status: payment.status,
    originalPaymentAmount: originalPayment
      ? Number(originalPayment.amount)
      : null,
    originalPaymentId,
    originalPaymentReference: originalPayment?.referenceNumber ?? null,
    approvedReturnId: payment.approvedReturn?.id ?? null,
    approvalActor: payment.refundApprovalActor,
    accountingReviewActor: payment.refundReviewActor,
    commercialReduction: Number(
      payment.commercialReductionSnapshot ??
        payment.invoice?.discountAmount ??
        0,
    ),
    commercialReductionSource: payment.invoice
      ? `Invoice ${payment.invoice.invoiceNumber}`
      : "No issued invoice reduction",
    refundedTotal,
    remainingRefundable,
    priorBalance,
    newBalance,
    subtotal: Number(order.subtotal),
    taxRate: order.taxRate != null ? Number(order.taxRate) : null,
    taxAmount: Number(order.tax),
    total: Number(order.total),
    paidAmount: Number(order.paidAmount),
    balanceDue: Number(order.balanceDue),
    notes: payment.notes,
  });

  const { searchParams } = new URL(request.url);
  const asDownload = searchParams.get("download") === "true";
  const disposition = asDownload ? "attachment" : "inline";
  const pdfBody = new Uint8Array(pdfBytes).buffer;
  return new Response(pdfBody, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename=payment-${payment.id.slice(0, 8)}.pdf`,
    },
  });
}
