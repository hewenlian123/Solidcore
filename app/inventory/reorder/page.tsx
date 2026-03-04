"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/layout/role-provider";
import { COMPANY_SETTINGS } from "@/lib/company-settings";

type ReorderRow = {
  id: string;
  sku: string;
  variantName: string;
  productId: string;
  supplierId: string | null;
  supplierName: string;
  supplierContactName?: string | null;
  supplierPhone?: string | null;
  isFlooring: boolean;
  availableBoxes: number;
  reorderLevelBoxes: number;
  reorderQtyBoxes: number;
  suggestedQtyBoxes: number;
  sqftPerBox: number;
  suggestedQtySqft: number | null;
  unitCost: number;
  lowStock: boolean;
};

export default function InventoryReorderPage() {
  const { role } = useRole();
  const [supplierId, setSupplierId] = useState("ALL");
  const [lowOnly, setLowOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [exportingSupplierKey, setExportingSupplierKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reorderQuery = useQuery({
    queryKey: ["reorder-list", role, supplierId, lowOnly, query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (supplierId !== "ALL") params.set("supplierId", supplierId);
      params.set("lowOnly", String(lowOnly));
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/inventory/reorder?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load reorder list");
      return payload as {
        data: ReorderRow[];
        meta: { supplierOptions: Array<{ id: string; name: string }>; total: number };
      };
    },
  });

  const rows = reorderQuery.data?.data ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, ReorderRow[]>();
    for (const row of rows) {
      const key = row.supplierId ?? "UNASSIGNED";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      supplierName: list[0]?.supplierName ?? "Unassigned",
      rows: list,
    }));
  }, [rows]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleRow = (id: string, enabled: boolean) => {
    setSelectedIds((prev) => {
      if (enabled) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((item) => item !== id);
    });
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportSupplierCsv = (group: { key: string; supplierName: string; rows: ReorderRow[] }) => {
    const header = ["sku", "item_name", "qty_boxes", "qty_sqft", "unit_cost", "notes"];
    const lines = [header.join(",")];
    for (const row of group.rows) {
      const values = [
        row.sku,
        row.variantName,
        String(Math.ceil(Number(row.suggestedQtyBoxes ?? 0))),
        row.suggestedQtySqft != null ? Number(row.suggestedQtySqft).toFixed(2) : "",
        row.unitCost > 0 ? Number(row.unitCost).toFixed(2) : "",
        String(lineNotes[row.id] ?? "").trim(),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(values.join(","));
    }
    const csv = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const safeSupplier = group.supplierName.replace(/[^\w\-]+/g, "-").slice(0, 40) || "supplier";
    downloadBlob(csv, `reorder-${safeSupplier}.csv`);
  };

  const exportSupplierPdf = async (group: { key: string; supplierName: string; rows: ReorderRow[] }) => {
    try {
      setExportingSupplierKey(group.key);
      const first = group.rows[0];
      const res = await fetch("/api/pdf/reorder-supplier?download=true", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          supplierName: group.supplierName,
          supplierContactName: first?.supplierContactName ?? null,
          supplierPhone: first?.supplierPhone ?? null,
          items: group.rows.map((row) => ({
            sku: row.sku,
            itemName: row.variantName,
            qtyBoxes: row.suggestedQtyBoxes,
            qtySqft: row.suggestedQtySqft,
            unitCost: row.unitCost,
            notes: lineNotes[row.id] ?? "",
          })),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to export supplier PDF");
      }
      const blob = await res.blob();
      const safeSupplier = group.supplierName.replace(/[^\w\-]+/g, "-").slice(0, 40) || "supplier";
      downloadBlob(blob, `reorder-${safeSupplier}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export supplier PDF");
    } finally {
      setExportingSupplierKey(null);
    }
  };

  const copySupplierEmailTemplate = async (group: { supplierName: string; rows: ReorderRow[] }) => {
    try {
      const today = new Date().toLocaleDateString("en-US", { timeZone: "UTC" });
      const totalBoxes = group.rows.reduce((sum, row) => sum + Math.ceil(Number(row.suggestedQtyBoxes ?? 0)), 0);
      const subject = `Reorder / PO Request - ${COMPANY_SETTINGS.name} - ${today}`;
      const body =
        `Hello ${group.supplierName},\n\n` +
        `Please find our reorder request summary below.\n` +
        `Total requested quantity: ${totalBoxes} boxes.\n\n` +
        `A detailed PDF request is attached for your reference.\n` +
        `Requested delivery date: __________________\n\n` +
        `Please confirm availability and lead time.\n\n` +
        `Best regards,\n` +
        `${COMPANY_SETTINGS.name}\n` +
        `${COMPANY_SETTINGS.phone}\n` +
        `${COMPANY_SETTINGS.email}`;
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setNotice("Email template copied to clipboard.");
    } catch {
      setError("Failed to copy email template.");
    }
  };

  const createDraftPo = async () => {
    try {
      setSubmitting(true);
      setError(null);
      setNotice(null);
      const selectedRows = rows.filter((row) => selectedSet.has(row.id) && row.supplierId);
      if (selectedRows.length === 0) {
        setError("Select at least one supplier-linked row first.");
        return;
      }
      const res = await fetch("/api/procurements/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          items: selectedRows.map((row) => ({
            variantId: row.id,
            supplierId: row.supplierId,
            sku: row.sku,
            variantName: row.variantName,
            suggestedQtyBoxes: row.suggestedQtyBoxes,
            suggestedQtySqft: row.suggestedQtySqft,
            unitCost: row.unitCost,
            lineNotes: lineNotes[row.id] ?? null,
          })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create draft purchase order");
      setNotice(`Draft PO created: ${Number(payload?.data?.createdCount ?? 0)} supplier draft(s).`);
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create draft purchase order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reorder List</h1>
        <p className="mt-2 text-sm text-slate-500">
          Suggested replenishment by supplier, based on available boxes and reorder levels.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="ios-input h-9 min-w-[220px] bg-white px-3 text-sm"
          >
            <option value="ALL">All suppliers</option>
            {(reorderQuery.data?.meta?.supplierOptions ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low only
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU or name"
            className="ios-input h-9 w-full md:w-72"
          />
          <button
            type="button"
            onClick={createDraftPo}
            disabled={submitting || selectedIds.length === 0}
            className="ios-primary-btn h-9 px-3 text-sm disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Draft Purchase Order"}
          </button>
        </div>
        {notice ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {reorderQuery.isLoading ? (
          <div className="linear-card p-6 text-sm text-slate-500">Loading reorder list...</div>
        ) : grouped.length === 0 ? (
          <div className="linear-card p-6 text-sm text-slate-500">No reorder rows found.</div>
        ) : (
          grouped.map((group) => {
            const selectedRows = group.rows.filter((row) => selectedSet.has(row.id));
            const subtotalBoxes = selectedRows.reduce((sum, row) => sum + Number(row.suggestedQtyBoxes ?? 0), 0);
            const subtotalCost = selectedRows.reduce(
              (sum, row) => sum + Number(row.suggestedQtyBoxes ?? 0) * Number(row.unitCost ?? 0),
              0,
            );
            return (
              <div key={group.key} className="linear-card overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{group.supplierName}</p>
                    <p className="text-xs text-slate-600">
                      Selected: {subtotalBoxes.toFixed(0)} boxes
                      {subtotalCost > 0 ? ` · $${subtotalCost.toFixed(2)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportSupplierPdf(group)}
                      disabled={exportingSupplierKey === group.key || group.rows.length === 0}
                      className="ios-secondary-btn h-8 px-3 text-xs disabled:opacity-60"
                    >
                      {exportingSupplierKey === group.key ? "Exporting..." : "Export PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportSupplierCsv(group)}
                      disabled={group.rows.length === 0}
                      className="ios-secondary-btn h-8 px-3 text-xs disabled:opacity-60"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => copySupplierEmailTemplate(group)}
                      className="ios-secondary-btn h-8 px-3 text-xs"
                    >
                      Copy Email Template
                    </button>
                  </div>
                </div>
                <div className="overflow-auto">
                  <table className="w-full min-w-[1180px] table-fixed text-sm">
                    <thead className="bg-white">
                      <tr>
                        <th className="w-[56px] px-3 py-2 text-left font-medium text-slate-600">Select</th>
                        <th className="w-[220px] px-3 py-2 text-left font-medium text-slate-600">Variant</th>
                        <th className="w-[180px] px-3 py-2 text-left font-medium text-slate-600">SKU</th>
                        <th className="w-[130px] px-3 py-2 text-right font-medium text-slate-600">Available</th>
                        <th className="w-[150px] px-3 py-2 text-right font-medium text-slate-600">Reorder Level</th>
                        <th className="w-[160px] px-3 py-2 text-right font-medium text-slate-600">Suggested Order</th>
                        <th className="w-[150px] px-3 py-2 text-right font-medium text-slate-600">Suggested sqft</th>
                        <th className="w-[120px] px-3 py-2 text-right font-medium text-slate-600">Unit Cost</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Line Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              disabled={!row.supplierId}
                              checked={selectedSet.has(row.id)}
                              onChange={(e) => toggleRow(row.id, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-2 text-slate-800">{row.variantName}</td>
                          <td className="px-3 py-2 text-slate-700">{row.sku}</td>
                          <td className="px-3 py-2 text-right">{row.availableBoxes.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{row.reorderLevelBoxes.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">
                            {row.suggestedQtyBoxes.toFixed(0)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.isFlooring && row.suggestedQtySqft != null ? row.suggestedQtySqft.toFixed(2) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right">{row.unitCost > 0 ? `$${row.unitCost.toFixed(2)}` : "-"}</td>
                          <td className="px-3 py-2">
                            <input
                              value={lineNotes[row.id] ?? ""}
                              onChange={(e) => setLineNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              placeholder="Optional"
                              className="ios-input h-8 w-full"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

