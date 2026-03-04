"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ReturnDetail = {
  id: string;
  status: "DRAFT" | "COMPLETED" | "CANCELLED";
  reason: string | null;
  issueStoreCredit: boolean;
  creditAmount: string;
  completedAt: string | null;
  createdAt: string;
  salesOrder: {
    id: string;
    orderNumber: string;
    customer: { id: string; name: string; phone: string | null } | null;
  };
  fulfillment: { id: string; status: string; type: string } | null;
  items: Array<{
    id: string;
    qty: string;
    fulfillmentItem: {
      id: string;
      title: string;
      sku: string;
      unit: string;
      orderedQty?: string;
      fulfilledQty?: string;
    };
    variant: { id: string; sku: string; displayName: string | null };
  }>;
};

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<ReturnDetail | null>(null);
  const [reason, setReason] = useState("");
  const [issueStoreCredit, setIssueStoreCredit] = useState(false);
  const [creditAmount, setCreditAmount] = useState("0");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openAddItems, setOpenAddItems] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerFulfillmentId, setPickerFulfillmentId] = useState("");
  const [pickerItems, setPickerItems] = useState<
    Array<{
      fulfillmentItemId: string;
      variantId: string;
      title: string;
      sku: string;
      fulfilledQty: number;
      alreadyReturnedQty: number;
      maxReturnable: number;
      currentReturnQty: number;
    }>
  >([]);
  const [pickerQtyDrafts, setPickerQtyDrafts] = useState<Record<string, string>>({});
  const [pickerFulfillments, setPickerFulfillments] = useState<
    Array<{ id: string; type: string; status: string; scheduledAt: string | null; scheduledDate: string | null }>
  >([]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/returns/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load return");
      const next = payload.data as ReturnDetail;
      setData(next);
      setReason(next.reason ?? "");
      setIssueStoreCredit(Boolean(next.issueStoreCredit));
      setCreditAmount(String(next.creditAmount ?? "0"));
      setQtyDrafts(
        Object.fromEntries(next.items.map((item) => [item.id, String(item.qty ?? "0")])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load return");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const isLocked = useMemo(() => data?.status === "COMPLETED" || data?.status === "CANCELLED", [data?.status]);

  const loadPicker = async (targetFulfillmentId?: string) => {
    if (!data) return;
    try {
      setPickerLoading(true);
      setPickerError(null);
      const params = new URLSearchParams();
      const chosen = targetFulfillmentId ?? pickerFulfillmentId ?? data.fulfillment?.id ?? "";
      if (chosen) params.set("fulfillmentId", chosen);
      const res = await fetch(`/api/returns/${data.id}/picker-items?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load fulfillment items");
      const nextItems = payload.data?.items ?? [];
      setPickerItems(nextItems);
      setPickerFulfillments(payload.data?.availableFulfillments ?? []);
      setPickerFulfillmentId(payload.data?.fulfillmentId ?? chosen ?? "");
      setPickerQtyDrafts(
        Object.fromEntries(
          nextItems.map((item: { fulfillmentItemId: string }) => [item.fulfillmentItemId, "0"]),
        ),
      );
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : "Failed to load fulfillment items");
    } finally {
      setPickerLoading(false);
    }
  };

  const openAddItemsModal = async () => {
    setOpenAddItems(true);
    await loadPicker();
  };

  const addPickedItems = async () => {
    if (!data) return;
    try {
      setPickerSaving(true);
      setPickerError(null);
      const rows = pickerItems
        .map((item) => ({
          fulfillmentItemId: item.fulfillmentItemId,
          qty: Number(pickerQtyDrafts[item.fulfillmentItemId] ?? 0),
          max: Number(item.maxReturnable ?? 0),
        }))
        .filter((row) => row.qty > 0);
      if (rows.length === 0) throw new Error("Enter return qty for at least one item.");
      for (const row of rows) {
        if (!Number.isFinite(row.qty) || row.qty <= 0) throw new Error("Return qty must be > 0.");
        if (row.qty > row.max + 0.0001) throw new Error(`Return qty exceeds max returnable (${row.max.toFixed(2)}).`);
      }
      const res = await fetch(`/api/returns/${data.id}/picker-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          fulfillmentId: pickerFulfillmentId || undefined,
          items: rows,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add return items.");
      setSuccess("Return items added.");
      setOpenAddItems(false);
      await load();
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : "Failed to add return items");
    } finally {
      setPickerSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!data) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const items = data.items.map((item) => ({
        id: item.id,
        qty: Number(qtyDrafts[item.id] ?? item.qty ?? 0),
      }));
      const res = await fetch(`/api/returns/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          reason,
          issueStoreCredit,
          creditAmount: Number(creditAmount || 0),
          items,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to save return");
      setSuccess("Return saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save return");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (status: "completed" | "cancelled") => {
    if (!data) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const items = data.items.map((item) => ({
        id: item.id,
        qty: Number(qtyDrafts[item.id] ?? item.qty ?? 0),
      }));
      const res = await fetch(`/api/returns/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          status,
          reason,
          issueStoreCredit,
          creditAmount: Number(creditAmount || 0),
          items,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update return status");
      setSuccess(status === "completed" ? "Return completed and inventory restored." : "Return cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update return status");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="linear-card p-8 text-sm text-slate-500">Loading return...</div>;
  if (!data) return <div className="linear-card p-8 text-sm text-slate-500">Return not found.</div>;

  return (
    <section className="space-y-6">
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="linear-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Return · {data.id}</h1>
            <p className="mt-2 text-sm text-slate-500">
              SO: {data.salesOrder.orderNumber} · Customer: {data.salesOrder.customer?.name ?? "-"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Fulfillment: {data.fulfillment?.id ?? "-"} · Status: {data.status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/sales-orders/${data.salesOrder.id}`} className="ios-secondary-btn h-9 px-3 text-xs">
              View Sales Order
            </Link>
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving || isLocked}
              className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => void openAddItemsModal()}
              disabled={saving || isLocked}
              className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              Add Items
            </button>
            <button
              type="button"
              onClick={() => updateStatus("completed")}
              disabled={saving || isLocked}
              className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              Complete Return
            </button>
            <button
              type="button"
              onClick={() => updateStatus("cancelled")}
              disabled={saving || isLocked}
              className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              Cancel Return
            </button>
          </div>
        </div>
      </div>

      <div className="linear-card p-8">
        <label className="block text-xs text-slate-500">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLocked}
            className="ios-input mt-1 h-auto min-h-[72px] p-3 text-sm"
          />
        </label>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={issueStoreCredit}
              onChange={(e) => setIssueStoreCredit(e.target.checked)}
              disabled={isLocked}
            />
            Issue Store Credit
          </label>
          <label className="block text-xs text-slate-500">
            Credit Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              disabled={isLocked || !issueStoreCredit}
              className="ios-input mt-1 h-10 w-full px-3 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Return Items</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Item</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Fulfilled</TableHead>
              <TableHead className="text-right">Return Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500">
                  No fulfillment items available for return.
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => (
                <TableRow key={item.id} className="odd:bg-white even:bg-slate-50/40">
                  <TableCell className="font-medium text-slate-900">
                    {item.fulfillmentItem.title}
                    <span className="ml-1 text-xs text-slate-500">({item.fulfillmentItem.unit})</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{item.fulfillmentItem.sku || item.variant.sku || "-"}</TableCell>
                  <TableCell className="text-right">{Number(item.fulfillmentItem.fulfilledQty ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={qtyDrafts[item.id] ?? item.qty}
                      onChange={(e) => setQtyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      disabled={isLocked}
                      className="ios-input ml-auto h-9 w-24 px-2 text-right text-xs"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {openAddItems ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-4">
          <div className="linear-card w-full max-w-5xl p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Add Items from Fulfillment</h3>
              <button
                type="button"
                onClick={() => setOpenAddItems(false)}
                className="ios-secondary-btn h-9 px-3 text-xs"
              >
                Close
              </button>
            </div>
            {pickerError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {pickerError}
              </div>
            ) : null}
            {!pickerFulfillmentId ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Select a fulfillment to add items.
              </div>
            ) : null}
            <div className="mb-3">
              <label className="block text-xs text-slate-500">
                Fulfillment
                <select
                  value={pickerFulfillmentId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPickerFulfillmentId(next);
                    void loadPicker(next);
                  }}
                  className="ios-input mt-1 h-10 w-full bg-white px-3 text-sm"
                >
                  <option value="">Select fulfillment</option>
                  {pickerFulfillments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.type} · {item.status} ·{" "}
                      {item.scheduledAt || item.scheduledDate
                        ? new Date(item.scheduledAt ?? item.scheduledDate ?? "").toLocaleDateString("en-US", { timeZone: "UTC" })
                        : "-"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead>Item</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Fulfilled Qty</TableHead>
                    <TableHead className="text-right">Already Returned</TableHead>
                    <TableHead className="text-right">Max Returnable</TableHead>
                    <TableHead className="text-right">Return Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pickerLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500">
                        Loading fulfillment items...
                      </TableCell>
                    </TableRow>
                  ) : pickerItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500">
                        No fulfillment items available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pickerItems.map((item) => (
                      <TableRow key={item.fulfillmentItemId} className="odd:bg-white even:bg-slate-50/40">
                        <TableCell className="font-medium text-slate-900">{item.title}</TableCell>
                        <TableCell className="text-xs text-slate-500">{item.sku || "-"}</TableCell>
                        <TableCell className="text-right">{item.fulfilledQty.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{item.alreadyReturnedQty.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{item.maxReturnable.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={item.maxReturnable}
                            value={pickerQtyDrafts[item.fulfillmentItemId] ?? "0"}
                            onChange={(e) =>
                              setPickerQtyDrafts((prev) => ({
                                ...prev,
                                [item.fulfillmentItemId]: e.target.value,
                              }))
                            }
                            className="ios-input ml-auto h-9 w-24 px-2 text-right text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenAddItems(false)}
                className="ios-secondary-btn h-9 px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addPickedItems}
                disabled={pickerSaving || pickerLoading}
                className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60"
              >
                {pickerSaving ? "Adding..." : "Add Selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
