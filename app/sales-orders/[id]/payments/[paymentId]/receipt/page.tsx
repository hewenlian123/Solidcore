import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
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
          where: { id: paymentId },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
    });

    const payment = order?.payments[0];
    if (!order || !payment) {
      return (
        <main className="mx-auto max-w-3xl p-8 text-slate-900">
          <div className="linear-card p-8">
            <h1 className="text-xl font-semibold">Receipt not found</h1>
            <p className="mt-2 text-sm text-slate-500">
              The payment receipt does not exist or does not belong to this sales order.
            </p>
            <Link href="/orders" className="ios-secondary-btn mt-4 inline-flex h-10 items-center px-3 text-sm">
              Back to Orders
            </Link>
          </div>
        </main>
      );
    }

    return (
      <main className="mx-auto max-w-3xl p-6 text-slate-900 print:p-0">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={`/orders/${order.id}`} className="ios-secondary-btn inline-flex h-10 items-center px-3 text-sm">
            Back to Sales Order
          </Link>
          <ReceiptPrintButton />
        </div>

        <section className="linear-card p-8 print:shadow-none">
          <header className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{COMPANY_SETTINGS.name}</h1>
              <p className="mt-1 text-sm text-slate-600">{COMPANY_SETTINGS.address}</p>
              <p className="text-sm text-slate-600">
                {COMPANY_SETTINGS.phone} · {COMPANY_SETTINGS.email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Payment Receipt</p>
              <p className="mt-1 text-sm font-medium text-slate-700">#{payment.id.slice(0, 8)}</p>
            </div>
          </header>

          <div className="mt-5 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <p>
              <span className="text-slate-500">Sales Order #:</span> {order.orderNumber}
            </p>
            <p>
              <span className="text-slate-500">Customer:</span> {order.customer.name}
            </p>
            <p>
              <span className="text-slate-500">Phone:</span> {order.customer.phone || "-"}
            </p>
            <p>
              <span className="text-slate-500">Email:</span> {order.customer.email || "-"}
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-800">Payment Details</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <p>
                <span className="text-slate-500">Amount:</span> ${formatMoney(payment.amount)}
              </p>
              <p>
                <span className="text-slate-500">Method:</span> {payment.method}
              </p>
              <p>
                <span className="text-slate-500">Reference #:</span> {payment.referenceNumber || "-"}
              </p>
              <p>
                <span className="text-slate-500">Received At:</span> {formatDateTime(payment.receivedAt)}
              </p>
              <p>
                <span className="text-slate-500">Status:</span>{" "}
                {payment.status === "VOIDED" ? "Voided" : "Posted"}
              </p>
            </div>
            {payment.notes ? (
              <p className="mt-2 text-sm text-slate-600">
                <span className="text-slate-500">Notes:</span> {payment.notes}
              </p>
            ) : null}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-800">Order Summary</h2>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total</span>
                <span>${formatMoney(order.total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Paid (current)</span>
                <span>${formatMoney(order.paidAmount)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
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

          <div className="mt-8 text-sm">
            <p>Customer Signature: ____________________</p>
          </div>
          <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
            Thank you for your business
          </footer>
        </section>
      </main>
    );
  } catch (error) {
    console.error("Receipt page error:", error);
    return (
      <main className="mx-auto max-w-3xl p-8 text-slate-900">
        <div className="linear-card p-8">
          <h1 className="text-xl font-semibold">Receipt not found</h1>
          <p className="mt-2 text-sm text-slate-500">
            We could not load this receipt right now. Please retry from the sales order page.
          </p>
          <Link href="/orders" className="ios-secondary-btn mt-4 inline-flex h-10 items-center px-3 text-sm">
            Back to Orders
          </Link>
        </div>
      </main>
    );
  }
}
