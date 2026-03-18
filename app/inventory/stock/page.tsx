"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
type StockRow = {
  id: string;
  sku: string;
  productName: string;
  variantName: string | null;
  currentStock: number;
  minStock: number;
  status: "ok" | "low" | "out";
};

export default function InventoryStockPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setQueryDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ok" | "low" | "out">("ALL");

  useEffect(() => {
    const t = setTimeout(() => setQueryDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("q", debouncedQuery);
        const res = await fetch(`/api/inventory/stock?${params.toString()}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load stock");
        setRows(payload.data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stock");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role, debouncedQuery]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "ALL") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const statusBadge = (status: StockRow["status"]) => {
    switch (status) {
      case "ok":
        return <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">正常</span>;
      case "low":
        return <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">低库存</span>;
      case "out":
        return <span className="rounded-lg bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-300">缺货</span>;
      default:
        return null;
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-card p-4">
        <div className="glass-card-content">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Stock Levels</h1>
          <p className="mt-1 text-sm text-slate-400">Stock levels from product variants and inventory_stock. Search by product name or SKU.</p>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-[200px] sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by product name or SKU"
                className="ios-input h-10 w-full pl-9 pr-3 text-sm"
              />
            </div>
            <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
              {(["ALL", "ok", "low", "out"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === s ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10"
                  }`}
                >
                  {s === "ALL" ? "All" : s === "ok" ? "正常" : s === "low" ? "低库存" : "缺货"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">SKU</TableHead>
              <TableHead className="text-slate-400">Product</TableHead>
              <TableHead className="text-slate-400">Variant</TableHead>
              <TableHead className="text-right text-slate-400">Current</TableHead>
              <TableHead className="text-right text-slate-400">Min threshold</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows columns={6} rows={8} />
            ) : filteredRows.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                  No stock records found. Adjust filters or add product variants.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id} className="border-white/10 text-slate-300">
                  <TableCell className="font-mono text-sm text-white">{row.sku}</TableCell>
                  <TableCell className="text-white">{row.productName}</TableCell>
                  <TableCell className="text-slate-400">{row.variantName ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium text-white">{Number(row.currentStock).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-slate-400">{Number(row.minStock).toLocaleString()}</TableCell>
                  <TableCell>{statusBadge(row.status)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
