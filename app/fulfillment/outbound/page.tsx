"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OutboundRow = {
  id: string;
  type: "DELIVERY" | "PICKUP";
  status: string;
  scheduledAt: string | null;
  timeWindow?: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
  itemCount?: number;
  itemsCompleted?: number;
  itemsAnyFulfilled?: boolean;
  itemsAllCompleted?: boolean;
};

const statusLabel = (status: string) => {
  const key = status.toUpperCase();
  if (key === "OUT_FOR_DELIVERY") return "Out for Delivery";
  if (key === "PICKED_UP") return "Picked Up";
  if (key === "DELIVERED") return "Delivered";
  if (key === "CANCELLED") return "Cancelled";
  return key.replaceAll("_", " ");
};

const statusBadge = (status: string) => {
  const key = status.toUpperCase();
  if (key === "COMPLETED" || key === "DELIVERED" || key === "PICKED_UP") return "bg-emerald-100 text-emerald-700";
  if (key === "OUT_FOR_DELIVERY" || key === "OUT" || key === "IN_PROGRESS") return "bg-sky-100 text-sky-700";
  if (key === "READY") return "bg-cyan-100 text-cyan-700";
  if (key === "PACKING") return "bg-violet-100 text-violet-700";
  if (key === "PARTIAL") return "bg-amber-100 text-amber-700";
  if (key === "CANCELLED") return "bg-slate-200 text-slate-600";
  return "bg-slate-100 text-slate-700";
};

export default function FulfillmentOutboundPage() {
  const { role } = useRole();
  const router = useRouter();
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const res = await fetch("/api/fulfillments/outbound", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load outbound queue");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load outbound queue");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const setStatus = async (row: OutboundRow, status: "ready" | "out_for_delivery" | "picked_up" | "delivered") => {
    try {
      setBusyId(row.id);
      setError(null);
      const endpoint =
        status === "ready" ? `/api/fulfillments/${row.id}` : `/api/fulfillments/${row.id}/status`;
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update status");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-6">
      <header className="glass-card p-8">
        <div className="glass-card-content">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Fulfillment Queue</h1>
          <p className="mt-2 text-sm text-slate-400">All non-completed and non-cancelled fulfillment tasks.</p>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">Scheduled</TableHead>
              <TableHead className="text-slate-400">SO #</TableHead>
              <TableHead className="text-slate-400">Customer</TableHead>
              <TableHead className="text-slate-400">Type</TableHead>
              <TableHead className="text-slate-400">Items</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Address</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={8} className="text-center text-slate-400">
                  No active fulfillments in outbound queue.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]"
                  onClick={(e) => {
                    const target = e.target as HTMLElement | null;
                    if (target?.closest("a,button,input,textarea,select")) return;
                    router.push(`/fulfillment/${row.id}`);
                  }}
                >
                  <TableCell>
                    {row.scheduledAt ? (
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold text-white">
                          {new Date(row.scheduledAt).toLocaleDateString("en-US", {
                            timeZone: "UTC",
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.timeWindow
                            ? row.timeWindow
                            : new Date(row.scheduledAt).toLocaleTimeString("en-US", {
                                timeZone: "UTC",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                        </div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-white">{row.salesOrderNumber}</TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell>{row.type === "DELIVERY" ? "Delivery" : "Pickup"}</TableCell>
                  <TableCell>
                    {typeof row.itemCount === "number" ? (
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{row.itemCount}</span>
                          {row.itemsAnyFulfilled && !row.itemsAllCompleted ? (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                              Partial
                            </span>
                          ) : null}
                        </div>
                        {typeof row.itemsCompleted === "number" && row.itemCount > 0 ? (
                          <div className="text-slate-400">
                            {row.itemsCompleted}/{row.itemCount} complete ·{" "}
                            {Math.round((row.itemsCompleted / Math.max(row.itemCount, 1)) * 100)}%
                          </div>
                        ) : (
                          <div className="text-slate-400">-</div>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell>{row.type === "DELIVERY" ? row.address : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <a
                        href={`/api/fulfillments/${row.id}/pdf?type=pick`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ios-secondary-btn h-8 px-2 text-xs"
                      >
                        Pick List
                      </a>
                      <a
                        href={`/api/fulfillments/${row.id}/pdf?type=slip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ios-secondary-btn h-8 px-2 text-xs"
                      >
                        {row.type === "DELIVERY" ? "Delivery Slip" : "Pickup Slip"}
                      </a>
                      <Link href={`/sales-orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        SO
                      </Link>
                      {row.status.toUpperCase() !== "READY" && row.status.toUpperCase() !== "OUT_FOR_DELIVERY" ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setStatus(row, "ready")}
                          className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                        >
                          Mark Ready
                        </button>
                      ) : null}

                      {row.type === "DELIVERY" ? (
                        <>
                          {row.status.toUpperCase() === "READY" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => setStatus(row, "out_for_delivery")}
                              className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                            >
                              Mark Out
                            </button>
                          ) : null}
                          {row.status.toUpperCase() === "OUT_FOR_DELIVERY" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => setStatus(row, "delivered")}
                              className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                            >
                              Mark Delivered
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {row.status.toUpperCase() === "READY" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => setStatus(row, "picked_up")}
                              className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                            >
                              Mark Picked Up
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </section>
  );
}
