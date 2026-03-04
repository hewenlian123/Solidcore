"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";

type ReturnDetail = {
  id: string;
  returnNumber: string;
  type: "RETURN" | "EXCHANGE";
  status: "DRAFT" | "APPROVED" | "RECEIVED" | "REFUNDED" | "CLOSED" | "VOID";
  refundMethod: "STORE_CREDIT" | "REFUND_PAYMENT" | "NO_REFUND";
  refundTotal: string;
  notes: string | null;
  pdfUrl: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null; email: string | null };
  salesOrder: { id: string; orderNumber: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
  items: Array<{
    id: string;
    title: string;
    sku: string | null;
    qtyPurchased: string | null;
    qtyReturn: string;
    unitPrice: string;
    reason: string | null;
    condition: string | null;
    lineRefund: string;
  }>;
};

const STATUS_FLOW: Record<ReturnDetail["status"], ReturnDetail["status"][]> = {
  DRAFT: ["APPROVED"],
  APPROVED: ["RECEIVED"],
  RECEIVED: ["CLOSED"],
  REFUNDED: ["CLOSED"],
  CLOSED: [],
  VOID: [],
};

export default function AfterSalesReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; src: string } | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [itemDrafts, setItemDrafts] = useState<
    Array<{ id: string; qtyPurchased: string | null; qtyReturn: string; reason: string; condition: string; unitPrice: string }>
  >([]);

  const loadViaApiReturns = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/returns/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load return");
      setData(payload.data);
      setNotesDraft(String(payload.data?.notes ?? ""));
      setItemDrafts(
        (payload.data?.items ?? []).map((item: any) => ({
          id: String(item.id),
          qtyPurchased: item.qtyPurchased != null ? String(item.qtyPurchased) : null,
          qtyReturn: String(item.qtyReturn ?? "0"),
          reason: String(item.reason ?? ""),
          condition: String(item.condition ?? ""),
          unitPrice: String(item.unitPrice ?? "0"),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load return");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void loadViaApiReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const nextStatus = useMemo(() => (data ? STATUS_FLOW[data.status][0] ?? null : null), [data]);

  const saveEditViaApiReturns = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/returns/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          notes: notesDraft,
          items: itemDrafts.map((item) => ({
            id: item.id,
            qtyPurchased: item.qtyPurchased,
            qtyReturn: Number(item.qtyReturn || 0),
            unitPrice: Number(item.unitPrice || 0),
            reason: item.reason,
            condition: item.condition,
          })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update return");
      setOpenEdit(false);
      await loadViaApiReturns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update return");
    } finally {
      setSaving(false);
    }
  };

  const moveStatusViaApiReturns = async () => {
    if (!data || !nextStatus) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/returns/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to change status");
      await loadViaApiReturns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setSaving(false);
    }
  };

  const createPdfViaApiReturns = async () => {
    if (!data) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/returns/${data.id}/pdf`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to generate PDF");
      setPdfPreview({
        title: `Return ${data.returnNumber}`,
        src: payload.data?.url || `/api/returns/${data.id}/pdf`,
      });
      await loadViaApiReturns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="linear-card p-8 text-sm text-slate-500">Loading return...</div>;
  if (!data) return <div className="linear-card p-8 text-sm text-slate-500">Return not found.</div>;

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/after-sales/returns" className="text-xs text-slate-500 hover:text-slate-700">
              ← Back to Returns
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{data.returnNumber}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Customer: {data.customer.name} · SO: {data.salesOrder?.orderNumber ?? "-"} · Invoice: {data.invoice?.invoiceNumber ?? "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{data.status}</span>
            <button type="button" onClick={() => setOpenEdit(true)} className="ios-secondary-btn h-9 px-3 text-xs" disabled={saving}>
              Edit
            </button>
            <button type="button" onClick={createPdfViaApiReturns} className="ios-secondary-btn h-9 px-3 text-xs" disabled={saving}>
              Print / PDF
            </button>
            {nextStatus ? (
              <button type="button" onClick={moveStatusViaApiReturns} className="ios-primary-btn h-9 px-3 text-xs" disabled={saving}>
                Move to {nextStatus}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="linear-card p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Type</p>
            <p className="text-sm font-medium text-slate-900">{data.type}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Refund Method</p>
            <p className="text-sm font-medium text-slate-900">{data.refundMethod}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Refund Total</p>
            <p className="text-sm font-semibold text-slate-900">${Number(data.refundTotal).toFixed(2)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">{data.notes || "No notes."}</p>
      </div>

      <div className="linear-card p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Items</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4 text-right">Qty Purchased</th>
                <th className="py-2 pr-4 text-right">Qty Return</th>
                <th className="py-2 pr-4 text-right">Unit Price</th>
                <th className="py-2 pr-4 text-right">Line Refund</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2">Condition</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-3 text-center text-slate-500">
                    No return items.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{item.title}</td>
                    <td className="py-2 pr-4">{item.sku || "-"}</td>
                    <td className="py-2 pr-4 text-right">{Number(item.qtyPurchased ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right">{Number(item.qtyReturn).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right">${Number(item.unitPrice).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right">${Number(item.lineRefund).toFixed(2)}</td>
                    <td className="py-2 pr-4">{item.reason || "-"}</td>
                    <td className="py-2">{item.condition || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openEdit ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Edit Return</h3>
              <button type="button" onClick={() => setOpenEdit(false)} className="ios-secondary-btn h-9 px-3 text-sm">
                Close
              </button>
            </div>
            <form className="space-y-3" onSubmit={saveEditViaApiReturns}>
              {itemDrafts.map((item, idx) => (
                <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">Item {idx + 1}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                    <input
                      value={item.qtyReturn}
                      onChange={(event) =>
                        setItemDrafts((prev) =>
                          prev.map((row) => (row.id === item.id ? { ...row, qtyReturn: event.target.value } : row)),
                        )
                      }
                      type="number"
                      min="0"
                      step="0.01"
                      className="ios-input h-9 px-2 text-xs"
                      placeholder="Qty Return"
                    />
                    <input
                      value={item.unitPrice}
                      onChange={(event) =>
                        setItemDrafts((prev) =>
                          prev.map((row) => (row.id === item.id ? { ...row, unitPrice: event.target.value } : row)),
                        )
                      }
                      type="number"
                      min="0"
                      step="0.01"
                      className="ios-input h-9 px-2 text-xs"
                      placeholder="Unit Price"
                    />
                    <input
                      value={item.reason}
                      onChange={(event) =>
                        setItemDrafts((prev) =>
                          prev.map((row) => (row.id === item.id ? { ...row, reason: event.target.value } : row)),
                        )
                      }
                      className="ios-input h-9 px-2 text-xs"
                      placeholder="Reason"
                    />
                    <input
                      value={item.condition}
                      onChange={(event) =>
                        setItemDrafts((prev) =>
                          prev.map((row) => (row.id === item.id ? { ...row, condition: event.target.value } : row)),
                        )
                      }
                      className="ios-input h-9 px-2 text-xs"
                      placeholder="Condition"
                    />
                  </div>
                </div>
              ))}
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Notes</span>
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-100 p-3 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpenEdit(false)} className="ios-secondary-btn h-10 px-3 text-sm">
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-10 px-3 text-sm" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <PDFPreviewModal
        open={Boolean(pdfPreview)}
        title={pdfPreview?.title ?? "Return PDF"}
        src={pdfPreview?.src ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </section>
  );
}
