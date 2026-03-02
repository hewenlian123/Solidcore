"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wallet } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FinancePayload = {
  pnl: {
    sales: number;
    procurementCost: number;
    afterSalesCost: number;
    netProfit: number;
  };
  receivables: Array<{
    id: string;
    orderNo: string;
    createdAt: string;
    totalAmount: string;
    paidAmount: string;
    unpaid: number;
    agingDays: number;
    customer: { name: string };
  }>;
  cashflow: Array<{ month: string; income: number; expense: number }>;
};

export default function FinancePage() {
  const { role } = useRole();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/finance", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load finance report");
        setData(payload.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load finance report");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role]);

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financial Summary</h1>
        <p className="mt-2 text-sm text-slate-500">Monthly P&L, aging analysis, and cashflow overview.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="linear-skeleton h-32" />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Total Sales" value={data.pnl.sales} />
            <MetricCard title="Procurement Cost" value={data.pnl.procurementCost} />
            <MetricCard title="After-Sales Cost" value={data.pnl.afterSalesCost} />
            <MetricCard title="Net Profit" value={data.pnl.netProfit} tone={data.pnl.netProfit >= 0 ? "green" : "rose"} />
          </div>

          <article className="linear-card p-8">
            <h2 className="text-base font-semibold text-slate-900">12 -month cashflow comparison</h2>
            <div className="mt-4 h-[320px]">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
                  <BarChart data={data.cashflow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="income" fill="#1E293B" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" fill="#64748B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-lg bg-slate-50" />
              )}
            </div>
          </article>

          <article className="linear-card p-8">
            <h2 className="text-base font-semibold text-slate-900">Unpaid Balance (Aging)</h2>
            <div className="mt-3 overflow-hidden rounded-xl bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Unpaid</TableHead>
                    <TableHead>Aging</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.receivables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="linear-empty">
                          <Wallet className="h-5 w-5" />
                          <span>No unpaid-balance orders</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.receivables.map((row) => (
                      <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                        <TableCell className="font-semibold text-slate-900">{row.orderNo}</TableCell>
                        <TableCell>{row.customer.name}</TableCell>
                        <TableCell className="font-semibold text-slate-900">${row.unpaid.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            row.agingDays > 60 ? "bg-rose-100 text-rose-800" : row.agingDays > 30 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                          }`}>
                            {row.agingDays} days
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
  tone?: "slate" | "green" | "rose";
}) {
  const cls = tone === "green" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <article className="linear-card p-8">
      <p className="text-xs text-slate-400">{title.toLowerCase()}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${cls}`}>${value.toFixed(2)}</p>
    </article>
  );
}
