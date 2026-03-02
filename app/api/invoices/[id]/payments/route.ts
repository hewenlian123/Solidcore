import { NextRequest, NextResponse } from "next/server";
import { SalesPaymentMethod, SalesPaymentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeInvoicePaidAndBalanceWithFallback, deriveInvoiceStatus } from "@/lib/invoices";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

    const payload = await request.json();
    const amount = Number(payload?.amount ?? 0);
    const method = String(payload?.method ?? "").toUpperCase() as SalesPaymentMethod;
    const paymentType = String(payload?.type ?? "FINAL").toUpperCase() as SalesPaymentType;
    const referenceNumber = String(payload?.referenceNumber ?? "").trim() || null;
    const notes = String(payload?.notes ?? "").trim() || null;
    const receivedAtRaw = String(payload?.receivedAt ?? "").trim();
    const receivedAt = receivedAtRaw ? new Date(receivedAtRaw) : new Date();

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });
    }
    if (!Object.values(SalesPaymentMethod).includes(method)) {
      return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
    }
    if (!Object.values(SalesPaymentType).includes(paymentType)) {
      return NextResponse.json({ error: "Invalid payment type." }, { status: 400 });
    }
    if (Number.isNaN(receivedAt.getTime())) {
      return NextResponse.json({ error: "Invalid received date." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        select: { id: true, status: true, total: true, salesOrderId: true },
      });
      if (!invoice) throw new Error("NOT_FOUND");
      if (invoice.status === "void") throw new Error("VOIDED");
      if (!invoice.salesOrderId) throw new Error("NO_SALES_ORDER");

      const current = await computeInvoicePaidAndBalanceWithFallback(tx, {
        invoiceId: invoice.id,
        salesOrderId: invoice.salesOrderId,
        total: Number(invoice.total),
      });
      const currentBalance = Number(current.balanceDue);
      if (paymentType !== "REFUND" && amount > currentBalance + 0.0001) {
        throw new Error("OVERPAYMENT");
      }

      await tx.salesOrderPayment.create({
        data: {
          salesOrderId: invoice.salesOrderId,
          invoiceId: invoice.id,
          amount,
          method,
          paymentType,
          status: "POSTED",
          referenceNumber,
          notes,
          receivedAt,
        },
      });

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
      await recalculateSalesOrder(tx, invoice.salesOrderId);

      return totals;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "VOIDED") {
      return NextResponse.json({ error: "Cannot add payment to a void invoice." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NO_SALES_ORDER") {
      return NextResponse.json(
        { error: "Invoice is not linked to a sales order, cannot use shared payment table." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "OVERPAYMENT") {
      return NextResponse.json(
        { error: "Payment exceeds current invoice balance. Please adjust amount." },
        { status: 400 },
      );
    }
    console.error("POST /api/invoices/[id]/payments error:", error);
    return NextResponse.json({ error: "Failed to add invoice payment." }, { status: 500 });
  }
}
