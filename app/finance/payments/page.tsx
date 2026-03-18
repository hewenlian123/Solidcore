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
      <div className="glass-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Payments Overview</h1>
        <p className="mt-2 text-sm txt-secondary">
          Daily and monthly payment performance with outstanding balances.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
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

          <article className="glass-card p-8">
            <h2 className="text-base font-semibold text-white">Payment Trend (Last 30 Days)</h2>
            <div className="mt-4 min-h-[220px] h-[320px]">
              {mounted ? (
                <ResponsiveContainer width="100%" height={220} minHeight={220} minWidth={0}>
                  <LineChart data={data.paymentTrend}>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, strokeDasharray: "3 4" }}
                      contentStyle={{
                        background: "linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 16,
                        color: "rgba(255,255,255,0.90)",
                        backdropFilter: "blur(16px)",
                      }}
                      labelStyle={{ color: "rgba(255,255,255,0.70)" }}
                      itemStyle={{ color: "rgba(255,255,255,0.85)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#06B6D4"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl" />
              )}
            </div>
          </article>

          <article className="glass-card p-8">
            <h2 className="text-base font-semibold text-white">Top Customers by Outstanding</h2>
            <div className="glass-card mt-3 overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                    <TableHead>Customer</TableHead>
                    <TableHead>Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topCustomersByOutstanding.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center txt-muted">
                        No outstanding balances.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.topCustomersByOutstanding.map((row) => (
                      <TableRow key={row.customerId} className="border-white/10 transition-colors hover:bg-white/[0.06]">
                        <TableCell className="font-semibold text-white">{row.customerName}</TableCell>
                        <TableCell className="font-semibold text-rose-300">${row.balance.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </article>

          <article className="glass-card p-8">
            <h2 className="text-base font-semibold text-white">Recent Payments</h2>
            <div className="glass-card mt-3 overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
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
                      <TableCell colSpan={6} className="text-center txt-muted">
                        No posted payments yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentPayments.map((row) => (
                      <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/[0.06]">
                        <TableCell>
                          {new Date(row.dateTime).toLocaleString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="font-semibold text-white">{row.customerName}</TableCell>
                        <TableCell>
                          <span className="text-xs txt-muted">
                            {row.relatedType === "INVOICE" ? "Invoice" : "Sales Order"}:
                          </span>{" "}
                          {row.relatedType === "INVOICE" ? (
                            <Link
                              href={`/invoices/${row.relatedId}`}
                              className="text-white underline-offset-2 hover:underline"
                            >
                              {row.relatedNumber}
                            </Link>
                          ) : (
                            <Link
                              href={`/sales-orders/${row.relatedId}`}
                              className="text-white underline-offset-2 hover:underline"
                            >
                              {row.relatedNumber}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>{row.method}</TableCell>
                        <TableCell className="font-semibold text-white">${row.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className="rounded border border-emerald-400/30 bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
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
  const cls = tone === "rose" ? "text-rose-300" : "text-white";
  return (
    <article className="glass-card p-8">
      <p className="text-xs txt-muted">{title}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${cls}`}>${value.toFixed(2)}</p>
    </article>
  );
}

function CountCard({ title, value }: { title: string; value: number }) {
  return (
    <article className="glass-card p-8">
      <p className="text-xs txt-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </article>
  );
}
