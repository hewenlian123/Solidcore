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

  return (
    <section className="space-y-6">
      <header className="linear-card p-8">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Delivery Schedule</h1>
            <p className="mt-1 text-sm text-slate-500">
              Delivery list by day, backed by fulfillment schedules.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
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
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Time</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500">
                  No delivery schedules for this date.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
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
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.driver || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/sales-orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Order
                      </Link>
                      <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Fulfillment
                      </Link>
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

      <article className="linear-card p-6">
        <p className="text-sm text-slate-600">
          Use <Link href="/outbound" className="font-medium text-slate-900 underline">Outbound Queue</Link> for loading operations.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          For fulfillment-first queue, open{" "}
          <Link href="/fulfillment/outbound" className="font-medium text-slate-900 underline">
            Fulfillment Outbound Queue
          </Link>
          .
        </p>
      </article>
    </section>
  );
}
