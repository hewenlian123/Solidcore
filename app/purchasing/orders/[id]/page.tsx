"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  status: string;
  orderDate: string;
  expectedArrival: string | null;
  totalCost: string | number;
  notes: string | null;
  supplier: { id: string; name: string; contactName: string | null; phone: string | null } | null;
};

type DraftItem = {
  variantId: string;
  sku: string;
  variantName: string;
  suggestedQtyBoxes: number;
  suggestedQtySqft: number | null;
  unitCost: number;
  lineNotes: string | null;
};

function fmtMoney(value: unknown) {
  const num = Number(value ?? 0);
  return `$${Number.isFinite(num) ? num.toFixed(2) : "0.00"}`;
}

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();

  const [data, setData] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/purchase-orders/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load purchase order.");
      const po = payload.data as PurchaseOrder;
      setData(po);

      const parsed = safeJsonParse(po.notes);
      const items = Array.isArray(parsed?.items) ? (parsed.items as DraftItem[]) : [];
      setReceiveQty(
        Object.fromEntries(
          items
            .filter((row) => row?.variantId)
            .map((row) => [String(row.variantId), String(row.suggestedQtyBoxes ?? 0)]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase order.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const parsed = useMemo(() => safeJsonParse(data?.notes ?? null), [data?.notes]);
  const draftItems: DraftItem[] = useMemo(() => (Array.isArray(parsed?.items) ? parsed.items : []), [parsed]);
  const receivingMeta = useMemo(() => parsed?.receiving ?? null, [parsed]);

  const canReceive = useMemo(() => {
    if (!data) return false;
    if (String(data.status ?? "").toUpperCase() === "RECEIVED") return false;
    return draftItems.length > 0;
  }, [data, draftItems.length]);

  const submitReceive = async () => {
    if (!data) return;
    try {
      setReceiving(true);
      setError(null);
      setNotice(null);

      const items = draftItems.map((row) => ({
        variantId: row.variantId,
        qty: Number(receiveQty[row.variantId] ?? 0),
      }));

      const res = await fetch(`/api/purchase-orders/${data.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ items }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to receive PO.");
      setNotice(`Received: ${Number(payload?.data?.receivedTotal ?? 0)} / ${Number(payload?.data?.expectedTotal ?? 0)} (status: ${payload?.data?.status ?? "-"})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive PO.");
    } finally {
      setReceiving(false);
    }
  };

  if (loading) return <div className="glass-card p-8 text-sm text-slate-400">Loading purchase order...</div>;
  if (!data) return <div className="glass-card p-8 text-sm text-slate-400">Purchase order not found.</div>;

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <header className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/purchasing/orders" className="text-xs text-slate-400 hover:text-white">
              ← Back to Purchase Orders
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{data.poNumber}</h1>
            <p className="mt-2 text-sm text-slate-400">
              Supplier: {data.supplier?.name ?? "-"} · Status: {data.status} · Total: {fmtMoney(data.totalCost)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canReceive ? (
              <button
                type="button"
                onClick={submitReceive}
                disabled={receiving}
                className="ios-primary-btn h-10 px-3 text-sm disabled:opacity-60"
              >
                {receiving ? "Receiving..." : "Receive to Inventory"}
              </button>
            ) : (
              <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70">
                {String(data.status ?? "").toUpperCase() === "RECEIVED"
                  ? "Already received"
                  : draftItems.length === 0
                    ? "No receivable items"
                    : "Receiving disabled"}
              </span>
            )}
            <Link href="/inventory/reorder" className="ios-secondary-btn h-10 px-3 text-sm">
              Reorder List
            </Link>
          </div>
        </div>
      </header>

      {receivingMeta ? (
        <div className="glass-card p-5">
          <div className="glass-card-content">
            <h2 className="text-sm font-semibold text-white">Receiving Log</h2>
            <p className="mt-2 text-sm text-slate-400">
              Received at: {String(receivingMeta?.receivedAt ?? "-")} · Status: {String(receivingMeta?.status ?? "-")}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Received: {Number(receivingMeta?.receivedTotal ?? 0)} / {Number(receivingMeta?.expectedTotal ?? 0)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">Item</TableHead>
                <TableHead className="text-slate-400">SKU</TableHead>
                <TableHead className="text-right text-slate-400">Suggested (Boxes)</TableHead>
                <TableHead className="text-right text-slate-400">Receive Now</TableHead>
                <TableHead className="text-right text-slate-400">Unit Cost</TableHead>
                <TableHead className="text-slate-400">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftItems.length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={6} className="p-6 text-center text-slate-400">
                    This PO does not have item lines (draft items are stored in `notes`).
                  </TableCell>
                </TableRow>
              ) : (
                draftItems.map((row) => (
                  <TableRow key={row.variantId} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                    <TableCell className="font-medium text-white">{row.variantName}</TableCell>
                    <TableCell className="text-slate-400">{row.sku}</TableCell>
                    <TableCell className="text-right">{Number(row.suggestedQtyBoxes ?? 0).toFixed(0)}</TableCell>
                    <TableCell className="text-right">
                      <input
                        value={receiveQty[row.variantId] ?? ""}
                        onChange={(e) => setReceiveQty((prev) => ({ ...prev, [row.variantId]: e.target.value }))}
                        disabled={!canReceive}
                        type="number"
                        min="0"
                        step="1"
                        className="ios-input h-9 w-28 px-2 text-right text-xs"
                      />
                    </TableCell>
                    <TableCell className="text-right">{row.unitCost ? fmtMoney(row.unitCost) : "-"}</TableCell>
                    <TableCell className="text-slate-400">{row.lineNotes || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="glass-card-content">
          <h2 className="text-sm font-semibold text-white">Raw Notes</h2>
          <pre className="mt-2 max-h-[260px] overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
            {data.notes || "(empty)"}
          </pre>
        </div>
      </div>
    </section>
  );
}

