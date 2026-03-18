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
      <div className="glass-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Financial Summary</h1>
        <p className="mt-2 text-sm txt-secondary">Monthly P&L, aging analysis, and cashflow overview.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="linear-skeleton h-32" />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Total Sales" value={data.pnl.sales} />
            <MetricCard title="Procurement Cost" value={data.pnl.procurementCost} />
            <MetricCard title="After-Sales Cost" value={data.pnl.afterSalesCost} />
            <MetricCard title="Net Profit" value={data.pnl.netProfit} tone={data.pnl.netProfit >= 0 ? "green" : "rose"} />
          </div>

          <article className="glass-card p-8">
            <h2 className="text-base font-semibold text-white">12-month cashflow comparison</h2>
            <div className="mt-4 min-h-[220px] h-[320px]">
              {mounted ? (
                <ResponsiveContainer width="100%" height={220} minHeight={220} minWidth={0}>
                  <BarChart data={data.cashflow}>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
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
                    <Bar dataKey="income" fill="rgba(6,182,212,0.60)" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="expense" fill="rgba(99,102,241,0.50)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-xl" />
              )}
            </div>
          </article>

          <article className="glass-card p-8">
            <h2 className="text-base font-semibold text-white">Unpaid Balance (Aging)</h2>
            <div className="glass-card mt-3 overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
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
                      <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/[0.06]">
                        <TableCell className="font-semibold text-white">{row.orderNo}</TableCell>
                        <TableCell className="txt-secondary">{row.customer.name}</TableCell>
                        <TableCell className="font-semibold text-white">${row.unpaid.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            row.agingDays > 60
                              ? "bg-rose-500/20 text-rose-300 border border-rose-400/30"
                              : row.agingDays > 30
                                ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                                : "bg-white/[0.05] text-white/70 border border-white/[0.10]"
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
  const cls = tone === "green" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : "text-white";
  return (
    <article className="glass-card p-8">
      <p className="text-xs txt-muted">{title.toLowerCase()}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${cls}`}>${value.toFixed(2)}</p>
    </article>
  );
}
