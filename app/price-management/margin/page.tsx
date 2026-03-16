"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";

type CategoryMargin = { category: string; marginPct: number };
type VariantRow = {
  variantId: string;
  sku: string;
  productName: string;
  cost: number;
  price: number;
  marginPctOverride: number | null;
  defaultMarginPct: number;
  appliedMarginPct: number;
  suggestedPrice: number;
  actualMarginPct: number;
};

export default function MarginControlPage() {
  const { role } = useRole();
  const [categoryDefaults, setCategoryDefaults] = useState<CategoryMargin[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [defaultMarginPct, setDefaultMarginPct] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [defaultPctInput, setDefaultPctInput] = useState("30");
  const [savingVariant, setSavingVariant] = useState<string | null>(null);
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/price-management/margin", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load");
      setCategoryDefaults(payload.categoryDefaults ?? []);
      setVariants(payload.variants ?? []);
      setDefaultMarginPct(payload.defaultMarginPct ?? 30);
      setDefaultPctInput(String(payload.defaultMarginPct ?? 30));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const saveDefaultMargin = async () => {
    const pct = Number(defaultPctInput);
    if (!Number.isFinite(pct) || pct < 0) return;
    setSavingCategory(true);
    try {
      const res = await fetch("/api/price-management/margin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ category: "DEFAULT", marginPct: pct }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingCategory(false);
    }
  };

  const saveVariantOverride = async (variantId: string, value: string) => {
    const pct = value === "" ? null : Number(value);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0)) return;
    setSavingVariant(variantId);
    try {
      const res = await fetch("/api/price-management/margin/variant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ variantId, marginPct: pct }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setOverrideInputs((p) => ({ ...p, [variantId]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingVariant(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-card p-6">
        <div className="glass-card-content">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Margin Control</h1>
          <p className="mt-1 text-sm text-slate-400">Set default margin by category and per-SKU overrides. Cost, suggested price, and actual margin are shown.</p>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Default margin %</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={defaultPctInput}
              onChange={(e) => setDefaultPctInput(e.target.value)}
              className="ios-input h-9 w-24 rounded-lg px-2 text-sm"
            />
            <button
              type="button"
              onClick={saveDefaultMargin}
              disabled={savingCategory}
              className="ios-secondary-btn h-9 px-3 text-sm"
            >
              {savingCategory ? "Saving..." : "Save default"}
            </button>
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
              <TableHead className="text-right text-slate-400">Cost</TableHead>
              <TableHead className="text-right text-slate-400">Current price</TableHead>
              <TableHead className="text-right text-slate-400">Margin % (override)</TableHead>
              <TableHead className="text-right text-slate-400">Suggested price</TableHead>
              <TableHead className="text-right text-slate-400">Actual margin %</TableHead>
              <TableHead className="text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows columns={8} rows={6} />
            ) : variants.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                  No variants found. Add products and variants to configure margins.
                </TableCell>
              </TableRow>
            ) : (
              variants.map((row) => (
                <TableRow key={row.variantId} className="border-white/10 text-slate-300">
                  <TableCell className="font-mono text-white">{row.sku}</TableCell>
                  <TableCell className="text-white">{row.productName}</TableCell>
                  <TableCell className="text-right text-white">${row.cost.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-white">${row.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      placeholder={String(row.defaultMarginPct)}
                      value={overrideInputs[row.variantId] ?? (row.marginPctOverride != null ? String(row.marginPctOverride) : "")}
                      onChange={(e) => setOverrideInputs((p) => ({ ...p, [row.variantId]: e.target.value }))}
                      className="ios-input h-8 w-20 rounded-lg px-2 text-right text-sm"
                    />
                  </TableCell>
                  <TableCell className="text-right text-emerald-300">${row.suggestedPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-slate-300">{row.actualMarginPct.toFixed(1)}%</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={savingVariant === row.variantId}
                      onClick={() => saveVariantOverride(row.variantId, overrideInputs[row.variantId] ?? (row.marginPctOverride != null ? String(row.marginPctOverride) : ""))}
                      className="ios-secondary-btn h-8 px-3 text-xs"
                    >
                      {savingVariant === row.variantId ? "..." : "Save"}
                    </button>
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
