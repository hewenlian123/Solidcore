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
      <div className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Reconciliation</h1>
            <p className="mt-2 text-sm text-slate-400">
              Match invoices with posted payments, track unmatched records, and close reconciliation rows.
            </p>
          </div>
          <button type="button" onClick={exportCsv} className="ios-secondary-btn h-10 px-4 text-sm">
            Export CSV
          </button>
        </div>
        <div className="glass-card-content mt-4 grid gap-3 md:grid-cols-[180px_180px_auto]">
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
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="glass-card p-5">
        <div className="glass-card-content grid gap-4 md:grid-cols-5">
          <div>
            <p className="text-xs text-slate-500">Total Invoiced</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoney(summary.totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Paid</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatMoney(summary.totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Outstanding</p>
            <p className="mt-1 text-lg font-semibold text-rose-300">{formatMoney(summary.totalOutstanding)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Unmatched Invoices</p>
            <p className="mt-1 text-lg font-semibold text-amber-300">{summary.unmatchedInvoices}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Unmatched Payments</p>
            <p className="mt-1 text-lg font-semibold text-amber-300">{summary.unmatchedPayments}</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-0">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Invoices with Payment Matching</h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
                <TableHead className="text-slate-400">Invoice</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Date</TableHead>
                <TableHead className="text-right text-slate-400">Invoiced</TableHead>
                <TableHead className="text-right text-slate-400">Paid</TableHead>
                <TableHead className="text-right text-slate-400">Outstanding</TableHead>
                <TableHead className="text-slate-400">Matched Payments</TableHead>
                <TableHead className="text-slate-400">Reconciled</TableHead>
                <TableHead className="text-right text-slate-400">Action</TableHead>
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
                  <TableRow key={row.id} className={row.unmatched ? "border-white/10 bg-rose-500/10 transition-colors hover:bg-rose-500/20" : "border-white/10 transition-colors hover:bg-white/10"}>
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${row.id}`} className="text-white underline hover:text-slate-300">
                        {row.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-300">{row.customerName}</TableCell>
                    <TableCell className="text-slate-300">{new Date(row.issueDate).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell className="text-right text-slate-300">{formatMoney(row.total)}</TableCell>
                    <TableCell className="text-right text-slate-300">{formatMoney(row.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.outstanding > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {formatMoney(row.outstanding)}
                    </TableCell>
                    <TableCell>
                      {row.matchedPayments.length === 0 ? (
                        <span className="text-xs text-amber-400">No matched payments</span>
                      ) : (
                        <div className="space-y-1 text-xs text-slate-400">
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
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.reconciled ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border border-white/20 bg-white/5 text-slate-400"}`}>
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

      <div className="glass-card p-0">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Unmatched Payments</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
              <TableHead className="text-slate-400">Payment ID</TableHead>
              <TableHead className="text-slate-400">Date</TableHead>
              <TableHead className="text-slate-400">Customer</TableHead>
              <TableHead className="text-slate-400">Method</TableHead>
              <TableHead className="text-right text-slate-400">Amount</TableHead>
              <TableHead className="text-slate-400">Reference</TableHead>
              <TableHead className="text-slate-400">Reconciled</TableHead>
              <TableHead className="text-right text-slate-400">Action</TableHead>
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
                <TableRow key={row.id} className="border-white/10 bg-amber-500/10 transition-colors hover:bg-amber-500/20">
                  <TableCell className="font-medium text-white">{row.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-slate-300">{formatDateTime(row.date)}</TableCell>
                  <TableCell className="text-slate-300">{row.customerName}</TableCell>
                  <TableCell className="text-slate-300">{row.method}</TableCell>
                  <TableCell className="text-right font-semibold text-white">{formatMoney(row.amount)}</TableCell>
                  <TableCell className="text-slate-300">{row.salesOrderNumber ? `SO ${row.salesOrderNumber}` : "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.reconciled ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border border-white/20 bg-white/5 text-slate-400"}`}>
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
