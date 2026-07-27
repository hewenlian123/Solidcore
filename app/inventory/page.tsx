"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";

type StockRow = {
  id: string;
  sku: string;
  productName: string;
  variantName: string | null;
  onHand: number;
  reserved: number;
  hold: number;
  available: number;
  incoming: number;
  inTransit: number;
  minStock: number;
  status: "ok" | "low" | "out";
};

function format(value: number) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

export default function InventoryPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"ALL" | "ATTENTION">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(
          `/api/inventory/stock?${params.toString()}`,
          {
            cache: "no-store",
            headers: { "x-user-role": role },
            signal: controller.signal,
          },
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load inventory.");
        }
        setRows(payload.data ?? []);
      } catch (caught) {
        if ((caught as { name?: string }).name !== "AbortError") {
          setError(
            caught instanceof Error
              ? caught.message
              : "Failed to load inventory.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, role]);

  const visibleRows = useMemo(
    () =>
      view === "ATTENTION"
        ? rows.filter((row) => row.status !== "ok" || row.hold > 0)
        : rows,
    [rows, view],
  );

  return (
    <section className="space-y-6" data-testid="inventory-workspace">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--sc-color-divider)] pb-6">
        <div>
          <h1 className="text-[28px] font-semibold leading-9">Inventory</h1>
          <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
            Available = max(On Hand - Reserved - Hold, 0)
          </p>
        </div>
        <Link href="/purchasing/receiving" className="ios-primary-btn px-4">
          Receiving
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <span className="sr-only">Search inventory</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sc-color-text-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search SKU or product"
            className="ios-input pl-10 pr-3"
          />
        </label>
        <div className="inline-flex rounded-md border border-[var(--sc-color-border)] p-1">
          {(["ALL", "ATTENTION"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              className={`min-h-9 rounded px-3 text-sm ${
                view === option
                  ? "bg-[var(--sc-color-selected)] font-medium"
                  : "text-[var(--sc-color-text-secondary)]"
              }`}
            >
              {option === "ALL" ? "All" : "Needs Attention"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--sc-color-critical)] bg-[var(--sc-color-critical-surface)] px-4 py-3 text-sm text-[var(--sc-color-critical)]"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto border-y border-[var(--sc-color-divider)]">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--sc-color-text-secondary)]">
              <th className="px-3 py-3 font-medium">Product</th>
              <th className="px-3 py-3 font-medium">SKU</th>
              <th className="px-3 py-3 text-right font-medium">On Hand</th>
              <th className="px-3 py-3 text-right font-medium">Reserved</th>
              <th className="px-3 py-3 text-right font-medium">Hold</th>
              <th className="px-3 py-3 text-right font-medium">Available</th>
              <th className="px-3 py-3 text-right font-medium">Incoming</th>
              <th className="px-3 py-3 text-right font-medium">In Transit</th>
              <th className="px-3 py-3 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sc-color-divider)]">
            {loading ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-[var(--sc-color-text-secondary)]"
                >
                  Loading inventory...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-[var(--sc-color-text-secondary)]"
                >
                  No matching inventory.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-4">
                    <p className="font-medium">{row.productName}</p>
                    {row.variantName ? (
                      <p className="text-xs text-[var(--sc-color-text-secondary)]">
                        {row.variantName}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 font-mono text-xs">{row.sku}</td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {format(row.onHand)}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {format(row.reserved)}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {format(row.hold)}
                  </td>
                  <td className="px-3 py-4 text-right font-medium tabular-nums">
                    {format(row.available)}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {format(row.incoming)}
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums">
                    {format(row.inTransit)}
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={
                        row.hold > 0
                          ? "text-[var(--sc-color-warning)]"
                          : row.status === "out"
                            ? "text-[var(--sc-color-critical)]"
                            : row.status === "low"
                              ? "text-[var(--sc-color-blocking)]"
                              : "text-[var(--sc-color-success)]"
                      }
                    >
                      {row.hold > 0
                        ? "Hold"
                        : row.status === "out"
                          ? "Out"
                          : row.status === "low"
                            ? "Low"
                            : "Available"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
