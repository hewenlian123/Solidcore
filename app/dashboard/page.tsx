"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/layout/role-provider";
import { CustomersMiniCard } from "@/components/dashboard/CustomersMiniCard";
import { kpiItems, customersOverview, recentOrders, salesByRegion, salesTrend, topProducts } from "@/components/dashboard/dashboardMock";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RecentOrdersTable } from "@/components/dashboard/RecentOrdersTable";
import { SalesByRegionCard } from "@/components/dashboard/SalesByRegionCard";
import { SalesTrendCard } from "@/components/dashboard/SalesTrendCard";
import { TopProductsCard } from "@/components/dashboard/TopProductsCard";
import type { KpiItem, RecentOrderRow, SalesTrendPoint, TopProductRow } from "@/components/dashboard/dashboardMock";

const kpiContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const kpiItemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

type DashboardApiPayload = {
  data?: {
    metrics?: {
      todayRevenue?: number;
      todayOrderCount?: number;
      totalReceivable?: number;
      lowStockCount?: number;
    };
    trendData?: Array<{ date: string; amount: number; orders?: number }>;
    topProducts?: Array<{ id: string; name: string; sku: string; sales: number; revenue: number; trend: string }>;
    recentOrders?: Array<{ id: string; customer: string; date: string; total: number; status: "Paid" | "Pending" | "Shipped" | "Overdue"; payment: "Credit Card" | "PayPal" | "Bank Transfer" | "Stripe" }>;
  };
};

export default function DashboardPage() {
  const reduced = useReducedMotion();
  const { role } = useRole();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", role],
    queryFn: async () => {
      const res = await fetch("/api/dashboard", {
        headers: { "x-user-role": role },
      });
      const payload = (await res.json()) as DashboardApiPayload;
      if (!res.ok) throw new Error("Failed to load dashboard data");
      return payload.data;
    },
  });

  const metrics = dashboardQuery.data?.metrics;
  const dashboardKpis: KpiItem[] =
    metrics == null
      ? kpiItems
      : [
          {
            title: "Today Sales",
            value: `$${Number(metrics.todayRevenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            delta: kpiItems[0].delta,
            positive: kpiItems[0].positive,
            accent: "blue",
            sparkline: kpiItems[0].sparkline,
          },
          {
            title: "Orders Today",
            value: String(metrics.todayOrderCount ?? 0),
            delta: kpiItems[1].delta,
            positive: kpiItems[1].positive,
            accent: "orange",
            sparkline: kpiItems[1].sparkline,
          },
          {
            title: "Payments Collected",
            value: `$${Number(metrics.todayRevenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            delta: kpiItems[2].delta,
            positive: kpiItems[2].positive,
            accent: "green",
            progress: kpiItems[2].progress,
            sparkline: kpiItems[2].sparkline,
          },
          {
            title: "Inventory Value",
            value: `$${Number(metrics.totalReceivable ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            delta: kpiItems[3].delta,
            positive: kpiItems[3].positive,
            accent: "amber",
            progress: kpiItems[3].progress,
            sparkline: kpiItems[3].sparkline,
            warning: `${metrics.lowStockCount ?? 0} low-stock items`,
          },
        ];

  const dashboardTrend: SalesTrendPoint[] =
    dashboardQuery.data?.trendData?.map((point) => ({
      day: new Date(point.date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      revenue: Number(point.amount ?? 0),
      orders: Number(point.orders ?? 0),
    })) ?? salesTrend;

  const dashboardTopProducts: TopProductRow[] =
    dashboardQuery.data?.topProducts?.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      sales: Number(item.sales),
      revenue: Number(item.revenue),
      trend: item.trend,
    })) ?? topProducts;

  const dashboardRecentOrders: RecentOrderRow[] =
    dashboardQuery.data?.recentOrders?.map((row) => ({
      id: row.id,
      customer: row.customer,
      date: row.date,
      total: `$${Number(row.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      status: row.status,
      payment: row.payment,
    })) ?? recentOrders;

  const sectionReveal = {
    initial: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <section className="space-y-6">
      <motion.div
        variants={kpiContainerVariants}
        initial={reduced ? false : "hidden"}
        animate="show"
        transition={{ staggerChildren: reduced ? 0 : 0.08 }}
        className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-4"
      >
        {dashboardKpis.map((item) => (
          <motion.div
            key={item.title}
            variants={kpiItemVariants}
            whileHover={reduced ? undefined : { y: -3, scale: 1.01 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <KpiCard item={item} />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={sectionReveal.initial}
        animate={sectionReveal.animate}
        transition={{ duration: reduced ? 0.12 : 0.48, delay: reduced ? 0 : 0.16, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 2xl:grid-cols-12"
      >
        <div className="2xl:col-span-8">
          <SalesTrendCard data={dashboardTrend} />
        </div>
        <div className="2xl:col-span-4">
          <TopProductsCard rows={dashboardTopProducts} />
        </div>
      </motion.div>

      <motion.div
        initial={sectionReveal.initial}
        animate={sectionReveal.animate}
        transition={{ duration: reduced ? 0.12 : 0.52, delay: reduced ? 0 : 0.26, ease: "easeOut" }}
        className="grid grid-cols-1 gap-6 2xl:grid-cols-12"
      >
        <div className="2xl:col-span-8">
          <RecentOrdersTable rows={dashboardRecentOrders} />
        </div>
        <div className="space-y-6 2xl:col-span-4">
          <SalesByRegionCard rows={salesByRegion} />
          <CustomersMiniCard
            newCustomers={customersOverview.newCustomers}
            returningCustomers={customersOverview.returningCustomers}
          />
        </div>
      </motion.div>
    </section>
  );
}
