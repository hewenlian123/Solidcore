import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import {
  getPaymentAllocationLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "@/lib/payment-receipt-semantics";
import {
  centsToNumber,
  remainingRefundableCents,
  sumPostedRefundCentsForPayment,
} from "@/lib/payment-ledger";
import { ReceiptPrintButton } from "./print-button";

type Props = {
  params: Promise<{ id: string; paymentId: string }>;
};

function formatMoney(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", { timeZone: "UTC" });
}

export default async function PaymentReceiptPage({ params }: Props) {
  try {
    const { id, paymentId } = await params;
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        payments: {
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
                method: true,
                paymentType: true,
                referenceNumber: true,
                receivedAt: true,
                status: true,
              },
            },
            refunds: {
              select: {
                id: true,
                amount: true,
                paymentType: true,
                refundOfPaymentId: true,
                status: true,
              },
            },
          },
          orderBy: { receivedAt: "desc" },
        },
      },
    });

    const payment = order?.payments.find((row) => row.id === paymentId);
    if (!order || !payment) {
      return (
        <main className="mx-auto max-w-3xl p-8 text-white">
          <div className="glass-card p-8">
            <div className="glass-card-content">
              <h1 className="text-xl font-semibold text-white">
                Receipt not found
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                The payment receipt does not exist or does not belong to this
                sales order.
              </p>
              <Link
                href="/orders"
                className="ios-secondary-btn mt-4 inline-flex h-10 items-center px-3 text-sm"
              >
                Back to Orders
              </Link>
            </div>
          </div>
        </main>
      );
    }

    const paymentTypeLabel = getPaymentTypeLabel(payment.paymentType);
    const paymentStatusLabel = getPaymentStatusLabel(payment.status);
    const allocationLabel = getPaymentAllocationLabel(
      payment.invoice?.invoiceNumber,
    );
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
    const orderedPayments = [...order.payments].sort((left, right) => {
      const createdDiff = left.createdAt.getTime() - right.createdAt.getTime();
      return createdDiff || left.id.localeCompare(right.id);
    });
    const priorNetPaid = orderedPayments
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

    return (
      <main className="mx-auto max-w-3xl p-6 text-white print:p-0 print:text-slate-900">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link
            href={`/orders/${order.id}`}
            className="ios-secondary-btn inline-flex h-10 items-center px-3 text-sm"
          >
            Back to Sales Order
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/api/pdf/payment/${payment.id}?download=true`}
              className="ios-secondary-btn inline-flex h-10 items-center px-3 text-sm"
            >
              Download PDF
            </Link>
            <ReceiptPrintButton />
          </div>
        </div>

        <section
          className="payment-receipt-surface glass-card p-8 print:border print:border-slate-200 print:bg-white print:shadow-none"
          data-testid="payment-receipt"
        >
          <div className="glass-card-content">
            <header className="flex items-start justify-between border-b border-white/10 pb-4 print:border-slate-200">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white print:text-slate-900">
                  {COMPANY_SETTINGS.name}
                </h1>
                <p className="mt-1 text-sm text-slate-400 print:text-slate-600">
                  {COMPANY_SETTINGS.address}
                </p>
                <p className="text-sm text-slate-400 print:text-slate-600">
                  {COMPANY_SETTINGS.phone} · {COMPANY_SETTINGS.email}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {isRefund ? "Refund Receipt" : "Payment Receipt"}
                </p>
                <p className="mt-1 text-sm font-medium text-white/90 print:text-slate-700">
                  #{payment.id.slice(0, 8)}
                </p>
              </div>
            </header>

            <div className="mt-5 grid grid-cols-1 gap-2 text-sm text-white/90 md:grid-cols-2 print:text-slate-900">
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Payment ID:
                </span>{" "}
                {payment.id}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Invoice ID:
                </span>{" "}
                {payment.invoice?.id ?? "-"}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Invoice #:
                </span>{" "}
                {payment.invoice?.invoiceNumber ?? "-"}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Order ID:
                </span>{" "}
                {order.id}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Sales Order #:
                </span>{" "}
                {order.orderNumber}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Customer:
                </span>{" "}
                {order.customer.name}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Phone:
                </span>{" "}
                {order.customer.phone || "-"}
              </p>
              <p>
                <span className="text-slate-400 print:text-slate-500">
                  Email:
                </span>{" "}
                {order.customer.email || "-"}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 p-4 print:border-slate-200">
              <h2 className="text-sm font-semibold text-white print:text-slate-800">
                Payment Details
              </h2>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Amount:
                  </span>{" "}
                  ${formatMoney(payment.amount)}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Payment Type:
                  </span>{" "}
                  {paymentTypeLabel}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Allocation:
                  </span>{" "}
                  {allocationLabel}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Method:
                  </span>{" "}
                  {payment.method}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Reference #:
                  </span>{" "}
                  {payment.referenceNumber || "-"}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Received At:
                  </span>{" "}
                  {formatDateTime(payment.receivedAt)}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Status:
                  </span>{" "}
                  <span
                    className={
                      payment.status === "VOIDED"
                        ? "font-semibold text-rose-300 print:text-rose-700"
                        : ""
                    }
                  >
                    {paymentStatusLabel}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    Prior Balance:
                  </span>{" "}
                  ${formatMoney(priorBalance)}
                </p>
                <p>
                  <span className="text-slate-400 print:text-slate-500">
                    New Balance:
                  </span>{" "}
                  ${formatMoney(newBalance)}
                </p>
              </div>
              {payment.notes ? (
                <p className="mt-2 text-sm text-slate-400 print:text-slate-600">
                  <span className="text-slate-500">Notes:</span> {payment.notes}
                </p>
              ) : null}
              {originalPayment ? (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm print:border-slate-200 print:bg-slate-50">
                  <h3 className="font-semibold text-white print:text-slate-800">
                    {isRefund ? "Refund Authority" : "Refund Status"}
                  </h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <p>
                      <span className="text-slate-400 print:text-slate-500">
                        Original Payment Event ID:
                      </span>{" "}
                      {originalPaymentId ?? "-"}
                    </p>
                    <p>
                      <span className="text-slate-400 print:text-slate-500">
                        Original Amount:
                      </span>{" "}
                      ${formatMoney(originalPayment.amount)}
                    </p>
                    <p>
                      <span className="text-slate-400 print:text-slate-500">
                        Refunded Total:
                      </span>{" "}
                      ${formatMoney(refundedTotal)}
                    </p>
                    <p>
                      <span className="text-slate-400 print:text-slate-500">
                        Remaining Refundable:
                      </span>{" "}
                      ${formatMoney(remainingRefundable)}
                    </p>
                    {isRefund ? (
                      <>
                        <p>
                          <span className="text-slate-400 print:text-slate-500">
                            Refund Event ID:
                          </span>{" "}
                          {payment.id}
                        </p>
                        <p>
                          <span className="text-slate-400 print:text-slate-500">
                            Approved Return ID:
                          </span>{" "}
                          {payment.approvedReturn?.id ?? "-"}
                        </p>
                        <p>
                          <span className="text-slate-400 print:text-slate-500">
                            Approval Actor:
                          </span>{" "}
                          {payment.refundApprovalActor ?? "-"}
                        </p>
                        <p>
                          <span className="text-slate-400 print:text-slate-500">
                            Accounting Review:
                          </span>{" "}
                          {payment.refundReviewActor ?? "-"}
                        </p>
                        <p>
                          <span className="text-slate-400 print:text-slate-500">
                            Commercial Reduction Source:
                          </span>{" "}
                          {payment.invoice
                            ? `Invoice ${payment.invoice.invoiceNumber} · $${formatMoney(
                                payment.commercialReductionSnapshot ??
                                  payment.invoice.discountAmount,
                              )}`
                            : "No issued invoice reduction"}
                        </p>
                        <p>
                          <span className="text-slate-400 print:text-slate-500">
                            Refund Method:
                          </span>{" "}
                          {payment.method}
                        </p>
                        <p className="md:col-span-2">
                          <span className="text-slate-400 print:text-slate-500">
                            Resulting Financial Position:
                          </span>{" "}
                          ${formatMoney(newBalance)} balance due
                        </p>
                        <p className="md:col-span-2">
                          <span className="text-slate-400 print:text-slate-500">
                            Original Reference:
                          </span>{" "}
                          {originalPayment.referenceNumber || "-"}
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 rounded-xl border border-white/10 p-4 print:border-slate-200">
              <h2 className="text-sm font-semibold text-white print:text-slate-800">
                Order Summary
              </h2>
              <div className="mt-2 space-y-1 text-sm text-white/90 print:text-slate-900">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 print:text-slate-500">
                    Total
                  </span>
                  <span>${formatMoney(order.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 print:text-slate-500">
                    Paid (current)
                  </span>
                  <span>${formatMoney(order.paidAmount)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-white print:text-slate-900">
                  <span>Balance Due</span>
                  <span>${formatMoney(order.balanceDue)}</span>
                </div>
              </div>
              {order.hidePrices ? (
                <p className="mt-2 text-xs text-slate-500">
                  Customer-facing pricing is hidden for this sales order.
                </p>
              ) : null}
            </div>

            <div className="mt-8 text-sm text-white/90 print:text-slate-900">
              <p>Customer Signature: ____________________</p>
            </div>
            <footer className="mt-8 border-t border-white/10 pt-4 text-sm text-slate-400 print:border-slate-200 print:text-slate-600">
              Thank you for your business
            </footer>
          </div>
        </section>
      </main>
    );
  } catch (error) {
    console.error("Receipt page error:", error);
    return (
      <main className="mx-auto max-w-3xl p-8 text-white">
        <div className="glass-card p-8">
          <div className="glass-card-content">
            <h1 className="text-xl font-semibold text-white">
              Receipt not found
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              We could not load this receipt right now. Please retry from the
              sales order page.
            </p>
            <Link
              href="/orders"
              className="ios-secondary-btn mt-4 inline-flex h-10 items-center px-3 text-sm"
            >
              Back to Orders
            </Link>
          </div>
        </div>
      </main>
    );
  }
}
