"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DeliveryRow = {
  id: string;
  salesOrderId: string;
  startAt: string;
  orderNumber: string;
  customer: string;
  address: string | null;
  status: string;
  driver: string | null;
  timeWindow?: string | null;
  notes?: string | null;
  shiptoNotes?: string | null;
};

type Payload = {
  todayDeliveries: DeliveryRow[];
};

export default function DeliverySchedulePage() {
  const { role } = useRole();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const res = await fetch(`/api/fulfillment/dashboard?date=${selectedDate}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load delivery schedule.");
        setRows((payload.data as Payload).todayDeliveries ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load delivery schedule.");
      }
    };
    void load();
  }, [role, selectedDate]);

  const updateStatus = async (id: string, status: "out_for_delivery" | "delivered") => {
    try {
      setBusyId(id);
      setError(null);
      const res = await fetch(`/api/fulfillments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update status");
      const next = await fetch(`/api/fulfillment/dashboard?date=${selectedDate}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const nextPayload = await next.json();
      if (!next.ok) throw new Error(nextPayload.error ?? "Failed to reload schedule.");
      setRows((nextPayload.data as Payload).todayDeliveries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update delivery status.");
    } finally {
      setBusyId(null);
    }
  };

  const titleDate = useMemo(
    () => new Date(`${selectedDate}T00:00:00.000Z`).toLocaleDateString("en-US", { timeZone: "UTC" }),
    [selectedDate],
  );

  const statusBadge = (status: string) => {
    const key = String(status ?? "").toUpperCase();
    if (key === "COMPLETED" || key === "DELIVERED" || key === "PICKED_UP") return "bg-emerald-100 text-emerald-700";
    if (key === "OUT_FOR_DELIVERY" || key === "OUT" || key === "IN_PROGRESS") return "bg-sky-100 text-sky-700";
    if (key === "READY") return "bg-cyan-100 text-cyan-700";
    if (key === "PACKING") return "bg-violet-100 text-violet-700";
    if (key === "PARTIAL") return "bg-amber-100 text-amber-700";
    if (key === "CANCELLED") return "bg-slate-200 text-slate-600";
    return "bg-slate-100 text-slate-700";
  };

  const statusLabel = (status: string) => String(status ?? "").toUpperCase().replaceAll("_", " ");

  return (
    <section className="space-y-6">
      <header className="glass-card p-8">
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 backdrop-blur-xl">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Delivery Schedule</h1>
            <p className="mt-1 text-sm text-slate-400">
              Delivery list by day, backed by fulfillment schedules.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="linear-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Showing deliveries scheduled for {titleDate}</p>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="ios-input h-10 w-[180px] px-3 text-sm"
          />
        </div>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
              <TableHead>Time</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-500">
                  No delivery schedules for this date.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/10">
                  <TableCell>
                    {new Date(row.startAt).toLocaleTimeString("en-US", {
                      timeZone: "UTC",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-slate-300">{row.timeWindow || "-"}</TableCell>
                  <TableCell className="font-semibold text-white">{row.orderNumber}</TableCell>
                  <TableCell className="text-slate-300">{row.customer}</TableCell>
                  <TableCell>{row.address || "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell>{row.driver || "-"}</TableCell>
                  <TableCell className="max-w-[260px] text-slate-300">
                    <div className="space-y-0.5 text-xs">
                      <div className="truncate">{row.shiptoNotes || "-"}</div>
                      {row.notes ? <div className="truncate text-slate-400">{row.notes}</div> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/sales-orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Order
                      </Link>
                      <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Fulfillment
                      </Link>
                      <a
                        href={`/api/fulfillments/${row.id}/pdf?type=slip&download=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ios-secondary-btn h-8 px-2 text-xs"
                      >
                        Slip
                      </a>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => updateStatus(row.id, "out_for_delivery")}
                        className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                      >
                        Mark Out
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => updateStatus(row.id, "delivered")}
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

      <article className="linear-card p-4">
        <p className="text-sm text-slate-600">
          Use <Link href="/fulfillment/outbound" className="font-medium text-slate-900 underline">Fulfillment Queue</Link> for loading operations.
        </p>
        <p className="mt-2 text-sm text-slate-600">Use the Fulfillment Queue for the canonical fulfillment-first outbound list.</p>
      </article>
    </section>
  );
}
