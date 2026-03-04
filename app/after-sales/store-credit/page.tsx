"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StoreCreditRow = {
  id: string;
  customerId: string;
  customerName: string;
  returnId: string | null;
  returnNumber: string | null;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  status: "OPEN" | "USED" | "VOID";
  notes: string | null;
  expiryDate: string | null;
  createdAt: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function statusBadge(status: string) {
  const key = String(status).toUpperCase();
  if (key === "OPEN") return "bg-emerald-100 text-emerald-700";
  if (key === "USED") return "bg-slate-200 text-slate-700";
  return "bg-rose-100 text-rose-700";
}

export default function AfterSalesStoreCreditPlaceholderPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<StoreCreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<StoreCreditRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<StoreCreditRow | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/store-credits", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load store credits.");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load store credits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]); // role switch refreshes list

  const grouped = useMemo(() => {
    const map = new Map<string, { customerId: string; customerName: string; rows: StoreCreditRow[] }>();
    for (const row of rows) {
      const key = row.customerId;
      const prev = map.get(key) ?? { customerId: row.customerId, customerName: row.customerName, rows: [] };
      prev.rows.push(row);
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [rows]);

  const onVoid = async () => {
    if (!voidTarget) return;
    try {
      setBusyId(voidTarget.id);
      setError(null);
      const res = await fetch(`/api/store-credits/${voidTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "VOID", reason: voidReason }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to void store credit.");
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void store credit.");
    } finally {
      setBusyId(null);
    }
  };

  const onAdjust = async () => {
    if (!adjustTarget) return;
    try {
      setBusyId(adjustTarget.id);
      setError(null);
      const delta = Number(adjustDelta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error("Adjustment delta must be non-zero.");
      const res = await fetch(`/api/store-credits/${adjustTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADJUST", delta, reason: adjustReason }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to adjust store credit.");
      setAdjustTarget(null);
      setAdjustReason("");
      setAdjustDelta("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust store credit.");
    } finally {
      setBusyId(null);
    }
  };

  const totalActiveBalance = rows
    .filter((row) => row.status === "OPEN")
    .reduce((sum, row) => sum + Number(row.remainingAmount), 0);

  return (
    <section className="space-y-5">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">After-Sales Store Credit</h1>
        <p className="mt-2 text-sm text-slate-500">
          Manage customer store credits, manual voids, and balance adjustments.
        </p>
        <p className="mt-3 text-sm text-slate-700">
          Active Balance: <span className="font-semibold">{formatMoney(totalActiveBalance)}</span>
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="space-y-4">
        {loading ? (
          <div className="linear-card p-6 text-sm text-slate-500">Loading store credits...</div>
        ) : grouped.length === 0 ? (
          <div className="linear-card p-6 text-sm text-slate-500">No store credits found.</div>
        ) : (
          grouped.map((group) => (
            <div key={group.customerId} className="linear-card p-0">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{group.customerName}</h2>
                  <p className="text-xs text-slate-500">{group.rows.length} credits</p>
                </div>
                <Link href={`/customers/${group.customerId}`} className="ios-secondary-btn h-8 px-3 text-xs">
                  View Customer
                </Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>Credit ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source Return</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/30">
                      <TableCell className="font-medium text-slate-900">{row.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.amount)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.usedAmount)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.remainingAmount)}</TableCell>
                      <TableCell>
                        {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                      </TableCell>
                      <TableCell>{row.expiryDate ? row.expiryDate : "-"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(row.status)}`}>
                          {row.status === "OPEN" ? "Active" : row.status === "USED" ? "Used" : "Voided"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.returnId ? (
                          <Link className="text-slate-700 underline" href={`/returns/${row.returnId}`}>
                            {row.returnNumber ? row.returnNumber : row.returnId.slice(0, 8)}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="ios-secondary-btn h-8 px-2 text-xs"
                            onClick={() => {
                              setAdjustTarget(row);
                              setAdjustDelta("");
                              setAdjustReason("");
                            }}
                            disabled={busyId === row.id}
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            className="ios-secondary-btn h-8 px-2 text-xs text-rose-700"
                            onClick={() => {
                              setVoidTarget(row);
                              setVoidReason("");
                            }}
                            disabled={busyId === row.id || row.status === "VOID"}
                          >
                            Void
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </div>

      {voidTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="so-modal-shell w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-slate-900">Void Store Credit</h3>
            <p className="mt-1 text-sm text-slate-600">
              Credit #{voidTarget.id.slice(0, 8)} will be marked as voided.
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-xs text-slate-500">Reason</span>
              <textarea
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                rows={3}
                className="ios-input h-auto p-3"
                placeholder="Reason for voiding this credit..."
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ios-secondary-btn h-9 px-3 text-sm" onClick={() => setVoidTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ios-primary-btn h-9 px-3 text-sm"
                onClick={onVoid}
                disabled={!voidReason.trim() || busyId === voidTarget.id}
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {adjustTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="so-modal-shell w-full max-w-md p-5">
            <h3 className="text-base font-semibold text-slate-900">Adjust Store Credit</h3>
            <p className="mt-1 text-sm text-slate-600">
              Current amount: {formatMoney(adjustTarget.amount)} / used: {formatMoney(adjustTarget.usedAmount)}
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-xs text-slate-500">Adjustment Amount (use negative to reduce)</span>
              <input
                value={adjustDelta}
                onChange={(event) => setAdjustDelta(event.target.value)}
                type="number"
                step="0.01"
                className="ios-input"
                placeholder="e.g. 25 or -10"
              />
            </label>
            <label className="mt-3 block space-y-1">
              <span className="text-xs text-slate-500">Reason</span>
              <textarea
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                rows={3}
                className="ios-input h-auto p-3"
                placeholder="Reason for adjustment..."
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ios-secondary-btn h-9 px-3 text-sm" onClick={() => setAdjustTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ios-primary-btn h-9 px-3 text-sm"
                onClick={onAdjust}
                disabled={!adjustReason.trim() || !adjustDelta.trim() || busyId === adjustTarget.id}
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
