"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ReturnRow = {
  id: string;
  returnNumber: string;
  customerName: string;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  type: string;
  status: string;
  statusLabel?: string | null;
  refundTotal: number;
  createdAt: string;
};

type CreateData = {
  customers: Array<{ id: string; name: string }>;
  salesOrders: Array<{ id: string; orderNumber: string; customerId: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; salesOrderId: string; customerId: string | null }>;
  items: Array<{
    lineItemId: string;
    variantId: string | null;
    sku: string;
    title: string;
    qtyPurchased: number;
    unitPrice: number;
  }>;
};

type DraftItem = {
  lineItemId: string;
  qtyReturn: string;
  reason: string;
  condition: string;
};

const STATUS_OPTIONS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "APPROVED", label: "Approved" },
  { key: "RECEIVED", label: "Received" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "CLOSED", label: "Closed" },
  { key: "VOID", label: "Void" },
] as const;

function formatStatus(status: string) {
  return String(status ?? "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function AfterSalesReturnsContent() {
  const { role } = useRole();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["key"]>("ALL");
  const [openCreate, setOpenCreate] = useState(false);
  const [createData, setCreateData] = useState<CreateData | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    salesOrderId: "",
    invoiceId: "",
    returnType: "RETURN",
    refundMethod: "STORE_CREDIT",
    notes: "",
  });
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  const loadRows = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/returns?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load returns");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load returns");
    } finally {
      setLoading(false);
    }
  };

  const loadCreateData = async (nextForm: typeof form) => {
    const params = new URLSearchParams();
    if (nextForm.customerId) params.set("customerId", nextForm.customerId);
    if (nextForm.salesOrderId) params.set("salesOrderId", nextForm.salesOrderId);
    if (nextForm.invoiceId) params.set("invoiceId", nextForm.invoiceId);
    const res = await fetch(`/api/after-sales/returns/create-data?${params.toString()}`, {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load create options");
    const data = payload.data as CreateData;
    setCreateData(data);
    setDraftItems(
      (data.items ?? []).map((item) => ({
        lineItemId: item.lineItemId,
        qtyReturn: "",
        reason: "",
        condition: "",
      })),
    );
  };

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const shouldOpen = searchParams.get("openCreate") === "1";
    if (!shouldOpen) return;
    const nextForm = {
      customerId: String(searchParams.get("customerId") ?? "").trim(),
      salesOrderId: String(searchParams.get("salesOrderId") ?? "").trim(),
      invoiceId: String(searchParams.get("invoiceId") ?? "").trim(),
      returnType: "RETURN",
      refundMethod: "STORE_CREDIT",
      notes: "",
    };
    setForm(nextForm);
    setOpenCreate(true);
    void loadCreateData(nextForm).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load create options"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, role]);

  const openCreateDrawer = async () => {
    const nextForm = {
      customerId: "",
      salesOrderId: "",
      invoiceId: "",
      returnType: "RETURN",
      refundMethod: "STORE_CREDIT",
      notes: "",
    };
    setForm(nextForm);
    setOpenCreate(true);
    try {
      await loadCreateData(nextForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load create options");
    }
  };

  const salesOrderOptions = useMemo(
    () => (createData?.salesOrders ?? []).filter((row) => !form.customerId || row.customerId === form.customerId),
    [createData?.salesOrders, form.customerId],
  );
  const invoiceOptions = useMemo(() => {
    const list = createData?.invoices ?? [];
    return list.filter((row) => {
      if (form.salesOrderId && row.salesOrderId !== form.salesOrderId) return false;
      if (form.customerId && row.customerId && row.customerId !== form.customerId) return false;
      return true;
    });
  }, [createData?.invoices, form.customerId, form.salesOrderId]);

  const submitCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const sourceItems = createData?.items ?? [];
      const draftByLineItemId = new Map(draftItems.map((item) => [item.lineItemId, item]));
      const mappedItems = sourceItems.map((source) => {
        const draft = draftByLineItemId.get(source.lineItemId);
        return {
          variantId: source.variantId ?? null,
          lineItemId: source.lineItemId,
          title: source.title,
          sku: source.sku,
          qtyPurchased: Number(source.qtyPurchased ?? 0),
          qtyReturn: Number(draft?.qtyReturn ?? 0),
          unitPrice: Number(source.unitPrice ?? 0),
          reason: String(draft?.reason ?? "").trim() || "",
          condition: String(draft?.condition ?? "").trim() || "",
        };
      });
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          customerId: form.customerId,
          salesOrderId: form.salesOrderId,
          invoiceId: form.invoiceId,
          type: form.returnType,
          refundMethod: form.refundMethod,
          notes: form.notes,
          items: mappedItems,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create return");
      setOpenCreate(false);
      await loadRows();
      const returnId = String(payload?.data?.id ?? "").trim();
      if (returnId) window.location.href = `/after-sales/returns/${returnId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create return");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="glass-card p-4">
        <div className="glass-card-content flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">After-Sales Returns</h1>
            <p className="mt-1 text-sm text-slate-400">Manage return and exchange requests without affecting existing ticket board.</p>
          </div>
          <button type="button" onClick={openCreateDrawer} className="ios-primary-btn h-10 px-3 text-sm">
            Create Return
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}

      <div className="glass-card p-4">
        <div className="glass-card-content mb-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Return # / customer / SO / invoice"
            className="ios-input h-10 min-w-[260px] flex-1 px-3 text-sm"
          />
          {STATUS_OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatusFilter(item.key)}
              className={`rounded-xl px-3 py-1.5 text-xs ${
                statusFilter === item.key
                  ? "border border-white/[0.16] bg-white/[0.10] text-white"
                  : "border border-white/[0.10] bg-white/[0.04] text-white/70 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="glass-card-content overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">Return #</TableHead>
                <TableHead className="text-slate-400">Customer</TableHead>
                <TableHead className="text-slate-400">Related SO #</TableHead>
                <TableHead className="text-slate-400">Related Invoice #</TableHead>
                <TableHead className="text-slate-400">Type</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-right text-slate-400">Refund Total</TableHead>
                <TableHead className="text-slate-400">Created Date</TableHead>
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={9} className="text-center text-slate-400">
                    Loading returns...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={9} className="text-center text-slate-400">
                    No returns found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                    <TableCell className="font-medium text-white">{row.returnNumber}</TableCell>
                    <TableCell className="text-slate-300">{row.customerName}</TableCell>
                    <TableCell>
                      {row.salesOrderId ? (
                        <Link href={`/sales-orders/${row.salesOrderId}`} className="text-white underline decoration-white/30 hover:decoration-white/70">
                          {row.salesOrderNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {row.invoiceId ? (
                        <Link href={`/invoices/${row.invoiceId}`} className="text-white underline decoration-white/30 hover:decoration-white/70">
                          {row.invoiceNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{row.type === "EXCHANGE" ? "Exchange" : "Return"}</TableCell>
                    <TableCell>{row.statusLabel ?? formatStatus(row.status)}</TableCell>
                    <TableCell className="text-right">${Number(row.refundTotal).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-400">{new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/after-sales/returns/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {openCreate ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Create Return</h2>
              <button type="button" onClick={() => setOpenCreate(false)} className="ios-secondary-btn h-9 px-3 text-sm">
                Close
              </button>
            </div>
            <form className="space-y-4" onSubmit={submitCreate}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Customer *</span>
                  <select
                    value={form.customerId}
                    onChange={async (event) => {
                      const next = { ...form, customerId: event.target.value, salesOrderId: "", invoiceId: "" };
                      setForm(next);
                      await loadCreateData(next);
                    }}
                    className="ios-input h-10 w-full px-3 text-sm"
                    required
                  >
                    <option value="">Select customer</option>
                    {(createData?.customers ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Type</span>
                  <select
                    value={form.returnType}
                    onChange={(event) => setForm((prev) => ({ ...prev, returnType: event.target.value }))}
                    className="ios-input h-10 w-full px-3 text-sm"
                  >
                    <option value="RETURN">Return</option>
                    <option value="EXCHANGE">Exchange</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Link Sales Order (optional)</span>
                  <select
                    value={form.salesOrderId}
                    onChange={async (event) => {
                      const next = { ...form, salesOrderId: event.target.value };
                      setForm(next);
                      await loadCreateData(next);
                    }}
                    className="ios-input h-10 w-full px-3 text-sm"
                  >
                    <option value="">None</option>
                    {salesOrderOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.orderNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Link Invoice (optional)</span>
                  <select
                    value={form.invoiceId}
                    onChange={async (event) => {
                      const next = { ...form, invoiceId: event.target.value };
                      setForm(next);
                      await loadCreateData(next);
                    }}
                    className="ios-input h-10 w-full px-3 text-sm"
                  >
                    <option value="">None</option>
                    {invoiceOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.invoiceNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs text-slate-400">Refund Method</span>
                  <select
                    value={form.refundMethod}
                    onChange={(event) => setForm((prev) => ({ ...prev, refundMethod: event.target.value }))}
                    className="ios-input h-10 w-full px-3 text-sm"
                  >
                    <option value="STORE_CREDIT">Store Credit</option>
                    <option value="REFUND_PAYMENT">Refund Payment</option>
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
                <h3 className="text-sm font-semibold text-white">Items (Preview)</h3>
                <p className="mb-2 text-xs text-slate-400">
                  Loaded from linked sales order or invoice if provided.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-slate-400">
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2">SKU</th>
                        <th className="py-1 pr-2 text-right">Qty Purchased</th>
                        <th className="py-1 pr-2 text-right">Qty Return</th>
                        <th className="py-1 pr-2">Reason</th>
                        <th className="py-1">Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(createData?.items ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-2 text-center text-slate-400">
                            No linked items.
                          </td>
                        </tr>
                      ) : (
                        (createData?.items ?? []).map((item, idx) => (
                          <tr key={item.lineItemId} className="border-b border-white/10">
                            <td className="py-1 pr-2">{item.title}</td>
                            <td className="py-1 pr-2">{item.sku}</td>
                            <td className="py-1 pr-2 text-right">{Number(item.qtyPurchased).toFixed(2)}</td>
                            <td className="py-1 pr-2">
                              <input
                                value={draftItems[idx]?.qtyReturn ?? ""}
                                onChange={(event) =>
                                  setDraftItems((prev) =>
                                    prev.map((row, i) => (i === idx ? { ...row, qtyReturn: event.target.value } : row)),
                                  )
                                }
                                type="number"
                                min="0"
                                step="0.01"
                                className="ios-input h-8 w-24 px-2 text-xs"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                value={draftItems[idx]?.reason ?? ""}
                                onChange={(event) =>
                                  setDraftItems((prev) =>
                                    prev.map((row, i) => (i === idx ? { ...row, reason: event.target.value } : row)),
                                  )
                                }
                                className="ios-input h-8 w-36 px-2 text-xs"
                              />
                            </td>
                            <td className="py-1">
                              <input
                                value={draftItems[idx]?.condition ?? ""}
                                onChange={(event) =>
                                  setDraftItems((prev) =>
                                    prev.map((row, i) => (i === idx ? { ...row, condition: event.target.value } : row)),
                                  )
                                }
                                className="ios-input h-8 w-28 px-2 text-xs"
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-slate-400">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder:text-white/40 backdrop-blur-xl"
                />
              </label>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpenCreate(false)} className="ios-secondary-btn h-10 px-3 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="ios-primary-btn h-10 px-3 text-sm disabled:opacity-60">
                  {saving ? "Saving..." : "Save Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AfterSalesReturnsPage() {
  return (
    <Suspense fallback={<section className="glass-card p-8 text-sm text-slate-400">Loading returns...</section>}>
      <AfterSalesReturnsContent />
    </Suspense>
  );
}
