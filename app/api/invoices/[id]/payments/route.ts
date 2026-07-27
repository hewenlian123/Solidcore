import { NextRequest, NextResponse } from "next/server";
import { Prisma, SalesPaymentMethod, SalesPaymentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeInvoicePaidAndBalance,
  deriveInvoiceStatus,
} from "@/lib/invoices";
import {
  buildPaymentIdempotencyFingerprint,
  getInvoiceRemainingCents,
  getSalesOrderRemainingCents,
  isPaymentOverBalance,
  lockInvoiceForPayment,
  lockSalesOrderForPayment,
  centsToNumber,
  moneyToCents,
  normalizeOptionalText,
  parseIdempotencyKey,
  parseOptionalReceivedAt,
  parsePositivePaymentAmount,
  requirePaymentIdempotencyKey,
} from "@/lib/payment-creation-integrity";
import { sumSignedPaymentCents } from "@/lib/payment-ledger";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const SALES_PAYMENT_TYPE_VALUES = ["DEPOSIT", "FINAL"] as const;
const REFUND_WORKFLOW_REQUIRED =
  "Refunds require the dedicated refund workflow and an original payment reference.";

export async function POST(request: NextRequest, { params }: Params) {
  let idempotencyKey: string | null = null;
  let idempotencyFingerprint: string | null = null;
  let invoiceId: string | null = null;

  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    invoiceId = id;
    if (!id)
      return NextResponse.json(
        { error: "Missing invoice id." },
        { status: 400 },
      );

    const payload = await request.json();
    const amount = parsePositivePaymentAmount(payload?.amount);
    const method = String(
      payload?.method ?? "",
    ).toUpperCase() as SalesPaymentMethod;
    const paymentType = String(
      payload?.type ?? "FINAL",
    ).toUpperCase() as SalesPaymentType;
    const referenceNumber = normalizeOptionalText(payload?.referenceNumber);
    const notes = normalizeOptionalText(payload?.notes);
    const receivedAt = parseOptionalReceivedAt(payload?.receivedAt);
    const parsedKey = parseIdempotencyKey(
      request.headers.get("idempotency-key"),
    );

    if (!amount) {
      return NextResponse.json(
        { error: "Payment amount must be greater than 0." },
        { status: 400 },
      );
    }
    if (!Object.values(SalesPaymentMethod).includes(method)) {
      return NextResponse.json(
        { error: "Invalid payment method." },
        { status: 400 },
      );
    }
    if (paymentType === "REFUND") {
      return NextResponse.json(
        { error: REFUND_WORKFLOW_REQUIRED },
        { status: 400 },
      );
    }
    if (
      !SALES_PAYMENT_TYPE_VALUES.includes(
        paymentType as (typeof SALES_PAYMENT_TYPE_VALUES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Invalid payment type." },
        { status: 400 },
      );
    }
    if (!receivedAt.ok) {
      return NextResponse.json({ error: receivedAt.error }, { status: 400 });
    }
    if (!parsedKey.ok) {
      return NextResponse.json({ error: parsedKey.error }, { status: 400 });
    }
    const requiredKey = requirePaymentIdempotencyKey(parsedKey);
    if (!requiredKey.ok) {
      return NextResponse.json({ error: requiredKey.error }, { status: 400 });
    }

    idempotencyKey = parsedKey.key;
    idempotencyFingerprint = idempotencyKey
      ? buildPaymentIdempotencyFingerprint({
          amount: amount.amount,
          invoiceId: id,
          method,
          notes,
          receivedAt: receivedAt.fingerprintValue,
          referenceNumber,
          scope: "invoice-payment",
          type: paymentType,
        })
      : null;

    const result = await prisma.$transaction(
      async (tx) => {
        const initialInvoice = await tx.invoice.findUnique({
          where: { id },
          select: { id: true, salesOrderId: true },
        });
        if (!initialInvoice) throw new Error("NOT_FOUND");
        if (!initialInvoice.salesOrderId) throw new Error("NO_SALES_ORDER");

        const orderLocked = await lockSalesOrderForPayment(
          tx,
          initialInvoice.salesOrderId,
        );
        if (!orderLocked) throw new Error("NO_SALES_ORDER");
        const invoiceLocked = await lockInvoiceForPayment(tx, id);
        if (!invoiceLocked) throw new Error("NOT_FOUND");

        const invoice = await tx.invoice.findUnique({
          where: { id },
          select: { id: true, status: true, total: true, salesOrderId: true },
        });
        if (!invoice) throw new Error("NOT_FOUND");
        if (invoice.status === "void") throw new Error("VOIDED");
        if (!invoice.salesOrderId) throw new Error("NO_SALES_ORDER");

        if (idempotencyKey) {
          const existingPayment = await tx.salesOrderPayment.findUnique({
            where: { idempotencyKey },
            select: { id: true, invoiceId: true, idempotencyFingerprint: true },
          });
          if (existingPayment) {
            if (
              existingPayment.invoiceId !== invoice.id ||
              existingPayment.idempotencyFingerprint !== idempotencyFingerprint
            ) {
              throw new Error("IDEMPOTENCY_CONFLICT");
            }
            const totals = await computeInvoicePaidAndBalance(
              tx,
              invoice.id,
              Number(invoice.total),
            );
            return {
              ...totals,
              paymentId: existingPayment.id,
              idempotent: true,
            };
          }
        }

        const invoiceBalanceCents = Math.max(
          await getInvoiceRemainingCents(tx, invoice.id),
          0,
        );
        const orderRemainingCents = await getSalesOrderRemainingCents(
          tx,
          invoice.salesOrderId,
        );
        const maxReceivableCents = Math.min(
          invoiceBalanceCents,
          Math.max(orderRemainingCents, 0),
        );
        if (isPaymentOverBalance(amount.cents, maxReceivableCents)) {
          throw new Error("OVERPAYMENT");
        }

        const payment = await tx.salesOrderPayment.create({
          data: {
            salesOrderId: invoice.salesOrderId,
            invoiceId: invoice.id,
            amount: amount.amount,
            method,
            paymentType,
            status: "POSTED",
            referenceNumber,
            notes,
            receivedAt: receivedAt.receivedAt,
            idempotencyKey,
            idempotencyFingerprint,
          },
        });

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
        await recalculateSalesOrder(tx, invoice.salesOrderId);

        return { ...totals, paymentId: payment.id, idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return NextResponse.json(
      { data: result },
      { status: result.idempotent ? 200 : 201 },
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
        select: { id: true, invoiceId: true, idempotencyFingerprint: true },
      });
      if (
        existingPayment?.invoiceId === invoiceId &&
        existingPayment.idempotencyFingerprint === idempotencyFingerprint &&
        invoiceId
      ) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          select: { id: true, total: true },
        });
        if (invoice) {
          const postedPayments = await prisma.salesOrderPayment.findMany({
            where: { invoiceId: invoice.id, status: "POSTED" },
            select: { amount: true, paymentType: true, status: true },
          });
          const paidCents = sumSignedPaymentCents(postedPayments);
          const balanceCents = moneyToCents(invoice.total) - paidCents;
          const result = {
            paidTotal: centsToNumber(paidCents),
            balanceDue: centsToNumber(balanceCents),
            paymentId: existingPayment.id,
          };
          return NextResponse.json(
            { data: { ...result, idempotent: true } },
            { status: 200 },
          );
        }
      }
      return NextResponse.json(
        {
          error:
            "Idempotency key was already used for a different payment request.",
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Invoice not found." },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "VOIDED") {
      return NextResponse.json(
        { error: "Cannot add payment to a void invoice." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "NO_SALES_ORDER") {
      return NextResponse.json(
        {
          error:
            "Invoice is not linked to a sales order, cannot use shared payment table.",
        },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "OVERPAYMENT") {
      return NextResponse.json(
        {
          error:
            "Payment exceeds current invoice or order balance. Please adjust amount.",
        },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
      return NextResponse.json(
        {
          error:
            "Idempotency key was already used for a different payment request.",
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "MONEY_VALUE_INVALID") {
      return NextResponse.json(
        { error: "Payment amount could not be validated." },
        { status: 400 },
      );
    }
    console.error("POST /api/invoices/[id]/payments error:", error);
    return NextResponse.json(
      { error: "Failed to add invoice payment." },
      { status: 500 },
    );
  }
}
