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
      <div className="linear-card p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inventory Summary</h1>
        <p className="mt-1 text-sm text-slate-500">Main inventory dashboard with stock value and category-level breakdown.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading || !data ? (
        <div className="linear-card p-8 text-sm text-slate-500">Loading inventory summary...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="linear-card p-5">
              <p className="text-xs text-slate-500">Total Products</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(data.cards.totalProducts)}</p>
            </article>
            <article className="linear-card p-5">
              <p className="text-xs text-slate-500">Total SKUs</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(data.cards.totalSkus)}</p>
            </article>
            <article className="linear-card p-5">
              <p className="text-xs text-slate-500">Total Units In Stock</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(data.cards.totalUnitsInStock)}</p>
            </article>
            <article className="linear-card p-5">
              <p className="text-xs text-slate-500">Total Cost Value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(data.cards.totalCostValue)}</p>
            </article>
            <article className="linear-card p-5">
              <p className="text-xs text-slate-500">Total Retail Value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(data.cards.totalRetailValue)}</p>
            </article>
            <article className="linear-card border-amber-200 bg-amber-50/60 p-5">
              <p className="text-xs text-amber-700">Low Stock Items</p>
              <p className="mt-2 text-2xl font-semibold text-amber-800">{formatNumber(data.cards.lowStockItems)}</p>
            </article>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Category Breakdown</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">SKUs</TableHead>
                  <TableHead className="text-right">Total Units</TableHead>
                  <TableHead className="text-right">Cost Value</TableHead>
                  <TableHead className="text-right">Retail Value</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.categoryBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500">
                      No inventory records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.categoryBreakdown.map((row) => (
                    <TableRow
                      key={row.category}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition hover:bg-slate-50"
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
        </>
      )}
    </section>
  );
}
