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

  if (loading) return <div className="linear-card p-8 text-sm text-slate-500">Loading payment...</div>;
  if (!data) return <div className="linear-card p-8 text-sm text-slate-500">Payment not found.</div>;

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/invoices/${invoiceId}`} className="text-xs text-slate-500 hover:text-slate-700">
              ← Back to Invoice
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Payment · {data.payment.id.slice(0, 8)}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Invoice: {data.invoice.invoiceNumber} · SO: {data.invoice.salesOrder?.orderNumber ?? "-"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
              {data.payment.status}
            </span>
            <button
              type="button"
              onClick={deletePayment}
              disabled={saving || data.payment.status === "VOIDED"}
              className="ios-secondary-btn h-9 px-3 text-xs text-rose-700 disabled:opacity-60"
            >
              {data.payment.status === "VOIDED" ? "Deleted" : "Delete Payment"}
            </button>
            {role === "ADMIN" ? (
              <button
                type="button"
                onClick={hardDeletePayment}
                disabled={saving}
                className="ios-secondary-btn h-9 px-3 text-xs text-rose-700 disabled:opacity-60"
              >
                Hard Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <article className="linear-card space-y-2 p-6 text-sm">
          <h2 className="text-base font-semibold text-slate-900">Payment Details</h2>
          <div className="flex justify-between"><span className="text-slate-500">Amount</span><span>${Number(data.payment.amount).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Method</span><span>{data.payment.method}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Type</span><span>{data.payment.paymentType}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Reference</span><span>{data.payment.referenceNumber || "-"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Received At</span><span>{formatDateTime(data.payment.receivedAt)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Created At</span><span>{formatDateTime(data.payment.createdAt)}</span></div>
          {data.payment.notes ? (
            <div className="pt-2 text-xs text-slate-500">Notes: {data.payment.notes}</div>
          ) : null}
        </article>

        <article className="linear-card space-y-2 p-6 text-sm">
          <h2 className="text-base font-semibold text-slate-900">Invoice Summary</h2>
          <div className="flex justify-between"><span className="text-slate-500">Invoice #</span><span>{data.invoice.invoiceNumber}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Status</span><span>{data.invoice.status}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Total</span><span>${Number(data.invoice.total).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>${Number(data.paidTotal).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance</span><span>${Number(data.balanceDue).toFixed(2)}</span></div>
          <div className="pt-2 text-xs text-slate-500">
            Customer: {data.invoice.customer?.name ?? "-"}
          </div>
        </article>
      </div>
    </section>
  );
}
