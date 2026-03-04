"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OutboundRow = {
  id: string;
  type: "DELIVERY" | "PICKUP";
  status: string;
  scheduledAt: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
};

const statusLabel = (status: string) => {
  const key = status.toUpperCase();
  if (key === "OUT_FOR_DELIVERY") return "Out for Delivery";
  if (key === "PICKED_UP") return "Picked Up";
  if (key === "CANCELLED") return "Cancelled";
  return key.replaceAll("_", " ").toLowerCase();
};

export default function FulfillmentOutboundPage() {
  const { role } = useRole();
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

  const setStatus = async (row: OutboundRow, status: "ready" | "out_for_delivery" | "picked_up") => {
    try {
      setBusyId(row.id);
      setError(null);
      const endpoint = status === "ready" ? `/api/fulfillments/${row.id}` : `/api/fulfillments/${row.id}/status`;
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
      <header className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fulfillment Outbound Queue</h1>
        <p className="mt-2 text-sm text-slate-500">All non-completed and non-cancelled fulfillment tasks.</p>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Scheduled</TableHead>
              <TableHead>SO #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500">
                  No active fulfillments in outbound queue.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
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
                  <TableCell className="font-semibold text-slate-900">{row.salesOrderNumber}</TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell>{row.type === "DELIVERY" ? "Delivery" : "Pickup"}</TableCell>
                  <TableCell>{statusLabel(row.status)}</TableCell>
                  <TableCell>{row.type === "DELIVERY" ? row.address : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View Fulfillment
                      </Link>
                      <Link href={`/sales-orders/${row.salesOrderId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View SO
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setStatus(row, "ready")}
                        className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                      >
                        Mark Ready
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setStatus(row, row.type === "DELIVERY" ? "out_for_delivery" : "picked_up")}
                        className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                      >
                        {row.type === "DELIVERY" ? "Mark Out" : "Mark Picked Up"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
