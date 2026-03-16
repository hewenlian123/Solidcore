"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";

type BillRow = {
  id: string;
  billNumber: string;
  poNumber: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: "unpaid" | "partial" | "paid";
  dueDate: string | null;
  orderDate: string;
};

export default function VendorBillsPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/purchasing/bills${params}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch bills");
      setRows(payload.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch bills");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, statusFilter]);

  const handleMarkPaid = async (row: BillRow, amount: number) => {
    if (amount <= 0 || amount > row.amount) return;
    setPayingId(row.id);
    try {
      const res = await fetch(`/api/purchasing/bills/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ paidAmount: amount }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update");
      setPayAmount((prev) => ({ ...prev, [row.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setPayingId(null);
    }
  };

  const statusLabel = (s: BillRow["status"]) => (s === "paid" ? "已付" : s === "partial" ? "部分付" : "未付");
  const statusClass = (s: BillRow["status"]) =>
    s === "paid" ? "bg-emerald-500/20 text-emerald-300" : s === "partial" ? "bg-amber-500/20 text-amber-300" : "bg-slate-500/20 text-slate-300";

  return (
    <section className="space-y-4">
      <div className="glass-card p-6">
        <div className="glass-card-content">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Vendor Bills</h1>
          <p className="mt-1 text-sm text-slate-400">Supplier bills linked to purchase orders. Track amount, paid, balance, and due date.</p>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">Status:</span>
          {(["ALL", "unpaid", "partial", "paid"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === s ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {s === "ALL" ? "All" : statusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">Bill #</TableHead>
              <TableHead className="text-slate-400">PO #</TableHead>
              <TableHead className="text-slate-400">Supplier</TableHead>
              <TableHead className="text-right text-slate-400">Amount</TableHead>
              <TableHead className="text-right text-slate-400">Paid</TableHead>
              <TableHead className="text-right text-slate-400">Balance</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Due date</TableHead>
              <TableHead className="text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows columns={9} rows={6} />
            ) : rows.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={9} className="py-12 text-center text-slate-500">
                  No vendor bills found. Create purchase orders to see them here.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="border-white/10 text-slate-300">
                  <TableCell className="font-medium text-white">{row.billNumber}</TableCell>
                  <TableCell className="text-slate-400">{row.poNumber}</TableCell>
                  <TableCell>{row.supplierName}</TableCell>
                  <TableCell className="text-right text-white">${row.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-slate-300">${row.paidAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-white">${row.balance.toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-US") : "—"}
                  </TableCell>
                  <TableCell>
                    {row.balance > 0 && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          max={row.balance}
                          value={payAmount[row.id] ?? ""}
                          onChange={(e) => setPayAmount((p) => ({ ...p, [row.id]: e.target.value }))}
                          placeholder="Amount"
                          className="ios-input h-8 w-24 rounded-lg px-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={payingId === row.id || !(Number(payAmount[row.id]) > 0)}
                          onClick={() => handleMarkPaid(row, Number(payAmount[row.id]) || 0)}
                          className="ios-secondary-btn h-8 px-3 text-xs disabled:opacity-50"
                        >
                          {payingId === row.id ? "..." : "Mark paid"}
                        </button>
                      </div>
                    )}
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
