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
      invoice: { select: { invoiceNumber: true } },
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
    ? centsToNumber(sumPostedRefundCentsForPayment(originalPaymentId, order.payments))
    : 0;
  const remainingRefundable = originalPayment
    ? centsToNumber(remainingRefundableCents(originalPayment, order.payments))
    : 0;
  const pdfBytes = await generatePaymentPDF({
    receiptNumber: payment.id.slice(0, 8).toUpperCase(),
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
    originalPaymentAmount: originalPayment ? Number(originalPayment.amount) : null,
    originalPaymentId,
    originalPaymentReference: originalPayment?.referenceNumber ?? null,
    refundedTotal,
    remainingRefundable,
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
