"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  events: Array<{
    id: string;
    method: "PICKUP" | "DELIVERY";
    actor: string;
    jobSiteName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    occurredAt: string;
    items: Array<{
      id: string;
      title: string;
      sku: string;
      unit: string;
      quantity: string;
      priorFulfilledQty: string;
      newFulfilledQty: string;
      remainingQty: string;
    }>;
  }>;
  customer: { id: string; name: string; phone: string | null; address: string | null } | null;
  items: Array<{
    id: string;
    title: string;
    sku: string;
    unit: string;
    orderedQty: string;
    fulfilledQty: string;
    notes: string | null;
    salesOrderItem?: {
      isSpecialOrder: boolean;
      specialOrderStatus: string | null;
      specialFollowupDate: string | null;
      linkedPo: {
        poNumber: string;
        status: string;
        expectedArrival: string | null;
        supplier: { name: string } | null;
      } | null;
    } | null;
  }>;
  salesOrder: {
    id: string;
    orderNumber: string;
    status: string;
    specialOrder?: boolean;
    specialOrderStatus?: string | null;
    etaDate?: string | null;
    supplier?: { name: string } | null;
    customer: { id: string; name: string; phone?: string | null } | null;
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
  const mutationInFlightRef = useRef(false);

  const isPickup = data?.type === "PICKUP";
  const isDelivery = data?.type === "DELIVERY";
  const fulfillmentStatus = String(data?.status ?? "").toUpperCase();
  const pickupCanComplete = isPickup && ["READY", "PARTIAL"].includes(fulfillmentStatus);
  const pickupClosed = isPickup && ["PICKED_UP", "COMPLETED"].includes(fulfillmentStatus);
  const deliveryCanStart = isDelivery && fulfillmentStatus === "READY";
  const deliveryCanComplete =
    isDelivery && ["READY", "OUT_FOR_DELIVERY", "IN_PROGRESS", "PARTIAL"].includes(fulfillmentStatus);
  const deliveryClosed = isDelivery && ["DELIVERED", "COMPLETED"].includes(fulfillmentStatus);

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
          next.items.map((item) => {
            const status = String(next.status ?? "").toUpperCase();
            const prefillFull =
              (next.type === "PICKUP" && ["READY", "PARTIAL"].includes(status)) ||
              (next.type === "DELIVERY" &&
                ["READY", "OUT_FOR_DELIVERY", "IN_PROGRESS", "PARTIAL"].includes(status));
            return [
              item.id,
              {
                fulfilledQty: prefillFull
                  ? String(item.orderedQty ?? "0")
                  : String(item.fulfilledQty ?? "0"),
                notes: String(item.notes ?? ""),
              },
            ];
          }),
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
      const fulfilled = Number(row.fulfilledQty ?? 0);
      const ordered = Number(row.orderedQty ?? 0);
      if (Number.isFinite(fulfilled) && Number.isFinite(ordered) && fulfilled >= ordered) completed += 1;
    }
    const percent = Math.round((completed / total) * 100);
    return { total, completed, percent };
  }, [data?.items]);

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

  const fmtQty = (value: string | number | null | undefined) => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return "0";
    return numeric.toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    });
  };

  const specialOrderSummary = useMemo(() => {
    const specialItems = (data?.items ?? []).filter((item) => item.salesOrderItem?.isSpecialOrder);
    if (!data?.salesOrder.specialOrder && specialItems.length === 0) return null;
    const linkedPo = specialItems.find((item) => item.salesOrderItem?.linkedPo)?.salesOrderItem?.linkedPo;
    return {
      lineCount: specialItems.length,
      status:
        specialItems.find((item) => item.salesOrderItem?.specialOrderStatus)?.salesOrderItem?.specialOrderStatus ??
        data?.salesOrder.specialOrderStatus ??
        "Special Order",
      supplier: linkedPo?.supplier?.name ?? data?.salesOrder.supplier?.name ?? null,
      eta: linkedPo?.expectedArrival ?? data?.salesOrder.etaDate ?? null,
    };
  }, [data?.items, data?.salesOrder]);

  const deliveryAddressText = useMemo(() => {
    if (!data || data.type !== "DELIVERY") return "";
    return [
      data.shiptoAddress1,
      data.shiptoAddress2,
      [data.shiptoCity, data.shiptoState, data.shiptoZip].filter(Boolean).join(" "),
    ]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }, [data]);

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

  const startDelivery = async () => {
    if (!data || data.type !== "DELIVERY" || mutationInFlightRef.current) return;
    try {
      mutationInFlightRef.current = true;
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await fetch(`/api/fulfillments/${data.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status: "out_for_delivery" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to start delivery");
      const updatedStatus = String(payload.data?.status ?? "").toUpperCase();
      if (updatedStatus !== "OUT_FOR_DELIVERY") {
        throw new Error("Delivery start did not return an in-delivery status.");
      }
      setSuccess("Delivery started.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start delivery");
    } finally {
      mutationInFlightRef.current = false;
      setSaving(false);
    }
  };

  const completePickup = async () => {
    if (!data || data.type !== "PICKUP" || mutationInFlightRef.current) return;
    try {
      mutationInFlightRef.current = true;
      setSaving(true);
      setError(null);
      setSuccess(null);

      const items = data.items.map((item) => {
        const draft = itemDrafts[item.id] ?? { fulfilledQty: String(item.fulfilledQty ?? "0"), notes: item.notes ?? "" };
        const fulfilledQty = Number(draft.fulfilledQty);
        const orderedQty = Number(item.orderedQty ?? 0);
        const currentFulfilledQty = Number(item.fulfilledQty ?? 0);
        if (!Number.isFinite(fulfilledQty) || fulfilledQty < 0) {
          throw new Error(`Pickup quantity for "${item.title}" must be greater than or equal to 0.`);
        }
        if (fulfilledQty > orderedQty) {
          throw new Error(`Pickup quantity for "${item.title}" cannot exceed ordered quantity.`);
        }
        if (fulfilledQty < currentFulfilledQty) {
          throw new Error(`Pickup quantity for "${item.title}" cannot be less than already fulfilled quantity.`);
        }
        return { id: item.id, fulfilledQty: draft.fulfilledQty, notes: draft.notes };
      });

      if (!items.some((item) => Number(item.fulfilledQty) > 0)) {
        throw new Error("Enter at least one pickup quantity before completing pickup.");
      }

      const res = await fetch(`/api/fulfillments/${data.id}/pickup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ items }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to complete pickup");
      const updatedStatus = String(payload.data?.status ?? "").toUpperCase();
      if (!["PICKED_UP", "COMPLETED", "PARTIAL"].includes(updatedStatus)) {
        throw new Error("Pickup update did not return a completed or partial pickup status.");
      }
      setSuccess(updatedStatus === "PARTIAL" ? "Partial pickup recorded." : "Pickup completed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete pickup");
    } finally {
      mutationInFlightRef.current = false;
      setSaving(false);
    }
  };

  const completeDelivery = async () => {
    if (!data || data.type !== "DELIVERY" || mutationInFlightRef.current) return;
    try {
      mutationInFlightRef.current = true;
      setSaving(true);
      setError(null);
      setSuccess(null);

      const items = data.items.map((item) => {
        const draft = itemDrafts[item.id] ?? { fulfilledQty: String(item.fulfilledQty ?? "0"), notes: item.notes ?? "" };
        const fulfilledQty = Number(draft.fulfilledQty);
        const orderedQty = Number(item.orderedQty ?? 0);
        const currentFulfilledQty = Number(item.fulfilledQty ?? 0);
        if (!Number.isFinite(fulfilledQty) || fulfilledQty < 0) {
          throw new Error(`Delivery quantity for "${item.title}" must be greater than or equal to 0.`);
        }
        if (fulfilledQty > orderedQty) {
          throw new Error(`Delivery quantity for "${item.title}" cannot exceed ordered quantity.`);
        }
        if (fulfilledQty < currentFulfilledQty) {
          throw new Error(`Delivery quantity for "${item.title}" cannot be less than already fulfilled quantity.`);
        }
        return { id: item.id, fulfilledQty: draft.fulfilledQty, notes: draft.notes };
      });

      const hasNewDeliveryQuantity = items.some((item) => {
        const current = data.items.find((existing) => existing.id === item.id);
        return Number(item.fulfilledQty) > Number(current?.fulfilledQty ?? 0);
      });
      if (!hasNewDeliveryQuantity) {
        throw new Error("Enter at least one delivery quantity above the current fulfilled quantity before completing delivery.");
      }

      const res = await fetch(`/api/fulfillments/${data.id}/delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ items }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to complete delivery");
      const updatedStatus = String(payload.data?.status ?? "").toUpperCase();
      if (!["DELIVERED", "COMPLETED", "PARTIAL"].includes(updatedStatus)) {
        throw new Error("Delivery update did not return a delivered or partial status.");
      }
      setSuccess(updatedStatus === "PARTIAL" ? "Partial delivery recorded." : "Delivery completed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete delivery");
    } finally {
      mutationInFlightRef.current = false;
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
    if (data.type === "PICKUP") {
      await completePickup();
      return;
    }
    if (data.type === "DELIVERY") {
      await completeDelivery();
      return;
    }
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
    if (key === "PARTIAL") return "bg-amber-100 text-amber-700";
    if (key === "CANCELLED") return "bg-slate-200 text-slate-600";
    return "bg-slate-100 text-slate-700";
  };

  if (loading) return <div className="glass-card p-8 text-sm text-slate-400">Loading fulfillment...</div>;
  if (!data) return <div className="glass-card p-8 text-sm text-slate-400">Fulfillment not found.</div>;

  return (
    <section className="space-y-6" data-testid="fulfillment-detail">
      {error ? (
        <div data-testid="fulfillment-error" role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      ) : null}
      {success ? (
        <div data-testid="fulfillment-success" role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>
      ) : null}
      <div className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {data.type === "PICKUP" ? "Pickup" : "Delivery"} · {data.salesOrder.orderNumber}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {data.salesOrder.customer?.name ?? data.customer?.name ?? "-"}
              {data.customer?.phone || data.salesOrder.customer?.phone
                ? ` · ${data.customer?.phone ?? data.salesOrder.customer?.phone}`
                : ""}{" "}
              · {data.type === "PICKUP" ? "Counter pickup" : "Delivery"}
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
            {data.type === "PICKUP" ? (
              <p className="mt-3 max-w-2xl text-sm text-slate-400" data-testid="pickup-workflow-guidance">
                Complete Pickup records the customer handoff through the canonical fulfillment path. It deducts inventory for the fulfilled quantities only.
              </p>
            ) : null}
            {data.type === "DELIVERY" ? (
              <p className="mt-3 max-w-2xl text-sm text-slate-400" data-testid="delivery-workflow-guidance">
                Complete Delivery records an immutable customer handoff event and deducts only the newly delivered quantity.
              </p>
            ) : null}
            {specialOrderSummary ? (
              <div data-testid={data.type === "DELIVERY" ? "delivery-special-order-warning" : "pickup-special-order-warning"} className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                <span>Special Order</span>
                <span className="text-amber-200/80">{specialOrderSummary.status}</span>
                {specialOrderSummary.supplier ? <span>{specialOrderSummary.supplier}</span> : null}
                {specialOrderSummary.eta ? <span>ETA {fmtDateTime(specialOrderSummary.eta)}</span> : null}
              </div>
            ) : null}
            {data.type === "DELIVERY" && !deliveryAddressText ? (
              <div data-testid="delivery-address-warning" className="mt-3 max-w-2xl rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                Delivery address is missing on this fulfillment record. Confirm jobsite details before dispatch.
              </div>
            ) : null}
            <div className="mt-2 h-2 w-full max-w-[360px] overflow-hidden rounded bg-[var(--sc-color-surface-secondary)]">
              <div
                className="h-2 rounded bg-[var(--sc-color-accent)]"
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
                <p className="sm:col-span-2" data-testid="delivery-address">
                  <span className="font-semibold text-white/80">Jobsite:</span>{" "}
                  {deliveryAddressText || "Missing delivery address"}
                </p>
              ) : null}
              {data.type === "DELIVERY" ? (
                <p className="sm:col-span-2" data-testid="delivery-contact">
                  <span className="font-semibold text-white/80">Delivery contact:</span>{" "}
                  {data.shiptoName || data.salesOrder.customer?.name || data.customer?.name || "—"}
                  {data.shiptoPhone || data.customer?.phone || data.salesOrder.customer?.phone
                    ? ` · ${data.shiptoPhone ?? data.customer?.phone ?? data.salesOrder.customer?.phone}`
                    : ""}
                </p>
              ) : null}
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
                  title: "Preparation List",
                  src: `/api/fulfillments/${data.id}/pdf?type=pick`,
                })
              }
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Preparation List (PDF)
            </button>
            <a
              href={`/api/fulfillments/${data.id}/pdf?type=pick&download=true`}
              target="_blank"
              rel="noopener noreferrer"
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Download Preparation List
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
          <h2 className="text-base font-semibold text-white">Fulfillment history</h2>
          <p className="mt-1 text-xs text-slate-400">
            Each Pickup or Delivery is recorded as a separate event.
          </p>
          {data.events.length === 0 ? (
            <p className="mt-4 border-t border-[var(--sc-color-divider)] py-4 text-sm text-slate-400">
              No Pickup or Delivery events recorded yet.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)]">
              {data.events.map((event) => (
              <div
                key={event.id}
                className="py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    {event.method === "PICKUP" ? "Pickup" : "Delivery"} by {event.actor}
                  </p>
                  <time className="text-xs text-slate-400">{fmtDateTime(event.occurredAt)}</time>
                </div>
                {event.method === "DELIVERY" ? (
                  <p className="mt-1 text-xs text-slate-400">
                    {[event.jobSiteName, event.contactName, event.address1, event.city, event.state, event.zip]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                <div className="mt-3 grid gap-2">
                  {event.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-1 text-xs text-slate-400 sm:grid-cols-[minmax(0,1fr)_repeat(4,auto)] sm:gap-4"
                    >
                      <span className="font-medium text-white">{item.title} · {item.sku}</span>
                      <span>This event {fmtQty(item.quantity)} {item.unit}</span>
                      <span>Prior {fmtQty(item.priorFulfilledQty)}</span>
                      <span>New {fmtQty(item.newFulfilledQty)}</span>
                      <span>Remaining {fmtQty(item.remainingQty)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            </div>
          )}
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
          {!pickupClosed && !deliveryClosed ? (
            <button type="button" onClick={() => updateStatus("ready")} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Mark Ready
            </button>
          ) : null}
          {data.type === "PICKUP" ? (
            <button
              type="button"
              data-testid="pickup-complete-action"
              onClick={completePickup}
              disabled={saving || !pickupCanComplete}
              aria-busy={saving}
              className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              {saving ? "Completing Pickup..." : "Complete Pickup"}
            </button>
          ) : null}
          {data.type === "DELIVERY" ? (
            <>
              <button
                type="button"
                data-testid="delivery-start-action"
                onClick={startDelivery}
                disabled={saving || !deliveryCanStart}
                aria-busy={saving}
                className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60"
              >
                {saving ? "Starting Delivery..." : "Start Delivery"}
              </button>
              <button
                type="button"
                data-testid="delivery-complete-action"
                onClick={completeDelivery}
                disabled={saving || !deliveryCanComplete}
                aria-busy={saving}
                className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60"
              >
                {saving ? "Completing Delivery..." : "Complete Delivery"}
              </button>
            </>
          ) : null}
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
              <TableHead className="text-right text-slate-400">
                {data.type === "PICKUP" ? "Fulfilled After Pickup" : "Delivered After Delivery"}
              </TableHead>
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
                    {item.salesOrderItem?.isSpecialOrder ? (
                      <span className="ml-2 inline-flex rounded-lg border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                        Special Order
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">{item.sku || "-"}</TableCell>
                  <TableCell className="text-right">{fmtQty(item.orderedQty)}</TableCell>
                  <TableCell className="text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      data-testid={`fulfillment-item-qty-${item.id}`}
                      aria-label={`${item.title} ${
                        data.type === "PICKUP" ? "fulfilled quantity after pickup" : "delivered quantity after delivery"
                      }`}
                      value={draft.fulfilledQty}
                      onChange={(e) =>
                        setItemDrafts((prev) => ({
                          ...prev,
                          [item.id]: { ...(prev[item.id] ?? draft), fulfilledQty: e.target.value },
                        }))
                      }
                      className="ios-input ml-auto h-9 w-24 px-2 text-right text-xs"
                    />
                    {(data.type === "PICKUP" || data.type === "DELIVERY") && Number(item.fulfilledQty ?? 0) > 0 ? (
                      <p className="mt-1 text-[11px] text-slate-500">Current {fmtQty(item.fulfilledQty)}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{fmtQty(remaining)}</TableCell>
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
          {data.type === "PICKUP" ? (
            <p className="text-xs text-slate-400">
              Adjust quantities for partial pickup, then use <span className="font-semibold">Complete Pickup</span>{" "}
              above. Full quantities are prefilled for the common counter handoff.
            </p>
          ) : data.type === "DELIVERY" ? (
            <p className="text-xs text-slate-400">
              Enter the total delivered quantity after this handoff, then use{" "}
              <span className="font-semibold">Complete Delivery</span>. SolidCore records only the new quantity as
              a separate Delivery event.
            </p>
          ) : (
            <>
              <button type="button" onClick={saveItems} disabled={saving} className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60">
                Save Items
              </button>
              <p className="mt-2 text-xs text-slate-400">
                Saving items auto-updates status to <span className="font-semibold">partial</span> or{" "}
                <span className="font-semibold">completed</span> based on fulfilled quantity.
              </p>
            </>
          )}
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
