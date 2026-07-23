import { NextRequest, NextResponse } from "next/server";
import { computeInvoicePaidAndBalance, deriveInvoiceStatus } from "@/lib/invoices";
import { voidSalesOrderPaymentWithReconciliation } from "@/lib/payment-void-reconciliation";
import { sumSignedPaymentAmount } from "@/lib/payment-ledger";
import { prisma } from "@/lib/prisma";
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
      select: { amount: true, paymentType: true, status: true },
    });
    const paidTotal = roundCurrency(sumSignedPaymentAmount(postedPayments));
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
    if (hardDelete) {
      return NextResponse.json(
        { error: "Hard delete is disabled for normal payment lifecycle. Void the payment instead." },
        { status: 403 },
      );
    }

    const { id, paymentId } = await params;
    if (!id || !paymentId) {
      return NextResponse.json({ error: "Missing invoice id or payment id." }, { status: 400 });
    }

    const data = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");

      const voidResult = await voidSalesOrderPaymentWithReconciliation(tx, paymentId, {
        invoiceId: invoice.id,
      });

      return {
        alreadyVoided: voidResult.alreadyVoided,
        balanceDue: voidResult.invoice?.balanceDue ?? 0,
        invoiceId: invoice.id,
        mode: hardDelete ? "hard_delete" : "void",
        paidTotal: voidResult.invoice?.paidTotal ?? 0,
        paymentId: voidResult.paymentId,
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
    if (error instanceof Error && error.message === "PAYMENT_VOID_CONFLICT") {
      return NextResponse.json(
        { error: "Payment changed while voiding. Refresh and try again." },
        { status: 409 },
      );
    }
    console.error("DELETE /api/invoices/[id]/payments/[paymentId] error:", error);
    return NextResponse.json({ error: "Failed to delete payment." }, { status: 500 });
  }
}
