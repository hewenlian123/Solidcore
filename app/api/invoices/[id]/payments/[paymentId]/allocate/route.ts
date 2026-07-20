import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeInvoicePaidAndBalance, deriveInvoiceStatus } from "@/lib/invoices";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; paymentId: string }>;
};

function isSameMoney(left: number, right: number) {
  return Math.abs(left - right) < 0.001;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id, paymentId } = await params;
    if (!id || !paymentId) {
      return NextResponse.json({ error: "Missing invoice id or payment id." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          total: true,
          salesOrderId: true,
        },
      });
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");
      if (invoice.status === "void") throw new Error("INVOICE_VOIDED");

      const payment = await tx.salesOrderPayment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          salesOrderId: true,
          invoiceId: true,
          amount: true,
          status: true,
          method: true,
          paymentType: true,
          referenceNumber: true,
          receivedAt: true,
          notes: true,
        },
      });
      if (!payment) throw new Error("PAYMENT_NOT_FOUND");
      if (payment.status !== "POSTED") throw new Error("PAYMENT_NOT_POSTED");
      if (payment.invoiceId === invoice.id) {
        const totals = await computeInvoicePaidAndBalance(tx, invoice.id, Number(invoice.total));
        return { payment, invoice, totals, idempotent: true };
      }
      if (payment.invoiceId) throw new Error("PAYMENT_ALREADY_ALLOCATED");
      if (payment.salesOrderId !== invoice.salesOrderId) throw new Error("PAYMENT_WRONG_ORDER");

      const beforeTotals = await computeInvoicePaidAndBalance(tx, invoice.id, Number(invoice.total));
      const paymentAmount = Number(payment.amount);
      const currentBalance = Math.max(Number(beforeTotals.balanceDue), 0);
      if (paymentAmount > currentBalance + 0.0001 && !isSameMoney(paymentAmount, currentBalance)) {
        throw new Error("PAYMENT_OVER_BALANCE");
      }

      const updated = await tx.salesOrderPayment.updateMany({
        where: {
          id: payment.id,
          salesOrderId: invoice.salesOrderId,
          invoiceId: null,
          status: "POSTED",
        },
        data: { invoiceId: invoice.id },
      });

      if (updated.count === 0) {
        const current = await tx.salesOrderPayment.findUnique({
          where: { id: payment.id },
          select: {
            id: true,
            salesOrderId: true,
            invoiceId: true,
            amount: true,
            status: true,
            method: true,
            paymentType: true,
            referenceNumber: true,
            receivedAt: true,
            notes: true,
          },
        });
        if (current?.invoiceId === invoice.id) {
          const totals = await computeInvoicePaidAndBalance(tx, invoice.id, Number(invoice.total));
          return { payment: current, invoice, totals, idempotent: true };
        }
        if (current?.invoiceId) throw new Error("PAYMENT_ALREADY_ALLOCATED");
        throw new Error("PAYMENT_ALLOCATION_CONFLICT");
      }

      const allocatedPayment = await tx.salesOrderPayment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          id: true,
          salesOrderId: true,
          invoiceId: true,
          amount: true,
          status: true,
          method: true,
          paymentType: true,
          referenceNumber: true,
          receivedAt: true,
          notes: true,
        },
      });
      const totals = await computeInvoicePaidAndBalance(tx, invoice.id, Number(invoice.total));
      const nextStatus = deriveInvoiceStatus(invoice.status, totals.paidTotal, Number(invoice.total));
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus },
        select: {
          id: true,
          status: true,
          total: true,
          salesOrderId: true,
        },
      });
      await recalculateSalesOrder(tx, invoice.salesOrderId);

      return { payment: allocatedPayment, invoice: updatedInvoice, totals, idempotent: false };
    });

    return NextResponse.json(
      {
        data: {
          payment: result.payment,
          invoice: {
            id: result.invoice.id,
            status: result.invoice.status,
            paidTotal: String(result.totals.paidTotal),
            balanceDue: String(result.totals.balanceDue),
          },
          idempotent: result.idempotent,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PAYMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVOICE_VOIDED") {
      return NextResponse.json({ error: "Cannot allocate a payment to a void invoice." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PAYMENT_NOT_POSTED") {
      return NextResponse.json({ error: "Only posted payments can be allocated to an invoice." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PAYMENT_ALREADY_ALLOCATED") {
      return NextResponse.json(
        { error: "Payment is already allocated to another invoice." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "PAYMENT_WRONG_ORDER") {
      return NextResponse.json(
        { error: "Payment belongs to a different sales order and cannot be allocated to this invoice." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "PAYMENT_OVER_BALANCE") {
      return NextResponse.json(
        { error: "Payment exceeds current invoice balance. Split payments are not supported yet." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "PAYMENT_ALLOCATION_CONFLICT") {
      return NextResponse.json(
        { error: "Payment allocation changed while saving. Refresh and try again." },
        { status: 409 },
      );
    }
    console.error("PATCH /api/invoices/[id]/payments/[paymentId]/allocate error:", error);
    return NextResponse.json({ error: "Failed to allocate payment to invoice." }, { status: 500 });
  }
}
