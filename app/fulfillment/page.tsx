"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FulfillmentStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PACKING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "OUT"
  | "PARTIAL"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

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
  timeWindow?: string | null;
  pickupContact?: string | null;
  phone?: string | null;
  notes?: string | null;
};

type OutboundRow = {
  id: string;
  type: "DELIVERY" | "PICKUP";
  status: string;
  scheduledAt: string | null;
  timeWindow: string | null;
  pickupContact?: string | null;
  phone?: string | null;
  notes?: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
  itemCount: number;
  itemsCompleted: number;
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
  if (status === "OUT_FOR_DELIVERY" || status === "OUT" || status === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  if (status === "DELIVERED" || status === "PICKED_UP") return "bg-emerald-100 text-emerald-700";
  if (status === "READY") return "bg-cyan-100 text-cyan-700";
  if (status === "PACKING") return "bg-violet-100 text-violet-700";
  if (status === "PARTIAL") return "bg-amber-100 text-amber-700";
  if (status === "CANCELLED") return "bg-slate-200 text-slate-600";
  return "bg-amber-100 text-amber-700";
}

function statusLabel(status: FulfillmentStatus) {
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "DRAFT") return "Draft";
  if (status === "PACKING") return "Packing";
  if (status === "READY") return "Ready";
  if (status === "OUT_FOR_DELIVERY" || status === "OUT" || status === "IN_PROGRESS") return "Out for Delivery";
  if (status === "DELIVERED") return "Delivered";
  if (status === "PICKED_UP") return "Picked Up";
  if (status === "PARTIAL") return "Partial";
  if (status === "COMPLETED") return "Delivered";
  return "Canceled";
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function endOfTodayUtc() {
  const start = startOfTodayUtc();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export default function FulfillmentDashboardPage() {
  const { role } = useRole();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [outbound, setOutbound] = useState<OutboundRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const [dashRes, outboundRes] = await Promise.all([
        fetch("/api/fulfillment/dashboard", { cache: "no-store", headers: { "x-user-role": role } }),
        fetch("/api/fulfillments/outbound", { cache: "no-store", headers: { "x-user-role": role } }),
      ]);

      const dashPayload = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashPayload.error ?? "Failed to load pickup dashboard");
      setData(dashPayload.data);

      const outboundPayload = await outboundRes.json();
      if (!outboundRes.ok) throw new Error(outboundPayload.error ?? "Failed to load outbound queue");
      setOutbound((outboundPayload.data ?? []) as OutboundRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pickup queue");
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

  const outboundById = useMemo(() => new Map(outbound.map((row) => [row.id, row])), [outbound]);

  const updateFulfillmentStatus = async (
    fulfillmentId: string,
    status: "out_for_delivery" | "delivered" | "picked_up" | "completed",
  ) => {
    try {
      setBusyId(fulfillmentId);
      setError(null);
      const res = await fetch(`/api/fulfillments/${fulfillmentId}/status`, {
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

  const setReady = async (fulfillmentId: string) => {
    try {
      setBusyId(fulfillmentId);
      setError(null);
      const res = await fetch(`/api/fulfillments/${fulfillmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status: "ready" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to mark ready");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark ready");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-8">
      <header className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Pickup Queue</h1>
            <p className="mt-2 text-sm text-slate-400">Operational pickup workflow using existing fulfillments and items.</p>
          </div>
          <Link href="/fulfillment/outbound" className="ios-secondary-btn h-10 px-3 text-sm">
            Fulfillment Queue
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="glass-card p-5">
          <div className="glass-card-content">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today Pickup</p>
            <p className="mt-2 text-3xl font-semibold text-white">{kpis.todayPickups}</p>
          </div>
        </article>
        <article className="glass-card p-5">
          <div className="glass-card-content">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ready for Pickup</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {outbound.filter((row) => row.type === "PICKUP" && String(row.status).toUpperCase() === "READY").length}
            </p>
          </div>
        </article>
        <article className="glass-card p-5">
          <div className="glass-card-content">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Upcoming Pickup</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {outbound.filter((row) => {
                if (row.type !== "PICKUP") return false;
                if (!row.scheduledAt) return false;
                return new Date(row.scheduledAt).getTime() >= endOfTodayUtc().getTime();
              }).length}
            </p>
          </div>
        </article>
        <article className="glass-card p-5">
          <div className="glass-card-content">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Picked Up</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {(data?.todayPickups ?? []).filter((row) => row.status === "PICKED_UP").length}
            </p>
          </div>
        </article>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-base font-semibold text-white">Today Pickup</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">Time</TableHead>
                <TableHead className="text-slate-400">Window</TableHead>
                <TableHead className="text-slate-400">Order #</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Contact</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Notes</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data || data.todayPickups.filter((row) => row.status !== "PICKED_UP").length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={9} className="text-center text-slate-400">
                    No pending pickups scheduled for today.
                  </TableCell>
                </TableRow>
              ) : (
                data.todayPickups
                  .filter((row) => row.status !== "PICKED_UP")
                  .map((row) => (
                    // Prefer operational info from outbound API when present.
                    // Dashboard payload may omit some fields depending on older deployments.
                    (() => {
                      const outboundRow = outboundById.get(row.id);
                      const windowText = row.timeWindow ?? outboundRow?.timeWindow ?? "-";
                      const contactText = row.pickupContact ?? outboundRow?.pickupContact ?? "-";
                      const phoneText = row.phone ?? outboundRow?.phone ?? "-";
                      const noteText = row.notes ?? outboundRow?.notes ?? "-";
                      return (
                    <TableRow key={row.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                      <TableCell>
                        {new Date(row.startAt).toLocaleTimeString("en-US", {
                          timeZone: "UTC",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-slate-300">{windowText}</TableCell>
                      <TableCell className="font-semibold text-white">{row.orderNumber}</TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell className="text-slate-300">{contactText}</TableCell>
                      <TableCell className="text-slate-300">{phoneText}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-slate-300">{noteText || "-"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={`/api/fulfillments/${row.id}/pdf?type=slip&download=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ios-secondary-btn h-8 px-2 text-xs"
                          >
                            Print Slip
                          </a>
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                            View
                          </Link>
                          {row.status !== "READY" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => setReady(row.id)}
                              className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                            >
                              Mark Ready
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => updateFulfillmentStatus(row.id, "picked_up")}
                              className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                            >
                              Mark Picked Up
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                      );
                    })()
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-base font-semibold text-white">Upcoming Pickup</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">Scheduled</TableHead>
                <TableHead className="text-slate-400">Window</TableHead>
                <TableHead className="text-slate-400">SO #</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Contact</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Notes</TableHead>
                <TableHead className="text-slate-400">Items</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbound.filter((row) => {
                if (row.type !== "PICKUP") return false;
                if (!row.scheduledAt) return false;
                return new Date(row.scheduledAt).getTime() >= endOfTodayUtc().getTime();
              }).length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={10} className="text-center text-slate-400">
                    No upcoming pickups scheduled.
                  </TableCell>
                </TableRow>
              ) : (
                outbound
                  .filter((row) => {
                    if (row.type !== "PICKUP") return false;
                    if (!row.scheduledAt) return false;
                    return new Date(row.scheduledAt).getTime() >= endOfTodayUtc().getTime();
                  })
                  .map((row) => (
                    <TableRow key={row.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                      <TableCell>
                        {row.scheduledAt
                          ? new Date(row.scheduledAt).toLocaleString("en-US", {
                              timeZone: "UTC",
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-slate-300">{row.timeWindow || "-"}</TableCell>
                      <TableCell className="font-semibold text-white">{row.salesOrderNumber}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell className="text-slate-300">{row.pickupContact || "-"}</TableCell>
                      <TableCell className="text-slate-300">{row.phone || "-"}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-slate-300">{row.notes || "-"}</TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {row.itemCount} <span className="text-slate-400">({row.itemsCompleted}/{row.itemCount})</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(String(row.status).toUpperCase() as FulfillmentStatus)}`}>
                          {String(row.status).replaceAll("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={`/api/fulfillments/${row.id}/pdf?type=slip&download=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ios-secondary-btn h-8 px-2 text-xs"
                          >
                            Print Slip
                          </a>
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                            View
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-base font-semibold text-white">Ready for Pickup</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">Scheduled</TableHead>
                <TableHead className="text-slate-400">Window</TableHead>
                <TableHead className="text-slate-400">SO #</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Contact</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Notes</TableHead>
                <TableHead className="text-slate-400">Items</TableHead>
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbound.filter((row) => row.type === "PICKUP" && String(row.status).toUpperCase() === "READY").length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={9} className="text-center text-slate-400">
                    No pickups currently ready.
                  </TableCell>
                </TableRow>
              ) : (
                outbound
                  .filter((row) => row.type === "PICKUP" && String(row.status).toUpperCase() === "READY")
                  .map((row) => (
                    <TableRow key={row.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                      <TableCell>
                        {row.scheduledAt
                          ? new Date(row.scheduledAt).toLocaleString("en-US", {
                              timeZone: "UTC",
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-slate-300">{row.timeWindow || "-"}</TableCell>
                      <TableCell className="font-semibold text-white">{row.salesOrderNumber}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell className="text-slate-300">{row.pickupContact || "-"}</TableCell>
                      <TableCell className="text-slate-300">{row.phone || "-"}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-slate-300">{row.notes || "-"}</TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {row.itemCount} <span className="text-slate-400">({row.itemsCompleted}/{row.itemCount})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={`/api/fulfillments/${row.id}/pdf?type=slip&download=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ios-secondary-btn h-8 px-2 text-xs"
                          >
                            Print Slip
                          </a>
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                            View
                          </Link>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => updateFulfillmentStatus(row.id, "picked_up")}
                            className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                          >
                            Mark Picked Up
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-base font-semibold text-white">Picked Up</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">Time</TableHead>
                <TableHead className="text-slate-400">Window</TableHead>
                <TableHead className="text-slate-400">Order #</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Contact</TableHead>
                <TableHead className="text-slate-400">Phone</TableHead>
                <TableHead className="text-slate-400">Notes</TableHead>
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data || data.todayPickups.filter((row) => row.status === "PICKED_UP").length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={8} className="text-center text-slate-400">
                    No pickups marked picked up today.
                  </TableCell>
                </TableRow>
              ) : (
                data.todayPickups
                  .filter((row) => row.status === "PICKED_UP")
                  .map((row) => (
                    (() => {
                      const outboundRow = outboundById.get(row.id);
                      const windowText = row.timeWindow ?? outboundRow?.timeWindow ?? "-";
                      const contactText = row.pickupContact ?? outboundRow?.pickupContact ?? "-";
                      const phoneText = row.phone ?? outboundRow?.phone ?? "-";
                      const noteText = row.notes ?? outboundRow?.notes ?? "-";
                      return (
                    <TableRow key={row.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                      <TableCell>
                        {new Date(row.startAt).toLocaleTimeString("en-US", {
                          timeZone: "UTC",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-slate-300">{windowText}</TableCell>
                      <TableCell className="font-semibold text-white">{row.orderNumber}</TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell className="text-slate-300">{contactText}</TableCell>
                      <TableCell className="text-slate-300">{phoneText}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-slate-300">{noteText || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={`/api/fulfillments/${row.id}/pdf?type=slip&download=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ios-secondary-btn h-8 px-2 text-xs"
                          >
                            Print Slip
                          </a>
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                            View
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                      );
                    })()
                  ))
              )}
            </TableBody>
          </Table>
          <p className="px-6 pb-5 pt-3 text-xs text-slate-400">
            Picked Up list is based on today’s pickup schedules (UTC).
          </p>
        </div>
      </div>
    </section>
  );
}

