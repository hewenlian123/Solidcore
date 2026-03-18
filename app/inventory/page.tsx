"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQuantityWithUnit } from "@/lib/quantity-format";

type InventorySummaryPayload = {
  cards: {
    totalProducts: number;
    totalSkus: number;
    totalUnitsInStock: number;
    totalCostValue: number;
    totalRetailValue: number;
    lowStockItems: number;
  };
  categoryBreakdown: Array<{
    category: string;
    skus: number;
    totalUnits: number;
    costValue: number;
    retailValue: number;
    marginPct: number;
  }>;
};

function formatCurrency(value: number) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function formatNumber(value: number) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function unitByCategory(category: string) {
  return String(category).toUpperCase() === "FLOOR" ? "sqft" : "pcs";
}

export default function InventorySummaryPage() {
  const router = useRouter();
  const { role } = useRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InventorySummaryPayload | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/inventory/summary", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load inventory summary.");
      setData(payload.data as InventorySummaryPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Inventory Summary</h1>
        <p className="mt-1 text-sm text-white/60">Main inventory dashboard with stock value and category-level breakdown.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      {loading || !data ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-8 text-sm text-white/50 backdrop-blur-2xl">
          Loading inventory summary...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
              <p className="text-xs text-white/60">Total Products</p>
              <p className="mt-2 text-2xl font-semibold text-white/90">{formatNumber(data.cards.totalProducts)}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
              <p className="text-xs text-white/60">Total SKUs</p>
              <p className="mt-2 text-2xl font-semibold text-white/90">{formatNumber(data.cards.totalSkus)}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
              <p className="text-xs text-white/60">Total Units In Stock</p>
              <p className="mt-2 text-2xl font-semibold text-white/90">{formatNumber(data.cards.totalUnitsInStock)}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
              <p className="text-xs text-white/60">Total Cost Value</p>
              <p className="mt-2 text-2xl font-semibold text-white/90">{formatCurrency(data.cards.totalCostValue)}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
              <p className="text-xs text-white/60">Total Retail Value</p>
              <p className="mt-2 text-2xl font-semibold text-white/90">{formatCurrency(data.cards.totalRetailValue)}</p>
            </article>
            <article className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 backdrop-blur-2xl">
              <p className="text-xs text-amber-300">Low Stock Items</p>
              <p className="mt-2 text-2xl font-semibold text-amber-300">{formatNumber(data.cards.lowStockItems)}</p>
            </article>
          </div>

          <div className="glass-card overflow-hidden p-0">
            <div className="glass-card-content">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-sm font-semibold text-white">Category Breakdown</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                  <TableHead className="text-slate-400">Category</TableHead>
                  <TableHead className="text-right text-slate-400">SKUs</TableHead>
                  <TableHead className="text-right text-slate-400">Total Units</TableHead>
                  <TableHead className="text-right text-slate-400">Cost Value</TableHead>
                  <TableHead className="text-right text-slate-400">Retail Value</TableHead>
                  <TableHead className="text-right text-slate-400">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.categoryBreakdown.length === 0 ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={6} className="text-center text-slate-400">
                      No inventory records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.categoryBreakdown.map((row) => (
                    <TableRow
                      key={row.category}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]"
                      onClick={() => router.push(`/products?category=${encodeURIComponent(row.category)}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          router.push(`/products?category=${encodeURIComponent(row.category)}`);
                        }
                      }}
                    >
                      <TableCell>{row.category}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.skus)}</TableCell>
                      <TableCell className="text-right">
                        {formatQuantityWithUnit(row.totalUnits, unitByCategory(row.category))}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.costValue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.retailValue)}</TableCell>
                      <TableCell className="text-right">{row.marginPct.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
