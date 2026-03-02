"use client";

import Link from "next/link";
import { AlertTriangle, BellRing, Clock3, DollarSign, Package, TrendingUp, Truck, Wallet, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type MetricData = {
  todayDeliveries: number;
  todayPickups: number;
  outForDelivery: number;
  overdueOrders: number;
  pendingFulfillment: number;
  todayRevenue: number;
  unpaidBalance: number;
  totalReceivable: number;
  lowStockCount: number;
  specialOrdersInProgress: number;
  delayedSpecialOrders: number;
};

type TrendData = { date: string; amount: number };
type PieData = { category: string; amount: number; percent: number };
type FulfillmentStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type TodayDeliveryRow = {
  id: string;
  salesOrderId: string;
  startAt: string;
  orderNumber: string;
  customer: string;
  address: string | null;
  status: FulfillmentStatus;
  driver: string | null;
};
type TodayPickupRow = {
  id: string;
  salesOrderId: string;
  startAt: string;
  orderNumber: string;
  customer: string;
  status: FulfillmentStatus;
};
type TopUnpaidRow = {
  id: string;
  orderNumber: string;
  customer: string;
  total: number;
  paid: number;
  balanceDue: number;
  status: string;
};
type SpecialFollowupRow = {
  id: string;
  followupDate: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  product: string;
};

type InventoryAlertsPayload = {
  lowStockCount: number;
};

const initialMetrics: MetricData = {
  todayDeliveries: 0,
  todayPickups: 0,
  outForDelivery: 0,
  overdueOrders: 0,
  pendingFulfillment: 0,
  todayRevenue: 0,
  unpaidBalance: 0,
  totalReceivable: 0,
  lowStockCount: 0,
  specialOrdersInProgress: 0,
  delayedSpecialOrders: 0,
};

const categoryLabelMap: Record<string, string> = {
  WINDOW: "Windows",
  FLOOR: "Flooring",
  MIRROR: "Mirrors",
  DOOR: "Interior Doors",
};

const pieColors = ["#1E293B", "#334155", "#475569", "#64748B"];
const overviewKpiCards = [
  { label: "Total products", value: "128", icon: Package },
  { label: "Warehouses", value: "6", icon: Warehouse },
  { label: "This month in/out", value: "3,462", icon: TrendingUp },
];

export default function DashboardPage() {
  const { role } = useRole();
  const [mounted, setMounted] = useState(false);
  const [metrics, setMetrics] = useState<MetricData>(initialMetrics);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [pieData, setPieData] = useState<PieData[]>([]);
  const [todayDeliveries, setTodayDeliveries] = useState<TodayDeliveryRow[]>([]);
  const [todayPickups, setTodayPickups] = useState<TodayPickupRow[]>([]);
  const [topUnpaidOrders, setTopUnpaidOrders] = useState<TopUnpaidRow[]>([]);
  const [specialFollowups, setSpecialFollowups] = useState<SpecialFollowupRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [dashboardRes, alertsRes] = await Promise.all([
          fetch("/api/dashboard", {
            cache: "no-store",
            headers: { "x-user-role": role },
          }),
          fetch("/api/inventory/alerts", {
            cache: "no-store",
            headers: { "x-user-role": role },
          }),
        ]);

        const dashboardPayload = await dashboardRes.json();
        const alertsPayload = await alertsRes.json();
        if (!dashboardRes.ok) throw new Error(dashboardPayload.error ?? "Failed to load dashboard data");

        const alertsData = (alertsPayload?.data ?? {}) as InventoryAlertsPayload;
        const nextMetrics = dashboardPayload.data?.metrics ?? initialMetrics;
        setMetrics({
          ...nextMetrics,
          lowStockCount: Number(alertsData.lowStockCount ?? nextMetrics.lowStockCount ?? 0),
        });
        setTrendData(dashboardPayload.data?.trendData ?? []);
        setPieData(dashboardPayload.data?.pieData ?? []);
        setTodayDeliveries(dashboardPayload.data?.todayDeliveries ?? []);
        setTodayPickups(dashboardPayload.data?.todayPickups ?? []);
        setTopUnpaidOrders(dashboardPayload.data?.topUnpaidOrders ?? []);
        setSpecialFollowups(dashboardPayload.data?.followUpReminders ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      }
    };

    fetchDashboard();
  }, [role]);

  const chartPieData = useMemo(
    () =>
      pieData.map((item) => ({
        ...item,
        name: categoryLabelMap[item.category] ?? item.category,
      })),
    [pieData],
  );
  const hasOverdue = metrics.overdueOrders > 0;
  const statusLabel = (status: FulfillmentStatus) => {
    if (status === "SCHEDULED") return "Scheduled";
    if (status === "IN_PROGRESS") return "Out for Delivery";
    if (status === "COMPLETED") return "Delivered";
    return "Canceled";
  };
  const statusBadge = (status: FulfillmentStatus) => {
    if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
    if (status === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
    if (status === "CANCELLED") return "bg-slate-200 text-slate-600";
    return "bg-amber-100 text-amber-700";
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Control Center</h1>
        <p className="mt-2 text-sm tracking-tight text-slate-500">
          Balanced executive and operations snapshot across fulfillment, finance, and sales trends.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        {overviewKpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="linear-card flex items-center justify-between p-8">
              <div>
                <p className="text-[11px] tracking-tight text-slate-400">{card.label.toLowerCase()}</p>
                <p className="text-xl font-semibold tracking-tight text-slate-900">{card.value}</p>
              </div>
              <div className="rounded-full bg-slate-100 p-2.5">
                <Icon className="h-4 w-4 text-slate-600" />
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {hasOverdue ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-700">
          ⚠ {metrics.overdueOrders} Deliveries Overdue - Review Immediately
        </div>
      ) : null}

      {specialFollowups.length > 0 ? (
        <div className="linear-card border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-center gap-2 text-amber-800">
            <BellRing className="h-4 w-4" />
            <p className="text-sm font-semibold">Special Order Follow-up Reminders (Today)</p>
          </div>
          <div className="mt-3 space-y-2">
            {specialFollowups.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                href={`/orders/${item.orderId}`}
                className="block rounded-lg bg-white/70 px-3 py-2 text-sm text-slate-700 hover:bg-white"
              >
                <span className="font-semibold text-slate-900">{item.orderNumber}</span>
                <span className="ml-2">{item.customer}</span>
                <span className="ml-2 text-amber-800">Follow up: {item.product}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">today deliveries</p>
            <span className="rounded-full bg-slate-100 p-2">
              <Truck className="h-4 w-4 text-slate-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{metrics.todayDeliveries}</p>
        </article>

        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">pending fulfillment</p>
            <span className="rounded-full bg-slate-100 p-2">
              <Clock3 className="h-4 w-4 text-slate-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{metrics.pendingFulfillment}</p>
        </article>

        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">out for delivery</p>
            <span className="rounded-full bg-blue-50 p-2">
              <Truck className="h-4 w-4 text-blue-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{metrics.outForDelivery}</p>
        </article>

        <article className={`linear-card p-8 ${hasOverdue ? "border-rose-200 bg-rose-50/60" : ""}`}>
          <div className="flex items-start justify-between">
            <p className={`text-xs tracking-tight ${hasOverdue ? "text-rose-500" : "text-slate-400"}`}>overdue orders</p>
            <span className={`rounded-full p-2 ${hasOverdue ? "bg-rose-100" : "bg-slate-100"}`}>
              <AlertTriangle className={`h-4 w-4 ${hasOverdue ? "text-rose-600" : "text-slate-500"}`} />
            </span>
          </div>
          <p className={`mt-3 text-2xl font-semibold tracking-tight ${hasOverdue ? "text-rose-700" : "text-slate-900"}`}>
            {metrics.overdueOrders}
          </p>
          {hasOverdue ? (
            <p className="mt-2 inline-flex rounded-lg bg-rose-100 px-2 py-1 text-xs font-medium text-rose-800">
              Warning
            </p>
          ) : null}
        </article>

        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">low stock alerts</p>
            <span className="rounded-full bg-amber-50 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{metrics.lowStockCount}</p>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">special orders in progress</p>
            <span className="rounded-full bg-slate-100 p-2">
              <Clock3 className="h-4 w-4 text-slate-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {metrics.specialOrdersInProgress}
          </p>
        </article>

        <article className={`linear-card p-8 ${metrics.delayedSpecialOrders > 0 ? "border-rose-200 bg-rose-50/60" : ""}`}>
          <div className="flex items-start justify-between">
            <p className={`text-xs tracking-tight ${metrics.delayedSpecialOrders > 0 ? "text-rose-500" : "text-slate-400"}`}>
              delayed special orders
            </p>
            <span className={`rounded-full p-2 ${metrics.delayedSpecialOrders > 0 ? "bg-rose-100" : "bg-slate-100"}`}>
              <AlertTriangle className={`h-4 w-4 ${metrics.delayedSpecialOrders > 0 ? "text-rose-600" : "text-slate-500"}`} />
            </span>
          </div>
          <p className={`mt-3 text-2xl font-semibold tracking-tight ${metrics.delayedSpecialOrders > 0 ? "text-rose-700" : "text-slate-900"}`}>
            {metrics.delayedSpecialOrders}
          </p>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">today revenue</p>
            <span className="rounded-full bg-slate-100 p-2">
              <DollarSign className="h-4 w-4 text-slate-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            ${metrics.todayRevenue.toFixed(2)}
          </p>
        </article>

        <Link href="/reconciliation" className="linear-card p-8 transition hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">unpaid balance</p>
            <span className="rounded-full bg-slate-100 p-2">
              <Wallet className="h-4 w-4 text-slate-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            ${metrics.unpaidBalance.toFixed(2)}
          </p>
          <p className="mt-2 text-xs text-slate-500">Open statement page</p>
        </Link>

        <article className="linear-card p-8">
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-tight text-slate-400">total receivable</p>
            <span className="rounded-full bg-slate-100 p-2">
              <Wallet className="h-4 w-4 text-slate-500" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            ${metrics.totalReceivable.toFixed(2)}
          </p>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="linear-card p-8 xl:col-span-2">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Today Activity</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Today Deliveries</h3>
              <div className="mt-3 space-y-2">
                {todayDeliveries.length === 0 ? (
                  <p className="text-sm text-slate-500">No deliveries scheduled for today.</p>
                ) : (
                  todayDeliveries.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{item.orderNumber}</span>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.customer} ·{" "}
                        {new Date(item.startAt).toLocaleTimeString("en-US", {
                          timeZone: "UTC",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {todayPickups.length > 0 ? (
              <div className="rounded-xl border border-slate-100 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Today Pickups</h3>
                <div className="mt-3 space-y-2">
                  {todayPickups.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{item.orderNumber}</span>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.customer} ·{" "}
                        {new Date(item.startAt).toLocaleTimeString("en-US", {
                          timeZone: "UTC",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Today Pickups</h3>
                <p className="mt-3 text-sm text-slate-500">No pickup records for today.</p>
              </div>
            )}
          </div>
        </article>

        <article className="linear-card p-8">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Top 5 Unpaid Orders</h2>
          <div className="mt-3 space-y-2">
            {topUnpaidOrders.length === 0 ? (
              <p className="text-sm text-slate-500">No unpaid orders.</p>
            ) : (
              topUnpaidOrders.map((item) => (
                <Link
                  key={item.id}
                  href={`/orders/${item.id}`}
                  className="block rounded-lg bg-slate-50 px-3 py-2 text-sm transition hover:bg-slate-100"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{item.orderNumber}</span>
                    <span className="text-rose-600">${item.balanceDue.toFixed(2)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{item.customer}</p>
                </Link>
              ))
            )}
          </div>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="linear-card p-8 xl:col-span-2">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Sales trend over last 7 days</h2>
          <p className="mt-1 text-sm text-slate-500">Based on total order value to assess short-term trends.</p>
          <div className="mt-4 h-[300px] w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E293B" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1E293B" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E2E8F0",
                      background: "#FFFFFF",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
                    }}
                    formatter={(value: number | string | undefined) => [
                      `$${Number(value ?? 0).toFixed(2)}`,
                      "Sales",
                    ]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#1E293B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#salesGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-lg bg-slate-50" />
            )}
          </div>
        </article>

        <article className="linear-card p-8">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Sales Share by Category</h2>
          <p className="mt-1 text-sm text-slate-500">Share of total sales from windows, flooring, mirrors, and interior doors.</p>

          <div className="mt-4 h-[240px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                <PieChart>
                  <Pie
                    data={chartPieData}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={48}
                    paddingAngle={3}
                  >
                    {chartPieData.map((entry, index) => (
                      <Cell key={entry.category} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #E2E8F0",
                      background: "#FFFFFF",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
                    }}
                    formatter={(value: number | string | undefined) => [
                      `$${Number(value ?? 0).toFixed(2)}`,
                      "Sales",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-lg bg-slate-50" />
            )}
          </div>

          <div className="mt-1 space-y-2">
            {chartPieData.map((item, index) => (
              <div key={item.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: pieColors[index % pieColors.length] }}
                  />
                  <span>{item.name}</span>
                </div>
                <span className="font-medium text-slate-800">{item.percent}%</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
