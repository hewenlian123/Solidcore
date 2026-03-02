"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRole } from "@/components/layout/role-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReportsResponse = {
  filters: {
    preset: string;
    start: string;
    end: string;
    salesperson: string | null;
    status: string | null;
    salespeople: string[];
  };
  kpis: {
    sales: {
      totalSales: number;
      salesOrderCount: number;
      avgOrderValue: number;
    };
    cashCollected: {
      totalCollected: number;
      postedPaymentsCount: number;
      voidedPaymentsCount: number;
      voidedPaymentsTotal: number;
    };
    ar: {
      outstandingBalance: number;
      unpaidOrPartialCount: number;
    };
    operational: {
      outboundPendingCount: number;
      outboundInProgressCount: number;
      readyOrInProgressOrdersCount: number;
    };
    specialOrders: {
      specialOrdersCount: number;
      overdueEtaCount: number;
      arrivingSoonCount: number;
    };
  };
  charts: {
    dailyCollected: Array<{ date: string; amount: number }>;
    dailySales: Array<{ date: string; amount: number }>;
  };
  tables: {
    topOutstanding: Array<{
      id: string;
      orderNumber: string;
      total: string;
      paidAmount: string;
      balanceDue: string;
      status: string;
      createdAt: string;
      customer: { name: string };
    }>;
    recentPayments: Array<{
      id: string;
      amount: string;
      method: string;
      status: "POSTED" | "VOIDED";
      referenceNumber: string | null;
      receivedAt: string;
      salesOrderId: string;
      salesOrder: {
        orderNumber: string;
        customer: { name: string };
      };
    }>;
    outboundSnapshot: Array<{
      id: string;
      salesOrderId: string;
      type: string;
      status: string;
      scheduledDate: string;
      salesOrder: { orderNumber: string; customer: { name: string } };
    }>;
    specialOrdersWatchlist: Array<{
      id: string;
      orderNumber: string;
      etaDate: string | null;
      specialOrderStatus: string | null;
      supplierNotes: string | null;
      customer: { name: string };
      supplier: { name: string } | null;
    }>;
    groupSummary: Array<{
      groupId: string | null;
      groupName: string;
      productCount: number;
      totalStock: number;
      stockValue: number;
    }>;
  };
};

const presets = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
] as const;

const statusOptions = [
  "",
  "DRAFT",
  "QUOTED",
  "CONFIRMED",
  "READY",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
];

