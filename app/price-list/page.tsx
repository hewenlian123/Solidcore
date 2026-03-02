"use client";

import { useMemo, useState } from "react";
import { Download, FileDown, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  if (value > 40) return "text-emerald-700 font-semibold";
  if (value < 20) return "text-rose-600 font-semibold";
  return "text-slate-600 font-semibold";
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
      <div className="linear-card p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Price List</h1>
            <p className="mt-2 text-sm text-slate-500">
              Dual-mode professional price list with variant-level inventory visibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("internal")}
              className={`h-10 rounded-lg px-4 text-sm ${showInternal ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
            >
              Internal Mode
            </button>
            <button
              type="button"
              onClick={() => setMode("customer")}
              className={`h-10 rounded-lg px-4 text-sm ${!showInternal ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
            >
              Customer Mode
            </button>
            <button type="button" onClick={exportPdf} className="ios-secondary-btn h-10 px-3 text-sm">
              <FileDown className="mr-1.5 h-4 w-4" />
              Export PDF
            </button>
            <button type="button" onClick={exportExcel} className="ios-secondary-btn h-10 px-3 text-sm">
              <Download className="mr-1.5 h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      <div className="linear-card p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by SKU, product name, or variant"
            className="ios-input h-11 w-full pl-10"
          />
        </label>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead>Variant</TableHead>
              {showInternal ? <TableHead>Cost</TableHead> : null}
              <TableHead>Price</TableHead>
              {showInternal ? <TableHead>Margin %</TableHead> : null}
              {showInternal ? <TableHead>Available Stock</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              <TableRow>
                <TableCell colSpan={showInternal ? 8 : 5} className="text-center text-slate-500">
                  Loading price list...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showInternal ? 8 : 5} className="text-center text-slate-500">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                  <TableCell className="font-semibold text-slate-900">{row.sku}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>
                    <div>{row.variantText}</div>
                    {!showInternal && row.description ? (
                      <div className="mt-1 text-xs text-slate-500">{row.description}</div>
                    ) : null}
                  </TableCell>
                  {showInternal ? <TableCell>{money(row.cost)}</TableCell> : null}
                  <TableCell className="font-semibold text-slate-900">{money(row.price)}</TableCell>
                  {showInternal ? (
                    <TableCell className={marginClass(row.margin)}>{row.margin.toFixed(2)}%</TableCell>
                  ) : null}
                  {showInternal ? <TableCell>{row.availableStock.toFixed(2)}</TableCell> : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
