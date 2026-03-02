"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PaymentsOverviewPayload = {
  kpis: {
    todayPayments: number;
    thisMonthPayments: number;
    unpaidInvoices: number;
    totalOutstandingBalance: number;
  };
  topCustomersByOutstanding: Array<{
    customerId: string;
    customerName: string;
    balance: number;
  }>;
  paymentTrend: Array<{ date: string; amount: number }>;
  recentPayments: Array<{
    id: string;
    dateTime: string;
    customerName: string;
    relatedType: "INVOICE" | "SALES_ORDER";
    relatedNumber: string;
    relatedId: string;
    method: string;
    amount: number;
    status: string;
  }>;
};

export default function FinancePaymentsPage() {
  const { role } = useRole();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<PaymentsOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/finance/payments", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load payments overview");
        setData(payload.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load payments overview");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role]);

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payments Overview</h1>
        <p className="mt-2 text-sm text-slate-500">
          Daily and monthly payment performance with outstanding balances.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="linear-skeleton h-28" />
          ))}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Today Payments" value={data.kpis.todayPayments} />
            <MetricCard title="This Month Payments" value={data.kpis.thisMonthPayments} />
            <CountCard title="Unpaid Invoices" value={data.kpis.unpaidInvoices} />
            <MetricCard title="Total Outstanding Balance" value={data.kpis.totalOutstandingBalance} tone="rose" />
          </div>

          <article className="linear-card p-8">
            <h2 className="text-base font-semibold text-slate-900">Payment Trend (Last 30 Days)</h2>
            <div className="mt-4 h-[320px]">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  <LineChart data={data.paymentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#0F172A"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-lg bg-slate-50" />
              )}
            </div>
          </article>

          <article className="linear-card p-8">
            <h2 className="text-base font-semibold text-slate-900">Top Customers by Outstanding</h2>
            <div className="mt-3 overflow-hidden rounded-xl bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>Customer</TableHead>
                    <TableHead>Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topCustomersByOutstanding.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-slate-500">
                        No outstanding balances.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.topCustomersByOutstanding.map((row) => (
                      <TableRow key={row.customerId} className="odd:bg-white even:bg-slate-50/40">
                        <TableCell className="font-semibold text-slate-900">{row.customerName}</TableCell>
                        <TableCell className="font-semibold text-rose-700">${row.balance.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </article>

          <article className="linear-card p-8">
            <h2 className="text-base font-semibold text-slate-900">Recent Payments</h2>
            <div className="mt-3 overflow-hidden rounded-xl bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Related</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500">
                        No posted payments yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentPayments.map((row) => (
                      <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                        <TableCell>
                          {new Date(row.dateTime).toLocaleString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900">{row.customerName}</TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-500">
                            {row.relatedType === "INVOICE" ? "Invoice" : "Sales Order"}:
                          </span>{" "}
                          {row.relatedType === "INVOICE" ? (
                            <Link
                              href={`/invoices/${row.relatedId}`}
                              className="text-slate-900 underline-offset-2 hover:underline"
                            >
                              {row.relatedNumber}
                            </Link>
                          ) : (
                            <Link
                              href={`/sales-orders/${row.relatedId}`}
                              className="text-slate-900 underline-offset-2 hover:underline"
                            >
                              {row.relatedNumber}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>{row.method}</TableCell>
                        <TableCell className="font-semibold text-slate-900">${row.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className="rounded px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700">
                            {row.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}

function MetricCard({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: number;
  tone?: "slate" | "rose";
}) {
  const cls = tone === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <article className="linear-card p-8">
      <p className="text-xs text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${cls}`}>${value.toFixed(2)}</p>
    </article>
  );
}

function CountCard({ title, value }: { title: string; value: number }) {
  return (
    <article className="linear-card p-8">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </article>
  );
}
