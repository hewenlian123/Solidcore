"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { formatInternalSubtitle, formatLineItemTitle } from "@/lib/display";

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  salesOrderId: string | null;
  customerId: string | null;
  issueDate: string;
  dueDate: string | null;
  status: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  billingAddress: string | null;
  notes: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null; address: string | null } | null;
  salesOrder: { id: string; orderNumber: string } | null;
  items: Array<{
    id: string;
    skuSnapshot: string | null;
    titleSnapshot: string | null;
    description?: string | null;
    available?: number | null;
    uomSnapshot: string | null;
    unitPrice: string;
    qty: string;
    discount: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    paymentType: string;
    status: "POSTED" | "VOIDED";
    referenceNumber: string | null;
    receivedAt: string;
    notes: string | null;
  }>;
  paidTotal: string;
  balanceDue: string;
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; src: string } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "CASH",
    type: "FINAL",
    referenceNumber: "",
    receivedAt: "",
    notes: "",
  });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/invoices/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load invoice");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const paymentStatus = useMemo(() => {
    if (!data) return "unpaid";
    const balance = Number(data.balanceDue);
    if (balance <= 0) return "paid";
    if (Number(data.paidTotal) > 0) return "partial";
    return "unpaid";
  }, [data]);
  const paymentAmount = Number(paymentForm.amount || 0);
  const currentBalance = Number(data?.balanceDue ?? 0);
  const isOverPayment =
    paymentForm.type !== "REFUND" &&
    Number.isFinite(paymentAmount) &&
    paymentAmount > 0 &&
    paymentAmount > currentBalance + 0.0001;

  const markSent = async () => {
    if (!data) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}/mark-sent`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to mark sent");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark sent");
    } finally {
      setSaving(false);
    }
  };

  const voidInvoice = async () => {
    if (!data) return;
    const ok = window.confirm("Void this invoice?");
    if (!ok) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}/void`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to void invoice");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void invoice");
    } finally {
      setSaving(false);
    }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(paymentForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add payment");
      setOpenPayment(false);
      setPaymentForm({
        amount: "",
        method: "CASH",
        type: "FINAL",
        referenceNumber: "",
        receivedAt: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="linear-card p-8 text-sm text-slate-500">Loading invoice...</div>;
  if (!data) return <div className="linear-card p-8 text-sm text-slate-500">Invoice not found.</div>;

  return (
    <section className="space-y-8">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/invoices" className="text-xs text-slate-500 hover:text-slate-700">
              ← Back to Invoices
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{data.invoiceNumber}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Customer: {data.customer?.name ?? "-"} · SO: {data.salesOrder?.orderNumber ?? "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{data.status}</span>
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{paymentStatus}</span>
            <button
              type="button"
              onClick={() =>
                setPdfPreview({
                  title: `Invoice ${data.invoiceNumber}`,
                  src: `/api/pdf/invoice/${data.id}`,
                })
              }
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Preview PDF
            </button>
            <a
              href={`/api/pdf/invoice/${data.id}?download=true`}
              className="ios-secondary-btn h-9 px-3 text-xs"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download PDF
            </a>
            <button type="button" onClick={markSent} disabled={saving || data.status === "void"} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Mark Sent
            </button>
            <button type="button" onClick={() => setOpenPayment(true)} disabled={saving || data.status === "void"} className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60">
              Add Payment
            </button>
            <button type="button" onClick={voidInvoice} disabled={saving || data.status === "void"} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Void
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="linear-card p-8 xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Items</h2>
          <div className="mt-4 space-y-2">
            {data.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatLineItemTitle({
                        variant: {
                          title: item.titleSnapshot,
                          sku: item.skuSnapshot,
                          detailText: item.description,
                        },
                      })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatInternalSubtitle({ variantSku: item.skuSnapshot ?? "-", available: item.available })}
                      {item.uomSnapshot ? ` · ${item.uomSnapshot}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Qty {Number(item.qty).toFixed(2)}</p>
                    <p className="font-semibold text-slate-900">${Number(item.lineTotal).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="linear-card space-y-3 p-8 text-sm">
          <h2 className="text-base font-semibold text-slate-900">Totals</h2>
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>${Number(data.subtotal).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>${Number(data.taxAmount).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span>${Number(data.total).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>${Number(data.paidTotal).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance</span><span>${Number(data.balanceDue).toFixed(2)}</span></div>
          <div className="pt-2 text-xs text-slate-500">
            Billing Address: {data.billingAddress || "-"}
          </div>
        </aside>
      </div>

      <article className="linear-card p-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Payments</h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Ref</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{new Date(payment.receivedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</td>
                    <td className="py-2 pr-4">{payment.method}</td>
                    <td className="py-2 pr-4">{payment.paymentType}</td>
                    <td className="py-2 pr-4">{payment.referenceNumber || "-"}</td>
                    <td className="py-2 pr-4">${Number(payment.amount).toFixed(2)}</td>
                    <td className="py-2 pr-4">{payment.status}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPdfPreview({
                            title: `Payment ${payment.id.slice(0, 8)}`,
                            src: `/api/pdf/payment/${payment.id}`,
                          })
                        }
                        className="ios-secondary-btn h-8 px-2 text-xs"
                      >
                        Preview Receipt PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {openPayment ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-4">
          <form onSubmit={addPayment} className="w-full max-w-md rounded-xl border border-slate-100 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Add Payment</h3>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Amount</span>
                <input className="ios-input h-10 w-full px-3 text-sm" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} required />
              </label>
              <p className="text-xs text-slate-500">
                Current Balance: ${currentBalance.toFixed(2)}
              </p>
              {isOverPayment ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  Payment exceeds current balance. Adjust amount or use Refund type if applicable.
                </p>
              ) : null}
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Method</span>
                <select className="ios-input h-10 w-full bg-white px-3 text-sm" value={paymentForm.method} onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}>
                  <option value="CASH">Cash</option>
                  <option value="CHECK">Check</option>
                  <option value="CARD">Card</option>
                  <option value="BANK">Bank</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Type</span>
                <select className="ios-input h-10 w-full bg-white px-3 text-sm" value={paymentForm.type} onChange={(e) => setPaymentForm((prev) => ({ ...prev, type: e.target.value }))}>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="FINAL">Final</option>
                  <option value="REFUND">Refund</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Reference</span>
                <input className="ios-input h-10 w-full px-3 text-sm" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm((prev) => ({ ...prev, referenceNumber: e.target.value }))} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Received Date</span>
                <input className="ios-input h-10 w-full px-3 text-sm" type="datetime-local" value={paymentForm.receivedAt} onChange={(e) => setPaymentForm((prev) => ({ ...prev, receivedAt: e.target.value }))} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenPayment(false)} className="ios-secondary-btn h-10 px-3 text-sm">
                Cancel
              </button>
              <button type="submit" className="ios-primary-btn h-10 px-3 text-sm" disabled={saving || isOverPayment}>
                {saving ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <PDFPreviewModal
        open={Boolean(pdfPreview)}
        title={pdfPreview?.title ?? "PDF Preview"}
        src={pdfPreview?.src ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </section>
  );
}
