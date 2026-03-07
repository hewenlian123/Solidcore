"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OutboundRow = {
  id: string;
  type: "DELIVERY" | "PICKUP";
  status: string;
  scheduledAt: string | null;
  timeWindow: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
  itemCount: number;
  itemsCompleted: number;
};

type FulfillmentDetail = {
  id: string;
  type: "PICKUP" | "DELIVERY";
  status: string;
  scheduledAt: string | null;
  scheduledDate: string | null;
  timeWindow: string | null;
  items: Array<{
    id: string;
    title: string;
    sku: string;
    unit: string;
    orderedQty: string;
    fulfilledQty: string;
    notes: string | null;
  }>;
  salesOrder: { id: string; orderNumber: string; customer: { id: string; name: string } | null };
};

type ItemDraft = { fulfilledQty: string; notes: string };

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

const statusLabel = (status: string) => {
  const key = status.toUpperCase();
  if (key === "OUT_FOR_DELIVERY") return "Out for Delivery";
  if (key === "PICKED_UP") return "Picked Up";
  if (key === "DELIVERED") return "Delivered";
  return key.replaceAll("_", " ");
};

export default function PickingPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [detailById, setDetailById] = useState<Record<string, FulfillmentDetail | undefined>>({});
  const [draftsByItemId, setDraftsByItemId] = useState<Record<string, ItemDraft>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = async () => {
    try {
      setError(null);
      const res = await fetch("/api/fulfillments/outbound", { cache: "no-store", headers: { "x-user-role": role } });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load picking queue");
      const data = (payload.data ?? []) as OutboundRow[];
      const filtered = data.filter((row) => {
        const key = String(row.status ?? "").toUpperCase();
        return ["DRAFT", "SCHEDULED", "PACKING", "PARTIAL"].includes(key);
      });
      setRows(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load picking queue");
    }
  };

  const loadDetail = async (id: string) => {
    if (detailById[id]) return;
    const res = await fetch(`/api/fulfillments/${id}`, { cache: "no-store", headers: { "x-user-role": role } });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load fulfillment detail");
    const detail = payload.data as FulfillmentDetail;
    setDetailById((prev) => ({ ...prev, [id]: detail }));
    setDraftsByItemId((prev) => ({
      ...prev,
      ...Object.fromEntries(
        detail.items.map((item) => [
          item.id,
          {
            fulfilledQty: String(item.fulfilledQty ?? "0"),
            notes: String(item.notes ?? ""),
          },
        ]),
      ),
    }));
  };

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const queueSummary = useMemo(() => {
    const total = rows.length;
    const totalItems = rows.reduce((acc, row) => acc + Number(row.itemCount ?? 0), 0);
    const completedItems = rows.reduce((acc, row) => acc + Number(row.itemsCompleted ?? 0), 0);
    return { total, totalItems, completedItems };
  }, [rows]);

  const markPacking = async (id: string) => {
    try {
      setBusyId(id);
      setError(null);
      const res = await fetch(`/api/fulfillments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status: "packing" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to mark packing");
      await loadQueue();
      setDetailById((prev) => ({ ...prev, [id]: undefined }));
      await loadDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark packing");
    } finally {
      setBusyId(null);
    }
  };

  const saveItems = async (fulfillmentId: string) => {
    const detail = detailById[fulfillmentId];
    if (!detail) return;
    try {
      setBusyId(fulfillmentId);
      setError(null);
      for (const item of detail.items) {
        const draft = draftsByItemId[item.id];
        if (!draft) continue;
        const changedQty = String(item.fulfilledQty ?? "0") !== String(draft.fulfilledQty ?? "0");
        const changedNotes = String(item.notes ?? "") !== String(draft.notes ?? "");
        if (!changedQty && !changedNotes) continue;
        const qty = Number(draft.fulfilledQty || 0);
        const ordered = Number(item.orderedQty || 0);
        if (!Number.isFinite(qty) || qty < 0) throw new Error(`Picked qty for "${item.title}" must be >= 0.`);
        if (qty > ordered) throw new Error(`Picked qty for "${item.title}" cannot exceed ordered qty.`);

        const res = await fetch(`/api/fulfillment-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({ fulfilledQty: qty, notes: draft.notes }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to update item");
      }

      const refetch = await fetch(`/api/fulfillments/${fulfillmentId}`, { cache: "no-store", headers: { "x-user-role": role } });
      const refetchPayload = await refetch.json();
      if (!refetch.ok) throw new Error(refetchPayload.error ?? "Failed to refresh fulfillment");
      setDetailById((prev) => ({ ...prev, [fulfillmentId]: refetchPayload.data as FulfillmentDetail }));
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save picked items");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-6">
      <header className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Picking</h1>
            <p className="mt-2 text-sm text-slate-400">
              Pick checklist powered by existing fulfillment items (no new data model).
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Queue: <span className="font-semibold text-white">{queueSummary.total}</span> fulfillments ·{" "}
              <span className="font-semibold text-white">{queueSummary.completedItems}</span> /{" "}
              <span className="font-semibold text-white">{queueSummary.totalItems}</span> items complete
            </p>
          </div>
          <Link href="/fulfillment/outbound" className="ios-secondary-btn h-10 px-3 text-sm">
            Fulfillment Queue
          </Link>
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
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={7} className="text-center text-slate-400">
                    No fulfillments currently in picking workflow.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <>
                    <TableRow
                      key={row.id}
                      className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]"
                    >
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
                      <TableCell className="font-semibold text-white">{row.salesOrderNumber}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.type === "DELIVERY" ? "Delivery" : "Pickup"}</TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {row.itemCount} <span className="text-slate-400">({row.itemsCompleted}/{row.itemCount})</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </TableCell>
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
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                            Open
                          </Link>
                          <button
                            type="button"
                            className="ios-secondary-btn h-8 px-2 text-xs"
                            onClick={async () => {
                              try {
                                if (expandedId === row.id) {
                                  setExpandedId(null);
                                  return;
                                }
                                setExpandedId(row.id);
                                await loadDetail(row.id);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed to expand fulfillment");
                              }
                            }}
                          >
                            {expandedId === row.id ? "Hide Checklist" : "Checklist"}
                          </button>
                          {String(row.status).toUpperCase() !== "PACKING" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              className="ios-secondary-btn h-8 px-2 text-xs disabled:opacity-60"
                              onClick={() => markPacking(row.id)}
                            >
                              Mark Packing
                            </button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>

                    {expandedId === row.id ? (
                      <TableRow className="border-white/10 bg-white/[0.02]">
                        <TableCell colSpan={7}>
                          <div className="space-y-3 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-white">Pick Checklist</div>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                className="ios-primary-btn h-8 px-2 text-xs disabled:opacity-60"
                                onClick={() => saveItems(row.id)}
                              >
                                Save Picked
                              </button>
                            </div>

                            {detailById[row.id] ? (
                              <div className="overflow-hidden rounded-xl border border-white/10">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                                      <TableHead className="text-slate-400">Item</TableHead>
                                      <TableHead className="text-slate-400">SKU</TableHead>
                                      <TableHead className="text-right text-slate-400">Ordered</TableHead>
                                      <TableHead className="text-right text-slate-400">Fulfilled</TableHead>
                                      <TableHead className="text-right text-slate-400">Remaining</TableHead>
                                      <TableHead className="text-slate-400">Notes</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {detailById[row.id]!.items.map((item) => {
                                      const draft = draftsByItemId[item.id] ?? {
                                        fulfilledQty: String(item.fulfilledQty ?? "0"),
                                        notes: String(item.notes ?? ""),
                                      };
                                      const ordered = Number(item.orderedQty ?? 0);
                                      const fulfilled = Number(draft.fulfilledQty || 0);
                                      const remaining = Math.max(ordered - fulfilled, 0);
                                      return (
                                        <TableRow key={item.id} className="border-white/10 text-slate-300">
                                          <TableCell className="font-medium text-white">
                                            {item.title} <span className="text-xs text-slate-400">({item.unit})</span>
                                          </TableCell>
                                          <TableCell className="text-xs text-slate-400">{item.sku || "-"}</TableCell>
                                          <TableCell className="text-right">{ordered.toFixed(2)}</TableCell>
                                          <TableCell className="text-right">
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={draft.fulfilledQty}
                                              onChange={(e) =>
                                                setDraftsByItemId((prev) => ({
                                                  ...prev,
                                                  [item.id]: { ...(prev[item.id] ?? draft), fulfilledQty: e.target.value },
                                                }))
                                              }
                                              className="ios-input ml-auto h-9 w-24 px-2 text-right text-xs"
                                            />
                                          </TableCell>
                                          <TableCell className="text-right">{remaining.toFixed(2)}</TableCell>
                                          <TableCell>
                                            <input
                                              value={draft.notes}
                                              onChange={(e) =>
                                                setDraftsByItemId((prev) => ({
                                                  ...prev,
                                                  [item.id]: { ...(prev[item.id] ?? draft), notes: e.target.value },
                                                }))
                                              }
                                              className="ios-input h-9 px-2 text-xs"
                                            />
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400">Loading checklist…</div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
