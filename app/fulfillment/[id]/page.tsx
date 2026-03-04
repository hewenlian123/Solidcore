"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FulfillmentDetail = {
  id: string;
  type: "PICKUP" | "DELIVERY";
  status: string;
  scheduledAt: string | null;
  scheduledDate: string | null;
  timeWindow: string | null;
  driverName: string | null;
  pickupContact: string | null;
  shiptoName: string | null;
  shiptoPhone: string | null;
  shiptoAddress1: string | null;
  shiptoAddress2: string | null;
  shiptoCity: string | null;
  shiptoState: string | null;
  shiptoZip: string | null;
  shiptoNotes: string | null;
  address: string | null;
  notes: string | null;
  customer: { id: string; name: string; phone: string | null; address: string | null } | null;
  items: Array<{
    id: string;
    title: string;
    sku: string;
    unit: string;
    orderedQty: string;
    fulfilledQty: string;
    notes: string | null;
  }>;
  salesOrder: {
    id: string;
    orderNumber: string;
    status: string;
    customer: { id: string; name: string } | null;
    invoices?: Array<{ id: string; invoiceNumber: string }>;
  };
};

type ItemDraft = {
  fulfilledQty: string;
  notes: string;
};

export default function FulfillmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<FulfillmentDetail | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [metaForm, setMetaForm] = useState({
    scheduledAt: "",
    timeWindow: "",
    driverName: "",
    notes: "",
    pickupContact: "",
    shiptoName: "",
    shiptoPhone: "",
    shiptoAddress1: "",
    shiptoAddress2: "",
    shiptoCity: "",
    shiptoState: "",
    shiptoZip: "",
    shiptoNotes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; src: string } | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/fulfillments/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load fulfillment");
      const next: FulfillmentDetail = payload.data;
      setData(next);
      setItemDrafts(
        Object.fromEntries(
          next.items.map((item) => [
            item.id,
            {
              fulfilledQty: String(item.fulfilledQty ?? "0"),
              notes: String(item.notes ?? ""),
            },
          ]),
        ),
      );
      setMetaForm({
        scheduledAt: (next.scheduledAt ?? next.scheduledDate) ? new Date(next.scheduledAt ?? next.scheduledDate ?? "").toISOString().slice(0, 16) : "",
        timeWindow: next.timeWindow ?? "",
        driverName: next.driverName ?? "",
        notes: next.notes ?? "",
        pickupContact: next.pickupContact ?? "",
        shiptoName: next.shiptoName ?? "",
        shiptoPhone: next.shiptoPhone ?? "",
        shiptoAddress1: next.shiptoAddress1 ?? "",
        shiptoAddress2: next.shiptoAddress2 ?? "",
        shiptoCity: next.shiptoCity ?? "",
        shiptoState: next.shiptoState ?? "",
        shiptoZip: next.shiptoZip ?? "",
        shiptoNotes: next.shiptoNotes ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fulfillment");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void load();
  }, [id, role]);

  const completionInfo = useMemo(() => {
    const rows = data?.items ?? [];
      if (rows.length === 0) return { allCompleted: false, hasPartial: false, anyFulfilled: false };
    let allCompleted = true;
    let hasPartial = false;
      let anyFulfilled = false;
    for (const row of rows) {
      const draft = itemDrafts[row.id];
      const fulfilled = Number(draft?.fulfilledQty ?? row.fulfilledQty ?? 0);
      const ordered = Number(row.orderedQty ?? 0);
        if (fulfilled > 0) anyFulfilled = true;
      if (fulfilled < ordered) {
        allCompleted = false;
          if (fulfilled > 0) hasPartial = true;
      }
    }
    return { allCompleted, hasPartial, anyFulfilled };
  }, [data?.items, itemDrafts]);

  const canEditShipto = useMemo(() => {
    const key = String(data?.status ?? "").toUpperCase();
    return key === "DRAFT" || key === "SCHEDULED";
  }, [data?.status]);

  const updateStatus = async (status: string) => {
    if (!data) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/fulfillments/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update status");
      setSuccess("Status updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (status: "out_for_delivery" | "delivered" | "picked_up" | "completed") => {
    if (!data) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/fulfillments/${data.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update status");
      setSuccess("Status updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const saveMeta = async () => {
    if (!data) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch(`/api/fulfillments/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          scheduled_at: metaForm.scheduledAt ? new Date(metaForm.scheduledAt).toISOString() : null,
          time_window: metaForm.timeWindow,
          driver_name: metaForm.driverName,
          notes: metaForm.notes,
          pickup_contact: metaForm.pickupContact,
          shipto_name: metaForm.shiptoName,
          shipto_phone: metaForm.shiptoPhone,
          shipto_address1: metaForm.shiptoAddress1,
          shipto_address2: metaForm.shiptoAddress2,
          shipto_city: metaForm.shiptoCity,
          shipto_state: metaForm.shiptoState,
          shipto_zip: metaForm.shiptoZip,
          shipto_notes: metaForm.shiptoNotes,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to save fulfillment info");
      setSuccess("Fulfillment info saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fulfillment info");
    } finally {
      setSaving(false);
    }
  };

  const saveItems = async () => {
    if (!data) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      for (const item of data.items) {
        const draft = itemDrafts[item.id];
        if (!draft) continue;
        const changedQty = String(item.fulfilledQty ?? "0") !== String(draft.fulfilledQty ?? "0");
        const changedNotes = String(item.notes ?? "") !== String(draft.notes ?? "");
        if (!changedQty && !changedNotes) continue;
        const qty = Number(draft.fulfilledQty || 0);
        const ordered = Number(item.orderedQty || 0);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new Error(`Fulfilled qty for "${item.title}" must be >= 0.`);
        }
        if (qty > ordered) {
          throw new Error(`Fulfilled qty for "${item.title}" cannot exceed ordered qty.`);
        }
        const res = await fetch(`/api/fulfillment-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({
            fulfilledQty: qty,
            notes: draft.notes,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to update fulfillment item");
      }

      if (completionInfo.allCompleted) {
        await fetch(`/api/fulfillments/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({ status: "completed" }),
        });
      } else if (completionInfo.hasPartial || completionInfo.anyFulfilled) {
        await fetch(`/api/fulfillments/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({ status: "partial" }),
        });
      }
      setSuccess("Fulfillment items saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fulfillment items");
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: string) => {
    const key = status.toUpperCase();
    if (key === "COMPLETED") return "bg-emerald-100 text-emerald-700";
    if (key === "OUT" || key === "IN_PROGRESS" || key === "OUT_FOR_DELIVERY") return "bg-sky-100 text-sky-700";
    if (key === "DELIVERED" || key === "PICKED_UP") return "bg-emerald-100 text-emerald-700";
    if (key === "READY") return "bg-cyan-100 text-cyan-700";
    if (key === "PACKING") return "bg-violet-100 text-violet-700";
    if (key === "PARTIAL") return "bg-amber-100 text-amber-700";
    if (key === "CANCELLED") return "bg-slate-200 text-slate-600";
    return "bg-slate-100 text-slate-700";
  };

  if (loading) return <div className="linear-card p-8 text-sm text-slate-500">Loading fulfillment...</div>;
  if (!data) return <div className="linear-card p-8 text-sm text-slate-500">Fulfillment not found.</div>;

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}
      <div className="linear-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Fulfillment · {data.id}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              SO: {data.salesOrder.orderNumber} · Customer: {data.salesOrder.customer?.name ?? "-"} · {data.type}
            </p>
            <span className={`mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(data.status)}`}>
              {data.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPdfPreview({
                  title: "Pick List",
                  src: `/api/fulfillments/${data.id}/pdf?type=pick`,
                })
              }
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Pick List (PDF)
            </button>
            <button
              type="button"
              onClick={() =>
                setPdfPreview({
                  title: data.type === "DELIVERY" ? "Delivery Slip" : "Pickup Slip",
                  src: `/api/fulfillments/${data.id}/pdf?type=slip`,
                })
              }
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              {data.type === "DELIVERY" ? "Delivery Slip (PDF)" : "Pickup Slip (PDF)"}
            </button>
            <Link href={`/sales-orders/${data.salesOrder.id}`} className="ios-secondary-btn h-9 px-3 text-xs">
              View Sales Order
            </Link>
            {data.salesOrder.invoices && data.salesOrder.invoices.length > 0 ? (
              <Link href={`/invoices/${data.salesOrder.invoices[0].id}`} className="ios-secondary-btn h-9 px-3 text-xs">
                View Invoice
              </Link>
            ) : null}
            <Link href="/fulfillment" className="ios-secondary-btn h-9 px-3 text-xs">
              Fulfillment Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="linear-card p-8">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-slate-500">
            Scheduled At
            <input
              type="datetime-local"
              value={metaForm.scheduledAt}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              className="ios-input mt-1 h-10 px-3 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Time Window
            <input
              value={metaForm.timeWindow}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, timeWindow: e.target.value }))}
              className="ios-input mt-1 h-10 px-3 text-sm"
              placeholder="8-10am"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Driver
            <input
              value={metaForm.driverName}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, driverName: e.target.value }))}
              className="ios-input mt-1 h-10 px-3 text-sm"
            />
          </label>
          {data.type === "PICKUP" ? (
            <label className="block text-xs text-slate-500">
              Pickup Contact
              <input
                value={metaForm.pickupContact}
                onChange={(e) => setMetaForm((prev) => ({ ...prev, pickupContact: e.target.value }))}
                className="ios-input mt-1 h-10 px-3 text-sm"
              />
            </label>
          ) : (
            <label className="block text-xs text-slate-500">
              Ship-to Name
              <input
                value={metaForm.shiptoName}
                onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoName: e.target.value }))}
                disabled={!canEditShipto}
                className="ios-input mt-1 h-10 px-3 text-sm"
              />
            </label>
          )}
          {data.type === "DELIVERY" ? (
            <>
              <label className="block text-xs text-slate-500">
                Ship-to Phone
                <input
                  value={metaForm.shiptoPhone}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoPhone: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Address 1
                <input
                  value={metaForm.shiptoAddress1}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoAddress1: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Address 2
                <input
                  value={metaForm.shiptoAddress2}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoAddress2: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
              <div className="grid grid-cols-3 gap-2 md:col-span-2">
                <label className="block text-xs text-slate-500">
                  City
                  <input
                    value={metaForm.shiptoCity}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoCity: e.target.value }))}
                    disabled={!canEditShipto}
                    className="ios-input mt-1 h-10 px-3 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  State
                  <input
                    value={metaForm.shiptoState}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoState: e.target.value }))}
                    disabled={!canEditShipto}
                    className="ios-input mt-1 h-10 px-3 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Zip
                  <input
                    value={metaForm.shiptoZip}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoZip: e.target.value }))}
                    disabled={!canEditShipto}
                    className="ios-input mt-1 h-10 px-3 text-sm"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-500 md:col-span-2">
                Ship-to Notes
                <input
                  value={metaForm.shiptoNotes}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoNotes: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
            </>
          ) : null}
          <label className="block text-xs text-slate-500 md:col-span-2">
            Notes
            <textarea
              value={metaForm.notes}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="ios-input mt-1 h-auto min-h-[72px] p-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={saveMeta} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
            Save Info
          </button>
          <button type="button" onClick={() => updateStatus("packing")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
            Mark Packing
          </button>
          <button type="button" onClick={() => updateStatus("ready")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
            Mark Ready
          </button>
          {data.type === "DELIVERY" ? (
            <button type="button" onClick={() => quickStatus("out_for_delivery")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Mark Out
            </button>
          ) : (
            <button type="button" onClick={() => quickStatus("picked_up")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Mark Picked Up
            </button>
          )}
          {data.type === "DELIVERY" ? (
            <button type="button" onClick={() => quickStatus("delivered")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Mark Delivered
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => updateStatus("completed")}
            disabled={saving || !completionInfo.allCompleted}
            className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60"
          >
            Mark Completed
          </button>
          <button type="button" onClick={() => updateStatus("cancelled")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
            Cancel Fulfillment
          </button>
        </div>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Fulfillment Items</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Title</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Fulfilled</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const draft = itemDrafts[item.id] ?? { fulfilledQty: String(item.fulfilledQty ?? "0"), notes: item.notes ?? "" };
              const ordered = Number(item.orderedQty ?? 0);
              const fulfilled = Number(draft.fulfilledQty || 0);
              const remaining = Math.max(ordered - fulfilled, 0);
              return (
                <TableRow key={item.id} className="odd:bg-white even:bg-slate-50/40">
                  <TableCell className="font-medium text-slate-900">
                    {item.title}
                    <span className="ml-1 text-xs text-slate-500">({item.unit})</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{item.sku || "-"}</TableCell>
                  <TableCell className="text-right">{ordered.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.fulfilledQty}
                      onChange={(e) =>
                        setItemDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...(prev[item.id] ?? draft), fulfilledQty: e.target.value },
                        }))
                      }
                      className="ios-input ml-auto h-9 w-24 px-2 text-right text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-right">{remaining.toFixed(2)}</TableCell>
                  <TableCell>
                    <input
                      value={draft.notes}
                      onChange={(e) =>
                        setItemDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...(prev[item.id] ?? draft), notes: e.target.value },
                        }))
                      }
                      className="ios-input h-9 px-2 text-xs"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={saveItems} disabled={saving} className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60">
            Save Items
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Saving items auto-updates status to <span className="font-semibold">partial</span> or{" "}
            <span className="font-semibold">completed</span> based on fulfilled quantity.
          </p>
        </div>
      </div>
      <div className="linear-card p-4 text-xs text-slate-500">
        Link back: <Link href={`/sales-orders/${data.salesOrder.id}`} className="font-medium text-slate-700 underline">Sales Order</Link>
      </div>
      <PDFPreviewModal
        open={Boolean(pdfPreview)}
        title={pdfPreview?.title ?? "PDF Preview"}
        src={pdfPreview?.src ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </section>
  );
}
