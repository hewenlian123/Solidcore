import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeInvoicePaidAndBalanceWithFallback, deriveInvoiceStatus } from "@/lib/invoices";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; paymentId: string }>;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id, paymentId } = await params;
    if (!id || !paymentId) {
      return NextResponse.json({ error: "Missing invoice id or payment id." }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        salesOrderId: true,
        customer: { select: { id: true, name: true, phone: true, email: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
      },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const payment = await prisma.salesOrderPayment.findFirst({
      where: { id: paymentId, invoiceId: id },
      select: {
        id: true,
        amount: true,
        method: true,
        paymentType: true,
        status: true,
        referenceNumber: true,
        receivedAt: true,
        notes: true,
        createdAt: true,
      },
    });
    if (!payment) return NextResponse.json({ error: "Payment not found for this invoice." }, { status: 404 });

    const postedPayments = await prisma.salesOrderPayment.findMany({
      where: { invoiceId: id, status: "POSTED" },
      select: { amount: true },
    });
    const paidTotal = roundCurrency(postedPayments.reduce((sum, p) => sum + Number(p.amount), 0));
    const balanceDue = roundCurrency(Number(invoice.total) - paidTotal);

    return NextResponse.json(
      {
        data: {
          invoice,
          payment,
          paidTotal: String(paidTotal),
          balanceDue: String(balanceDue),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/invoices/[id]/payments/[paymentId] error:", error);
    return NextResponse.json({ error: "Failed to load invoice payment." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const hardDelete = request.nextUrl.searchParams.get("hard") === "true";
    if (hardDelete && role !== "ADMIN") {
      return NextResponse.json({ error: "Only ADMIN can hard delete payments." }, { status: 403 });
    }

    const { id, paymentId } = await params;
    if (!id || !paymentId) {
      return NextResponse.json({ error: "Missing invoice id or payment id." }, { status: 400 });
    }

    const data = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        select: { id: true, status: true, total: true, salesOrderId: true },
      });
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");

      const payment = await tx.salesOrderPayment.findFirst({
        where: { id: paymentId, invoiceId: id },
        select: { id: true, status: true, salesOrderId: true },
      });
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");

      if (hardDelete) {
        await tx.salesOrderPayment.delete({
          where: { id: payment.id },
        });
      } else if (payment.status !== "VOIDED") {
        await tx.salesOrderPayment.update({
          where: { id: payment.id },
          data: { status: "VOIDED" },
        });
      }

      const totals = await computeInvoicePaidAndBalanceWithFallback(tx, {
        invoiceId: invoice.id,
        salesOrderId: invoice.salesOrderId,
        total: Number(invoice.total),
      });
      const nextStatus = deriveInvoiceStatus(invoice.status, totals.paidTotal, Number(invoice.total));
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus },
      });
      await recalculateSalesOrder(tx, payment.salesOrderId);

      return {
        paymentId: payment.id,
        invoiceId: invoice.id,
        mode: hardDelete ? "hard_delete" : "void",
        paidTotal: totals.paidTotal,
        balanceDue: totals.balanceDue,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found for this invoice." }, { status: 404 });
    }
    console.error("DELETE /api/invoices/[id]/payments/[paymentId] error:", error);
    return NextResponse.json({ error: "Failed to delete payment." }, { status: 500 });
  }
}
