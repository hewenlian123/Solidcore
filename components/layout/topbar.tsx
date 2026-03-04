"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Role } from "@/lib/rbac";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type TopBarProps = {
  onOpenSidebar: () => void;
};

type AlertPayload = {
  lowStockCount: number;
  lowStockTop: Array<{
    id: string;
    sku: string;
    productName: string;
    available: number;
    reorderLevel: number;
    productId: string;
  }>;
  overdueDeliveriesCount: number;
  specialOrdersFollowupCount: number;
};

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const { role, userName, setRole } = useRole();
  const [alerts, setAlerts] = useState<AlertPayload>({
    lowStockCount: 0,
    lowStockTop: [],
    overdueDeliveriesCount: 0,
    specialOrdersFollowupCount: 0,
  });

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/inventory/alerts", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) return;
        setAlerts(
          payload.data ?? {
            lowStockCount: 0,
            lowStockTop: [],
            overdueDeliveriesCount: 0,
            specialOrdersFollowupCount: 0,
          },
        );
      } catch {
        // Keep topbar resilient even if alerts endpoint fails.
      }
    };
    run();
  }, [role]);

  const totalAlertCount = useMemo(
    () => alerts.lowStockCount + alerts.overdueDeliveriesCount + alerts.specialOrdersFollowupCount,
    [alerts],
  );

  return (
    <header className="glass-bar sticky top-0 z-20">
      <div className="flex h-16 items-center justify-between gap-4 px-6 md:px-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full p-2 text-slate-500 hover:bg-[rgba(15,23,42,0.04)] md:hidden"
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-semibold tracking-tight text-slate-700 md:text-base">overview</h1>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-9 rounded-full border bg-white px-3 text-xs text-slate-600 outline-none transition focus:ring-2 focus:ring-slate-300/60"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="SALES">SALES</option>
            <option value="WAREHOUSE">WAREHOUSE</option>
          </select>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative rounded-full p-2 text-slate-500 hover:bg-[rgba(15,23,42,0.04)]"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {alerts.lowStockCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-600" />
                ) : null}
                {totalAlertCount > 0 ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">
                    {totalAlertCount}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[360px] border bg-white backdrop-blur-sm"
              style={{ borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
            >
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Link href="/products?lowStockOnly=true" className="rounded-lg bg-slate-50 px-2 py-1 text-center text-slate-700 hover:bg-slate-100">
                    Low Stock
                    <div className="mt-0.5 font-semibold">{alerts.lowStockCount}</div>
                  </Link>
                  <Link href="/fulfillment" className="rounded-lg bg-slate-50 px-2 py-1 text-center text-slate-700 hover:bg-slate-100">
                    Overdue
                    <div className="mt-0.5 font-semibold">{alerts.overdueDeliveriesCount}</div>
                  </Link>
                  <Link href="/dashboard" className="rounded-lg bg-slate-50 px-2 py-1 text-center text-slate-700 hover:bg-slate-100">
                    Follow-up
                    <div className="mt-0.5 font-semibold">{alerts.specialOrdersFollowupCount}</div>
                  </Link>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {alerts.lowStockTop.length === 0 ? (
                    <p className="text-xs text-slate-500">No low-stock variant alerts.</p>
                  ) : (
                    alerts.lowStockTop.map((item) => (
                      <Link
                        key={item.id}
                        href="/products?lowStockOnly=true"
                        className="block rounded-lg bg-rose-50/70 px-3 py-2 text-xs text-slate-700 hover:bg-rose-100/70"
                      >
                        <p className="font-semibold text-slate-900">{item.productName}</p>
                        <p className="mt-0.5">
                          SKU {item.sku} · Available {item.available} / Reorder {item.reorderLevel}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className="ios-secondary-btn h-9 rounded-full px-3 text-xs"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            {userName ? `${userName} · Sign out` : "Sign out"}
          </button>
        </div>
      </div>

    </header>
  );
}
