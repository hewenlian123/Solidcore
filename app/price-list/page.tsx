"use client";

import { useMemo, useState } from "react";
import { Download, FileDown, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";

type PriceListRow = {
  id: string;
  sku: string;
  category: string;
  productName: string;
  variantText: string;
  description: string;
  cost: number;
  price: number;
  margin: number;
  availableStock: number;
};

type Mode = "internal" | "customer";

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function marginClass(value: number) {
  if (value > 40) return "text-emerald-400 font-semibold";
  if (value < 20) return "text-rose-400 font-semibold";
  return "text-slate-300 font-semibold";
}

function esc(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintHtml(rows: PriceListRow[], mode: Mode) {
  const showInternal = mode === "internal";
  const now = new Date().toLocaleString("en-US");
  const headers = showInternal
    ? ["SKU", "Product Name", "Variant", "Cost", "Price", "Margin %", "Available"]
    : ["SKU", "Product Name", "Variant", "Price"];
  const body = rows
    .map((row) => {
      if (!showInternal) {
        return `<tr>
          <td>${esc(row.sku)}</td>
          <td>${esc(row.productName)}</td>
          <td>${esc(row.variantText)}${row.description ? `<div style="margin-top:4px;color:#6b7280">${esc(row.description)}</div>` : ""}</td>
          <td style="text-align:right">${esc(money(row.price))}</td>
        </tr>`;
      }
      return `<tr>
        <td>${esc(row.sku)}</td>
        <td>${esc(row.productName)}</td>
        <td>${esc(row.variantText)}</td>
        <td style="text-align:right">${esc(money(row.cost))}</td>
        <td style="text-align:right">${esc(money(row.price))}</td>
        <td style="text-align:right">${esc(`${row.margin.toFixed(2)}%`)}</td>
        <td style="text-align:right">${esc(String(row.availableStock.toFixed(2)))}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
    <title>Price List</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 32px; }
      .title { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
      .meta { font-size: 12px; color: #6b7280; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; vertical-align: top; }
      th { background: #f3f4f6; color: #374151; text-align: left; font-weight: 700; }
      @media print { body { margin: 20px; } }
    </style>
  </head>
  <body>
    <div class="title">Price List (${showInternal ? "Internal" : "Customer"})</div>
    <div class="meta">Generated at ${esc(now)}</div>
    <table>
      <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`;
}

export default function PriceListPage() {
  const { role } = useRole();
  const [mode, setMode] = useState<Mode>("internal");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["price-list", role, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/price-list${queryStr}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch price list");
      return (payload.data ?? []) as PriceListRow[];
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const showInternal = mode === "internal";

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const exportRows = rows.map((row) =>
      showInternal
        ? {
            SKU: row.sku,
            "Product Name": row.productName,
            Variant: row.variantText,
            Cost: row.cost,
            Price: row.price,
            "Margin %": Number(row.margin.toFixed(2)),
            "Available Stock": Number(row.availableStock.toFixed(2)),
          }
        : {
            SKU: row.sku,
            "Product Name": row.productName,
            Variant: row.description ? `${row.variantText} | ${row.description}` : row.variantText,
            Price: row.price,
          },
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price List");
    XLSX.writeFile(wb, `price-list-${mode}.xlsx`);
  };

  const exportPdf = () => {
    const html = buildPrintHtml(rows, mode);
    const win = window.open("", "_blank", "noopener,noreferrer,width=1080,height=760");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  return (
    <section className="space-y-6">
      {/* Header — glass card */}
      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Price List</h1>
            <p className="mt-2 text-sm txt-secondary">
              Dual-mode professional price list with variant-level inventory visibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/[0.10] bg-white/[0.05] p-1 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setMode("internal")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${showInternal ? "so-chip-active" : "so-chip"}`}
              >
                Internal Mode
              </button>
              <button
                type="button"
                onClick={() => setMode("customer")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${!showInternal ? "so-chip-active" : "so-chip"}`}
              >
                Customer Mode
              </button>
            </div>
            <button type="button" onClick={exportPdf} className="ios-secondary-btn h-10 gap-2 px-4 text-sm">
              <FileDown className="h-4 w-4" />
              Export PDF
            </button>
            <button type="button" onClick={exportExcel} className="ios-secondary-btn h-10 gap-2 px-4 text-sm">
              <Download className="h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Search — glass card */}
      <div className="glass-card p-4">
        <label className="glass-card-content relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by SKU, product name, or variant"
            className="ios-input h-11 w-full pl-10"
          />
        </label>
      </div>

      {/* Table — glass card container */}
      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="h-12 px-6 text-left text-xs font-semibold uppercase tracking-wider">SKU</TableHead>
              <TableHead className="h-12 px-6 text-left text-xs font-semibold uppercase tracking-wider">Category</TableHead>
              <TableHead className="h-12 px-6 text-left text-xs font-semibold uppercase tracking-wider">Product Name</TableHead>
              <TableHead className="h-12 px-6 text-left text-xs font-semibold uppercase tracking-wider">Variant</TableHead>
              {showInternal ? <TableHead className="h-12 px-6 text-right text-xs font-semibold uppercase tracking-wider">Cost</TableHead> : null}
              <TableHead className="h-12 px-6 text-right text-xs font-semibold uppercase tracking-wider">Price</TableHead>
              {showInternal ? <TableHead className="h-12 px-6 text-right text-xs font-semibold uppercase tracking-wider">Margin %</TableHead> : null}
              {showInternal ? <TableHead className="h-12 px-6 text-right text-xs font-semibold uppercase tracking-wider">Available Stock</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              <TableSkeletonRows columns={showInternal ? 8 : 5} rows={10} rowClassName="border-white/10" />
            ) : rows.length === 0 ? (
              <TableRow className="border-white/10 hover:bg-white/[0.06]">
                <TableCell colSpan={showInternal ? 8 : 5} className="px-6 py-12 text-center txt-muted">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-white/10 txt-secondary transition-colors hover:bg-white/[0.06]"
                >
                  <TableCell className="px-6 py-4 font-semibold text-white">{row.sku}</TableCell>
                  <TableCell className="px-6 py-4 txt-muted">{row.category}</TableCell>
                  <TableCell className="px-6 py-4 font-medium text-white">{row.productName}</TableCell>
                  <TableCell className="px-6 py-4">
                    <div>{row.variantText}</div>
                    {!showInternal && row.description ? (
                      <div className="mt-1 text-xs txt-muted">{row.description}</div>
                    ) : null}
                  </TableCell>
                  {showInternal ? <TableCell className="px-6 py-4 text-right txt-muted">{money(row.cost)}</TableCell> : null}
                  <TableCell className="px-6 py-4 text-right font-semibold text-white">{money(row.price)}</TableCell>
                  {showInternal ? (
                    <TableCell className={`px-6 py-4 text-right ${marginClass(row.margin)}`}>{row.margin.toFixed(2)}%</TableCell>
                  ) : null}
                  {showInternal ? <TableCell className="px-6 py-4 text-right txt-muted">{row.availableStock.toFixed(2)}</TableCell> : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
