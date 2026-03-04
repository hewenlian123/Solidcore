"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MatchedPayment = {
  id: string;
  date: string;
  method: string;
  amount: number;
  reconciled: boolean;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  customerName: string;
  total: number;
  paid: number;
  outstanding: number;
  matchedPayments: MatchedPayment[];
  matchedCount: number;
  reconciled: boolean;
  unmatched: boolean;
};

type UnmatchedPaymentRow = {
  id: string;
  date: string;
  customerName: string;
  method: string;
  amount: number;
  salesOrderNumber: string | null;
  invoiceNumber: string | null;
  reconciled: boolean;
};

type Payload = {
  data: {
    summary: {
      totalInvoiced: number;
      totalPaid: number;
      totalOutstanding: number;
      unmatchedInvoices: number;
      unmatchedPayments: number;
    };
    invoices: InvoiceRow[];
    unmatchedPayments: UnmatchedPaymentRow[];
  };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { timeZone: "UTC" });
}

export default function ReconciliationPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Payload["data"]["summary"]>({
    totalInvoiced: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    unmatchedInvoices: 0,
    unmatchedPayments: 0,
  });
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [unmatchedPayments, setUnmatchedPayments] = useState<UnmatchedPaymentRow[]>([]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, to]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = queryString ? `/api/reconciliation?${queryString}` : "/api/reconciliation";
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to load reconciliation.");
      setSummary(payload.data?.summary ?? summary);
      setInvoices(payload.data?.invoices ?? []);
      setUnmatchedPayments(payload.data?.unmatchedPayments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markReconciled = async (type: "invoice" | "payment", id: string) => {
    try {
      setBusyId(id);
      setError(null);
      const res = await fetch("/api/reconciliation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to mark reconciled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark reconciled.");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const url = queryString ? `/api/reconciliation/export?${queryString}` : "/api/reconciliation/export";
    window.location.href = url;
  };

  return (
    <section className="space-y-6">
      <div className="linear-card p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reconciliation</h1>
            <p className="mt-2 text-sm text-slate-500">
              Match invoices with posted payments, track unmatched records, and close reconciliation rows.
            </p>
          </div>
          <button type="button" onClick={exportCsv} className="ios-secondary-btn h-10 px-4 text-sm">
            Export CSV
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_180px_auto]">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ios-input h-10 px-3 text-sm" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ios-input h-10 px-3 text-sm" />
          </label>
          <div className="flex items-end">
            <button type="button" onClick={load} className="ios-primary-btn h-10 px-4 text-sm">
              Apply Date Filter
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card p-5">
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <p className="text-xs text-slate-500">Total Invoiced</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(summary.totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Paid</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(summary.totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Outstanding</p>
            <p className="mt-1 text-lg font-semibold text-rose-700">{formatMoney(summary.totalOutstanding)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Unmatched Invoices</p>
            <p className="mt-1 text-lg font-semibold text-amber-700">{summary.unmatchedInvoices}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Unmatched Payments</p>
            <p className="mt-1 text-lg font-semibold text-amber-700">{summary.unmatchedPayments}</p>
          </div>
        </div>
      </div>

      <div className="linear-card p-0">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Invoices with Payment Matching</h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Matched Payments</TableHead>
                <TableHead>Reconciled</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500">
                    No invoices in this range.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((row) => (
                  <TableRow key={row.id} className={row.unmatched ? "bg-rose-50/50 hover:bg-rose-50/70" : "odd:bg-white even:bg-slate-50/30"}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${row.id}`} className="text-slate-900 underline">
                        {row.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell>{new Date(row.issueDate).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.total)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.outstanding > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {formatMoney(row.outstanding)}
                    </TableCell>
                    <TableCell>
                      {row.matchedPayments.length === 0 ? (
                        <span className="text-xs text-amber-700">No matched payments</span>
                      ) : (
                        <div className="space-y-1 text-xs text-slate-600">
                          {row.matchedPayments.slice(0, 3).map((payment) => (
                            <p key={payment.id}>
                              {payment.method} {formatMoney(payment.amount)} · {new Date(payment.date).toLocaleDateString("en-US", { timeZone: "UTC" })}
                            </p>
                          ))}
                          {row.matchedPayments.length > 3 ? <p>+{row.matchedPayments.length - 3} more</p> : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.reconciled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                        {row.reconciled ? "Yes" : "No"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        className="ios-secondary-btn h-8 px-2 text-xs"
                        onClick={() => markReconciled("invoice", row.id)}
                        disabled={busyId === row.id || row.reconciled}
                      >
                        Mark Reconciled
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="linear-card p-0">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Unmatched Payments</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Payment ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Reconciled</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unmatchedPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-500">
                  No unmatched payments in this range.
                </TableCell>
              </TableRow>
            ) : (
              unmatchedPayments.map((row) => (
                <TableRow key={row.id} className="bg-amber-50/40 hover:bg-amber-50/60">
                  <TableCell className="font-medium text-slate-900">{row.id.slice(0, 8)}</TableCell>
                  <TableCell>{formatDateTime(row.date)}</TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell>{row.method}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatMoney(row.amount)}</TableCell>
                  <TableCell>{row.salesOrderNumber ? `SO ${row.salesOrderNumber}` : "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.reconciled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {row.reconciled ? "Yes" : "No"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      className="ios-secondary-btn h-8 px-2 text-xs"
                      onClick={() => markReconciled("payment", row.id)}
                      disabled={busyId === row.id || row.reconciled}
                    >
                      Mark Reconciled
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
