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
  createdAt?: string;
  updatedAt?: string;
  markedOutAt?: string | null;
  markedDoneAt?: string | null;
  inventoryDeductedAt?: string | null;
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

  const itemProgress = useMemo(() => {
    const rows = data?.items ?? [];
    const total = rows.length;
    if (total === 0) return { total: 0, completed: 0, percent: 0 };
    let completed = 0;
    for (const row of rows) {
      const draft = itemDrafts[row.id];
      const fulfilled = Number(draft?.fulfilledQty ?? row.fulfilledQty ?? 0);
      const ordered = Number(row.orderedQty ?? 0);
      if (Number.isFinite(fulfilled) && Number.isFinite(ordered) && fulfilled >= ordered) completed += 1;
    }
    const percent = Math.round((completed / total) * 100);
    return { total, completed, percent };
  }, [data?.items, itemDrafts]);

  const fmtDateTime = (value: string | Date | null | undefined) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const timeline = useMemo(() => {
    const status = String(data?.status ?? "").toUpperCase();
    const hasAnyPicked = completionInfo.anyFulfilled;
    const isPackingOrBeyond = ["PACKING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "COMPLETED", "PARTIAL"].includes(status);
    const isReadyOrBeyond = ["READY", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "COMPLETED"].includes(status);
    const isOutOrPicked = ["OUT_FOR_DELIVERY", "OUT", "IN_PROGRESS"].includes(status) || Boolean(data?.markedOutAt);
    const isDone = ["DELIVERED", "PICKED_UP", "COMPLETED"].includes(status) || Boolean(data?.markedDoneAt);

    return [
      { key: "created", label: "Created", done: true, when: fmtDateTime(data?.createdAt) },
      { key: "picking", label: "Picking started", done: hasAnyPicked, when: "— (not tracked)" },
      { key: "packing", label: "Packing started", done: isPackingOrBeyond, when: status === "PACKING" ? "— (not tracked)" : isPackingOrBeyond ? "—" : "—" },
      { key: "ready", label: "Ready", done: isReadyOrBeyond, when: isReadyOrBeyond ? "— (not tracked)" : "—" },
      {
        key: "out",
        label: data?.type === "DELIVERY" ? "Out for delivery" : "Picked up",
        done: isOutOrPicked,
        when: data?.markedOutAt ? fmtDateTime(data.markedOutAt) : "—",
      },
      { key: "done", label: "Completed", done: isDone, when: data?.markedDoneAt ? fmtDateTime(data.markedDoneAt) : "—" },
    ];
  }, [completionInfo.anyFulfilled, data?.createdAt, data?.markedDoneAt, data?.markedOutAt, data?.status, data?.type]);

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

  if (loading) return <div className="glass-card p-8 text-sm text-slate-400">Loading fulfillment...</div>;
  if (!data) return <div className="glass-card p-8 text-sm text-slate-400">Fulfillment not found.</div>;

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>
      ) : null}
      <div className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Fulfillment · {data.id}</h1>
            <p className="mt-2 text-sm text-slate-400">
              SO: {data.salesOrder.orderNumber} · Customer: {data.salesOrder.customer?.name ?? "-"} · {data.type}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadge(data.status)}`}>
                {data.status}
              </span>
              {completionInfo.hasPartial ? (
                <span className="inline-flex rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200">
                  Partial fulfillment
                </span>
              ) : null}
              <span className="text-xs text-slate-400">
                {itemProgress.completed}/{itemProgress.total} items complete · {itemProgress.percent}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                style={{ width: `${Math.min(Math.max(itemProgress.percent, 0), 100)}%` }}
              />
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-white/80">Scheduled:</span>{" "}
                {fmtDateTime(data.scheduledAt ?? data.scheduledDate)}{" "}
                {data.timeWindow ? `(${data.timeWindow})` : ""}
              </p>
              {data.type === "DELIVERY" ? (
                <p>
                  <span className="font-semibold text-white/80">Driver:</span> {data.driverName || "—"}
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-white/80">Pickup contact:</span>{" "}
                  {data.pickupContact || "—"} {data.shiptoPhone ? `(${data.shiptoPhone})` : ""}
                </p>
              )}
              {data.type === "DELIVERY" ? (
                <p className="sm:col-span-2">
                  <span className="font-semibold text-white/80">Delivery notes:</span>{" "}
                  {data.shiptoNotes || "—"}
                </p>
              ) : (
                <p className="sm:col-span-2">
                  <span className="font-semibold text-white/80">Pickup notes:</span>{" "}
                  {data.notes || "—"}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <a
              href={`/api/fulfillments/${data.id}/pdf?type=pick&download=true`}
              target="_blank"
              rel="noopener noreferrer"
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Download Pick List
            </a>
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
            <a
              href={`/api/fulfillments/${data.id}/pdf?type=slip&download=true`}
              target="_blank"
              rel="noopener noreferrer"
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Download {data.type === "DELIVERY" ? "Delivery" : "Pickup"} Slip
            </a>
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

      <div className="glass-card p-8">
        <div className="glass-card-content">
          <h2 className="text-base font-semibold text-white">Timeline</h2>
          <p className="mt-1 text-xs text-slate-400">
            Best-effort history based on stored timestamps; some events are not timestamped in the current data model.
          </p>
          <div className="mt-4 grid gap-2">
            {timeline.map((step) => (
              <div
                key={step.key}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3 ${
                  step.done ? "bg-white/[0.04]" : "bg-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      step.done ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                  />
                  <span className="text-sm font-semibold text-white">{step.label}</span>
                </div>
                <span className="text-xs text-slate-400">{step.when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-8">
        <div className="glass-card-content">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Scheduled At
            <input
              type="datetime-local"
              value={metaForm.scheduledAt}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              className="ios-input mt-1 h-10 px-3 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Time Window
            <input
              value={metaForm.timeWindow}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, timeWindow: e.target.value }))}
              className="ios-input mt-1 h-10 px-3 text-sm"
              placeholder="8-10am"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Driver
            <input
              value={metaForm.driverName}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, driverName: e.target.value }))}
              className="ios-input mt-1 h-10 px-3 text-sm"
            />
          </label>
          {data.type === "PICKUP" ? (
            <label className="block text-xs text-slate-400">
              Pickup Contact
              <input
                value={metaForm.pickupContact}
                onChange={(e) => setMetaForm((prev) => ({ ...prev, pickupContact: e.target.value }))}
                className="ios-input mt-1 h-10 px-3 text-sm"
              />
            </label>
          ) : (
            <label className="block text-xs text-slate-400">
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
              <label className="block text-xs text-slate-400">
                Ship-to Phone
                <input
                  value={metaForm.shiptoPhone}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoPhone: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Address 1
                <input
                  value={metaForm.shiptoAddress1}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoAddress1: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Address 2
                <input
                  value={metaForm.shiptoAddress2}
                  onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoAddress2: e.target.value }))}
                  disabled={!canEditShipto}
                  className="ios-input mt-1 h-10 px-3 text-sm"
                />
              </label>
              <div className="grid grid-cols-3 gap-2 md:col-span-2">
                <label className="block text-xs text-slate-400">
                  City
                  <input
                    value={metaForm.shiptoCity}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoCity: e.target.value }))}
                    disabled={!canEditShipto}
                    className="ios-input mt-1 h-10 px-3 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  State
                  <input
                    value={metaForm.shiptoState}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoState: e.target.value }))}
                    disabled={!canEditShipto}
                    className="ios-input mt-1 h-10 px-3 text-sm"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Zip
                  <input
                    value={metaForm.shiptoZip}
                    onChange={(e) => setMetaForm((prev) => ({ ...prev, shiptoZip: e.target.value }))}
                    disabled={!canEditShipto}
                    className="ios-input mt-1 h-10 px-3 text-sm"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-400 md:col-span-2">
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
          <label className="block text-xs text-slate-400 md:col-span-2">
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
      </div>

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-semibold text-white">Fulfillment Items</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">Title</TableHead>
              <TableHead className="text-slate-400">SKU</TableHead>
              <TableHead className="text-right text-slate-400">Ordered</TableHead>
              <TableHead className="text-right text-slate-400">Fulfilled</TableHead>
              <TableHead className="text-right text-slate-400">Remaining</TableHead>
              <TableHead className="text-slate-400">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const draft = itemDrafts[item.id] ?? { fulfilledQty: String(item.fulfilledQty ?? "0"), notes: item.notes ?? "" };
              const ordered = Number(item.orderedQty ?? 0);
              const fulfilled = Number(draft.fulfilledQty || 0);
              const remaining = Math.max(ordered - fulfilled, 0);
              return (
                <TableRow key={item.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                  <TableCell className="font-medium text-white">
                    {item.title}
                    <span className="ml-1 text-xs text-slate-400">({item.unit})</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">{item.sku || "-"}</TableCell>
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
        <div className="border-t border-white/10 px-6 py-4">
          <button type="button" onClick={saveItems} disabled={saving} className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60">
            Save Items
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Saving items auto-updates status to <span className="font-semibold">partial</span> or{" "}
            <span className="font-semibold">completed</span> based on fulfilled quantity.
          </p>
        </div>
      </div>
      </div>

      <div className="glass-card p-4 text-xs text-slate-400">
        <div className="glass-card-content">
          Link back:{" "}
          <Link href={`/sales-orders/${data.salesOrder.id}`} className="font-medium text-white underline">
            Sales Order
          </Link>
        </div>
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
