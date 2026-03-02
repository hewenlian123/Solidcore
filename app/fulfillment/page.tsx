"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FulfillmentStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type FulfillmentRow = {
  id: string;
  salesOrderId: string;
  startAt: string;
  orderNumber: string;
  customer: string;
  address: string | null;
  status: FulfillmentStatus;
  driver?: string | null;
};

type PickupRow = {
  id: string;
  salesOrderId: string;
  startAt: string;
  orderNumber: string;
  customer: string;
  status: FulfillmentStatus;
};

type DashboardPayload = {
  kpis: {
    todayDeliveries: number;
    todayPickups: number;
    outForDelivery: number;
    overdueDeliveries: number;
    pendingFulfillment: number;
  };
  todayDeliveries: FulfillmentRow[];
  todayPickups: PickupRow[];
  overdueDeliveries: FulfillmentRow[];
};

function statusBadge(status: FulfillmentStatus) {
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (status === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  if (status === "CANCELLED") return "bg-slate-200 text-slate-600";
  return "bg-amber-100 text-amber-700";
}

function statusLabel(status: FulfillmentStatus) {
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "IN_PROGRESS") return "Out for Delivery";
  if (status === "COMPLETED") return "Delivered";
  return "Canceled";
}

export default function FulfillmentDashboardPage() {
  const { role } = useRole();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/fulfillment/dashboard", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load fulfillment dashboard");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fulfillment dashboard");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const kpis = useMemo(
    () =>
      data?.kpis ?? {
        todayDeliveries: 0,
        todayPickups: 0,
        outForDelivery: 0,
        overdueDeliveries: 0,
        pendingFulfillment: 0,
      },
    [data],
  );

  const updateFulfillmentStatus = async (
    salesOrderId: string,
    fulfillmentId: string,
    status: "READY" | "COMPLETED",
  ) => {
    try {
      setBusyId(fulfillmentId);
      setError(null);
      const res = await fetch(`/api/sales-orders/${salesOrderId}/fulfillments/${fulfillmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update fulfillment");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fulfillment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fulfillment Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">Operational snapshot for today deliveries, pickups, and overdue tasks.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="linear-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today Deliveries</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{kpis.todayDeliveries}</p>
        </article>
        <article className="linear-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today Pickups</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{kpis.todayPickups}</p>
        </article>
        <article className="linear-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Out For Delivery</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{kpis.outForDelivery}</p>
        </article>
        <article className="linear-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue Deliveries</p>
          <p className="mt-2 text-3xl font-semibold text-rose-600">{kpis.overdueDeliveries}</p>
        </article>
        <article className="linear-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Fulfillment</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{kpis.pendingFulfillment}</p>
        </article>
      </div>

      {data && data.overdueDeliveries.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-base font-semibold text-rose-700">Overdue Deliveries Alert</h2>
          <ul className="mt-2 space-y-1 text-sm text-rose-700">
            {data.overdueDeliveries.map((item) => (
              <li key={item.id}>
                {item.orderNumber} · {item.customer} ·{" "}
                {new Date(item.startAt).toLocaleString("en-US", { timeZone: "UTC" })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Today Deliveries</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Time</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Quick Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.todayDeliveries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500">
                  No deliveries scheduled for today.
                </TableCell>
              </TableRow>
            ) : (
              data.todayDeliveries.map((row) => (
                <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                  <TableCell>
                    {new Date(row.startAt).toLocaleTimeString("en-US", {
                      timeZone: "UTC",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900">{row.orderNumber}</TableCell>
                  <TableCell>{row.customer}</TableCell>
                  <TableCell>{row.address || "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell>{row.driver || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Order
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === row.id || row.status === "IN_PROGRESS" || row.status === "COMPLETED"}
                        onClick={() => updateFulfillmentStatus(row.salesOrderId, row.id, "READY")}
                        className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                      >
                        Mark Out
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id || row.status === "COMPLETED" || row.status === "CANCELLED"}
                        onClick={() => updateFulfillmentStatus(row.salesOrderId, row.id, "COMPLETED")}
                        className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                      >
                        Mark Delivered
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data ? (
        <div className="linear-card overflow-hidden p-0">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Today Pickups</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead>Time</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.todayPickups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500">
                    No pickups scheduled for today.
                  </TableCell>
                </TableRow>
              ) : (
                data.todayPickups.map((row) => (
                  <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                    <TableCell>
                      {new Date(row.startAt).toLocaleTimeString("en-US", {
                        timeZone: "UTC",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">{row.orderNumber}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Order
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}

