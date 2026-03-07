"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";

type PaymentDetail = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    total: string;
    salesOrderId: string;
    customer: { id: string; name: string; phone: string | null; email: string | null } | null;
    salesOrder: { id: string; orderNumber: string } | null;
  };
  payment: {
    id: string;
    amount: string;
    method: string;
    paymentType: string;
    status: "POSTED" | "VOIDED";
    referenceNumber: string | null;
    receivedAt: string;
    notes: string | null;
    createdAt: string;
  };
  paidTotal: string;
  balanceDue: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", { timeZone: "UTC" });
}

export default function InvoicePaymentDetailPage() {
  const params = useParams<{ id: string; paymentId: string }>();
  const router = useRouter();
  const { role } = useRole();
  const invoiceId = String(params?.id ?? "");
  const paymentId = String(params?.paymentId ?? "");

  const [data, setData] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load payment");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!invoiceId || !paymentId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, paymentId, role]);

  const deletePayment = async () => {
    if (!data) return;
    const ok = window.confirm("Delete this payment? This will void it and update invoice balance.");
    if (!ok) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete payment");
      router.push(`/invoices/${invoiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete payment");
    } finally {
      setSaving(false);
    }
  };

  const hardDeletePayment = async () => {
    if (!data) return;
    const ok = window.confirm("Hard delete this payment permanently? This cannot be undone.");
    if (!ok) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/invoices/${invoiceId}/payments/${paymentId}?hard=true`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to hard delete payment");
      router.push(`/invoices/${invoiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hard delete payment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="glass-card p-8 text-sm text-slate-400">Loading payment...</div>;
  if (!data) return <div className="glass-card p-8 text-sm text-slate-400">Payment not found.</div>;

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/invoices/${invoiceId}`} className="text-xs text-slate-400 hover:text-white">
              ← Back to Invoice
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Payment · {data.payment.id.slice(0, 8)}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Invoice: {data.invoice.invoiceNumber} · SO: {data.invoice.salesOrder?.orderNumber ?? "-"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-white/90">
              {data.payment.status}
            </span>
            <button
              type="button"
              onClick={deletePayment}
              disabled={saving || data.payment.status === "VOIDED"}
              className="ios-secondary-btn h-9 px-3 text-xs text-rose-300 disabled:opacity-60"
            >
              {data.payment.status === "VOIDED" ? "Deleted" : "Delete Payment"}
            </button>
            {role === "ADMIN" ? (
              <button
                type="button"
                onClick={hardDeletePayment}
                disabled={saving}
                className="ios-secondary-btn h-9 px-3 text-xs text-rose-300 disabled:opacity-60"
              >
                Hard Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <article className="glass-card space-y-2 p-6 text-sm">
          <div className="glass-card-content">
            <h2 className="text-base font-semibold text-white">Payment Details</h2>
            <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="text-white">${Number(data.payment.amount).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Method</span><span className="text-white/90">{data.payment.method}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="text-white/90">{data.payment.paymentType}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Reference</span><span className="text-white/90">{data.payment.referenceNumber || "-"}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Received At</span><span className="text-white/90">{formatDateTime(data.payment.receivedAt)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Created At</span><span className="text-white/90">{formatDateTime(data.payment.createdAt)}</span></div>
            {data.payment.notes ? (
              <div className="pt-2 text-xs text-slate-500">Notes: {data.payment.notes}</div>
            ) : null}
          </div>
        </article>

        <article className="glass-card space-y-2 p-6 text-sm">
          <div className="glass-card-content">
            <h2 className="text-base font-semibold text-white">Invoice Summary</h2>
            <div className="flex justify-between"><span className="text-slate-400">Invoice #</span><span className="text-white/90">{data.invoice.invoiceNumber}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-white/90">{data.invoice.status}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Total</span><span className="text-white/90">${Number(data.invoice.total).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Paid</span><span className="text-white/90">${Number(data.paidTotal).toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold"><span className="text-slate-300">Balance</span><span className="text-white">${Number(data.balanceDue).toFixed(2)}</span></div>
            <div className="pt-2 text-xs text-slate-500">
              Customer: {data.invoice.customer?.name ?? "-"}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
