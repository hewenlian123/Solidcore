"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { formatQuantity, formatQuantityWithUnit, normalizeUnitAbbr } from "@/lib/quantity-format";

type MovementRow = {
  id: string;
  createdAt: string;
  type: string;
  qty: number;
  unit: string;
  note: string | null;
  variantId: string;
  sku: string | null;
  displayName: string | null;
  productId: string | null;
  balanceAfter?: number | null;
  balanceBefore?: number | null;
  related: {
    fulfillmentId: string | null;
    returnId: string | null;
  };
};

type ApiPayload = {
  items: MovementRow[];
  nextCursor: string | null;
};

type FilterValues = {
  q: string;
  type: string;
  from: string;
  to: string;
  variantId: string;
};

export default function InventoryMovementsPage() {
  const { role } = useRole();
  const initializedRef = useRef(false);
  const [items, setItems] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [variantId, setVariantId] = useState("");

  const movementTypes = useMemo(() => {
    const set = new Set(items.map((item) => item.type).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);
  const showBalanceColumn = Boolean(variantId.trim());

  const buildParams = (filters?: Partial<FilterValues>, cursor?: string | null) => {
    const params = new URLSearchParams();
    const qValue = String(filters?.q ?? q).trim();
    const typeValue = String(filters?.type ?? type).trim();
    const fromValue = String(filters?.from ?? from).trim();
    const toValue = String(filters?.to ?? to).trim();
    const variantIdValue = String(filters?.variantId ?? variantId).trim();
    if (qValue) params.set("q", qValue);
    if (typeValue) params.set("type", typeValue);
    if (fromValue) params.set("from", fromValue);
    if (toValue) params.set("to", toValue);
    if (variantIdValue) params.set("variantId", variantIdValue);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  const fetchMovements = async (cursor?: string | null, filters?: Partial<FilterValues>) => {
    const params = buildParams(filters, cursor);
    const res = await fetch(`/api/inventory/movements?${params.toString()}`, {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = (await res.json()) as ApiPayload & { error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load inventory movements");
    return payload;
  };

  const load = async (filters?: Partial<FilterValues>) => {
    try {
      setLoading(true);
      setError(null);
      const payload = await fetchMovements(null, filters);
      setItems(payload.items ?? []);
      setNextCursor(payload.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory movements");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const payload = await fetchMovements(nextCursor);
      setItems((prev) => [...prev, ...(payload.items ?? [])]);
      setNextCursor(payload.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more movements");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const initialFilters: FilterValues = {
      q: String(params.get("q") ?? "").trim(),
      type: String(params.get("type") ?? "").trim(),
      from: String(params.get("from") ?? "").trim(),
      to: String(params.get("to") ?? "").trim(),
      variantId: String(params.get("variantId") ?? "").trim(),
    };
    setQ(initialFilters.q);
    setType(initialFilters.type);
    setFrom(initialFilters.from);
    setTo(initialFilters.to);
    setVariantId(initialFilters.variantId);
    void load(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const onApplyFilters = () => {
    const params = buildParams();
    const qs = params.toString();
    const nextUrl = qs ? `/inventory/movements?${qs}` : "/inventory/movements";
    window.history.replaceState(null, "", nextUrl);
    void load();
  };

  const onExportCsv = () => {
    const params = buildParams();
    const qs = params.toString();
    const url = qs ? `/api/inventory/movements/export?${qs}` : "/api/inventory/movements/export";
    window.location.href = url;
  };

  return (
    <section className="space-y-6">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inventory Movements</h1>
        <p className="mt-2 text-sm text-slate-500">Operator history of stock changes (deduct, return add, adjust).</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Search</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="SKU / item name"
            className="ios-input h-10 w-64 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="ios-input h-10 w-44 px-3 text-sm"
          >
            <option value="">All</option>
            {movementTypes.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">From</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="ios-input h-10 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">To</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="ios-input h-10 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Variant ID (optional)</span>
          <input
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            placeholder="variant id"
            className="ios-input h-10 w-52 px-3 text-sm"
          />
        </label>
        <button type="button" onClick={onApplyFilters} className="ios-secondary-btn h-10 px-4 text-sm">
          Apply
        </button>
        <button type="button" onClick={onExportCsv} className="ios-secondary-btn h-10 px-4 text-sm">
          Export CSV
        </button>
      </div>

      <div className="linear-card overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
              <TableHead>Date / Time</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              {showBalanceColumn ? <TableHead className="text-right">Balance After</TableHead> : null}
              <TableHead>Note</TableHead>
              <TableHead>Related</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows columns={showBalanceColumn ? 8 : 7} rows={10} rowClassName="border-white/10" />
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showBalanceColumn ? 8 : 7} className="text-center text-slate-500">
                  No movements found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const qtyText = `${row.qty >= 0 ? "+" : ""}${formatQuantity(Math.abs(Number(row.qty)))} ${
                  normalizeUnitAbbr(row.unit) || row.unit
                }`;
                return (
                  <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/10">
                    <TableCell>
                      {new Date(row.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}
                    </TableCell>
                    <TableCell>{row.sku ?? "-"}</TableCell>
                    <TableCell>
                      {row.productId ? (
                        <Link href={`/products/${row.productId}`} className="font-medium text-slate-900 hover:underline">
                          {row.displayName ?? "-"}
                        </Link>
                      ) : (
                        <span>{row.displayName ?? "-"}</span>
                      )}
                    </TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        row.qty >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {qtyText}
                    </TableCell>
                    {showBalanceColumn ? (
                      <TableCell className="text-right">
                        <p className="font-semibold text-slate-900">
                          {row.balanceAfter != null ? formatQuantityWithUnit(row.balanceAfter, row.unit) : "-"}
                        </p>
                        {row.balanceBefore != null ? (
                          <p className="text-[11px] text-slate-500">
                            Before {formatQuantityWithUnit(row.balanceBefore, row.unit)}
                          </p>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="max-w-[360px] truncate">{row.note ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.related.fulfillmentId ? (
                          <Link
                            href={`/fulfillment/${row.related.fulfillmentId}`}
                            className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                          >
                            Fulfillment
                          </Link>
                        ) : null}
                        {row.related.returnId ? (
                          <Link
                            href={`/after-sales/returns/${row.related.returnId}`}
                            className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            Return
                          </Link>
                        ) : null}
                        {!row.related.fulfillmentId && !row.related.returnId ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="ios-secondary-btn h-10 px-4 text-sm disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