export default function ReportsPage() {
  const { role } = useRole();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("this_month");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [status, setStatus] = useState("");
  const [outboundSort, setOutboundSort] = useState<"date_asc" | "date_desc" | "status">("date_asc");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (preset) params.set("preset", preset);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (salesperson) params.set("salesperson", salesperson);
      if (status) params.set("status", status);
      const res = await fetch(`/api/reports?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load reports");
      setData(payload.data);
      setStart(payload.data.filters.start);
      setEnd(payload.data.filters.end);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, preset, salesperson, status]);

  const overdueSet = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Set(
      (data?.tables.specialOrdersWatchlist ?? [])
        .filter((row) => {
          if (!row.etaDate) return false;
          const s = (row.specialOrderStatus ?? "").toUpperCase();
          if (s === "ARRIVED" || s === "DELIVERED") return false;
          return new Date(row.etaDate) < today;
        })
        .map((row) => row.id),
    );
  }, [data?.tables.specialOrdersWatchlist]);
  const sortedOutbound = useMemo(() => {
    const rows = [...(data?.tables.outboundSnapshot ?? [])];
    if (outboundSort === "status") {
      rows.sort((a, b) => a.status.localeCompare(b.status));
    } else if (outboundSort === "date_desc") {
      rows.sort(
        (a, b) =>
          new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
      );
    } else {
      rows.sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
      );
    }
    return rows;
  }, [data?.tables.outboundSnapshot, outboundSort]);

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
        <p className="mt-2 text-sm text-slate-500">
          Store sales, cash, AR, outbound, and special-order KPIs with drill-down details.
        </p>
      </div>

      <div className="linear-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                preset === p.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">Start Date</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="ios-input h-10 w-full px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">End Date</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="ios-input h-10 w-full px-3 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">Salesperson</span>
            <select
              value={salesperson}
              onChange={(e) => setSalesperson(e.target.value)}
              className="ios-input h-10 w-full bg-white px-3 text-sm"
            >
              <option value="">All</option>
              {(data?.filters.salespeople ?? []).map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">Order Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="ios-input h-10 w-full bg-white px-3 text-sm"
            >
              {statusOptions.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "All"}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" onClick={load} className="ios-primary-btn h-10 w-full text-sm">
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading || !data ? (
        <div className="linear-card p-8 text-sm text-slate-500">Loading reports...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <article className="linear-card p-6">
              <p className="text-xs text-slate-500">Total Sales</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">${data.kpis.sales.totalSales.toFixed(2)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {data.kpis.sales.salesOrderCount} orders · Avg ${data.kpis.sales.avgOrderValue.toFixed(2)}
              </p>
            </article>
            <article className="linear-card p-6">
              <p className="text-xs text-slate-500">Cash Collected</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                ${data.kpis.cashCollected.totalCollected.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {data.kpis.cashCollected.postedPaymentsCount} payments · Voided {data.kpis.cashCollected.voidedPaymentsCount} (
                ${data.kpis.cashCollected.voidedPaymentsTotal.toFixed(2)})
              </p>
            </article>
            <article className="linear-card p-6">
              <p className="text-xs text-slate-500">Accounts Receivable</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">${data.kpis.ar.outstandingBalance.toFixed(2)}</p>
              <p className="mt-1 text-xs text-slate-500">{data.kpis.ar.unpaidOrPartialCount} unpaid/partial orders</p>
            </article>
            <article className="linear-card p-6">
              <p className="text-xs text-slate-500">Operational</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{data.kpis.operational.outboundPendingCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                Pending queue · In progress {data.kpis.operational.outboundInProgressCount} · Ready {data.kpis.operational.readyOrInProgressOrdersCount}
              </p>
            </article>
            <article className="linear-card p-6">
              <p className="text-xs text-slate-500">Special Orders</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{data.kpis.specialOrders.specialOrdersCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                Overdue {data.kpis.specialOrders.overdueEtaCount} · Arriving soon {data.kpis.specialOrders.arrivingSoonCount}
              </p>
            </article>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <article className="linear-card p-6">
              <h2 className="text-base font-semibold text-slate-900">Daily Collected ($)</h2>
              <div className="mt-3 h-[240px]">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                    <BarChart data={data.charts.dailyCollected}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number | string | undefined) => `$${Number(v ?? 0).toFixed(2)}`} />
                      <Bar dataKey="amount" fill="#0f766e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-lg bg-slate-50" />
                )}
              </div>
            </article>
            <article className="linear-card p-6">
              <h2 className="text-base font-semibold text-slate-900">Daily Sales ($)</h2>
              <div className="mt-3 h-[240px]">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                    <BarChart data={data.charts.dailySales}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number | string | undefined) => `$${Number(v ?? 0).toFixed(2)}`} />
                      <Bar dataKey="amount" fill="#1e293b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-lg bg-slate-50" />
                )}
              </div>
            </article>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Top Outstanding Orders (AR)</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tables.topOutstanding.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.orderNumber}</TableCell>
                    <TableCell>{row.customer.name}</TableCell>
                    <TableCell>${Number(row.total).toFixed(2)}</TableCell>
                    <TableCell>${Number(row.paidAmount).toFixed(2)}</TableCell>
                    <TableCell>${Number(row.balanceDue).toFixed(2)}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell>
                      <Link href={`/orders/${row.id}`} className="ios-secondary-btn h-8 px-2 py-1 text-xs">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Recent Payments</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tables.recentPayments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.receivedAt).toLocaleString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell>{row.salesOrder.orderNumber}</TableCell>
                    <TableCell>{row.salesOrder.customer.name}</TableCell>
                    <TableCell>{row.method}</TableCell>
                    <TableCell>{row.referenceNumber || "-"}</TableCell>
                    <TableCell>${Number(row.amount).toFixed(2)}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>
                      <Link
                        href={`/sales-orders/${row.salesOrderId}/payments/${row.id}/receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ios-secondary-btn h-8 px-2 py-1 text-xs"
                      >
                        Receipt
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Outbound Queue Snapshot</h3>
                <select
                  value={outboundSort}
                  onChange={(e) => setOutboundSort(e.target.value as "date_asc" | "date_desc" | "status")}
                  className="ios-input h-9 w-44 bg-white px-2 text-xs"
                >
                  <option value="date_asc">Sort: Date (Oldest)</option>
                  <option value="date_desc">Sort: Date (Newest)</option>
                  <option value="status">Sort: Status</option>
                </select>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOutbound.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.salesOrder.orderNumber}</TableCell>
                    <TableCell>{row.salesOrder.customer.name}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{new Date(row.scheduledDate).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>
                      <Link href={`/orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 py-1 text-xs">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Special Orders Watchlist</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Special Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tables.specialOrdersWatchlist.map((row) => (
                  <TableRow key={row.id} className={overdueSet.has(row.id) ? "bg-rose-50/60" : ""}>
                    <TableCell>{row.orderNumber}</TableCell>
                    <TableCell>{row.customer.name}</TableCell>
                    <TableCell>{row.supplier?.name ?? "-"}</TableCell>
                    <TableCell>
                      {row.etaDate
                        ? new Date(row.etaDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                        : "-"}
                    </TableCell>
                    <TableCell>{row.specialOrderStatus ?? "-"}</TableCell>
                    <TableCell>{row.supplierNotes ?? "-"}</TableCell>
                    <TableCell>
                      <Link href={`/orders/${row.id}`} className="ios-secondary-btn h-8 px-2 py-1 text-xs">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Inventory by Group</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Total Stock</TableHead>
                  <TableHead>Stock Value (Sales Price)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tables.groupSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500">
                      No inventory data.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.tables.groupSummary.map((row) => (
                    <TableRow key={row.groupId ?? "ungrouped"}>
                      <TableCell>{row.groupName}</TableCell>
                      <TableCell>{row.productCount}</TableCell>
                      <TableCell>{row.totalStock.toFixed(2)}</TableCell>
                      <TableCell>${row.stockValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
