import { NextRequest } from "next/server";
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
      salesOrder: {
        include: {
          customer: true,
        },
      },
    },
  });
  if (!payment) {
    return new Response("Payment not found", { status: 404 });
  }

  const order = payment.salesOrder;
  const pdfBytes = await generatePaymentPDF({
    receiptNumber: payment.id.slice(0, 8).toUpperCase(),
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    customerEmail: order.customer.email,
    amount: Number(payment.amount),
    method: payment.method,
    referenceNumber: payment.referenceNumber,
    receivedAt: payment.receivedAt,
    status: payment.status,
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
