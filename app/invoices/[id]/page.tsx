"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { formatInternalSubtitle, formatLineItemTitle } from "@/lib/display";
import { getCustomerSpecLine, getEffectiveSpecs } from "@/lib/specs/glass";
import { formatFlooringSubtitle } from "@/lib/specs/effective";
import { formatBoxesSqftSummary } from "@/lib/selling-unit";

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  salesOrderId: string | null;
  customerId: string | null;
  issueDate: string;
  dueDate: string | null;
  status: string;
  subtotal: string;
  taxRate: number | null;
  taxAmount: string;
  total: string;
  billingAddress: string | null;
  notes: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null; address: string | null } | null;
  salesOrder: { id: string; orderNumber: string } | null;
  items: Array<{
    id: string;
    skuSnapshot: string | null;
    titleSnapshot: string | null;
    description?: string | null;
    available?: number | null;
    uomSnapshot: string | null;
    unitPrice: string;
    qty: string;
    discount: string;
    lineTotal: string;
    variant?: {
      displayName?: string | null;
      width?: number | null;
      height?: number | null;
      color?: string | null;
      glassTypeOverride?: string | null;
      slidingConfigOverride?: string | null;
      glassCoatingOverride?: string | null;
      glassThicknessMmOverride?: number | null;
      glassFinishOverride?: string | null;
      screenOverride?: string | null;
      openingTypeOverride?: string | null;
      product?: {
        frameMaterialDefault?: string | null;
        openingTypeDefault?: string | null;
        slidingConfigDefault?: string | null;
        glassTypeDefault?: string | null;
        glassCoatingDefault?: string | null;
        glassThicknessMmDefault?: number | null;
        glassFinishDefault?: string | null;
        screenDefault?: string | null;
          flooringMaterial?: string | null;
          flooringWearLayer?: string | null;
          flooringThicknessMm?: number | null;
          flooringPlankLengthIn?: number | null;
          flooringPlankWidthIn?: number | null;
          flooringCoreThicknessMm?: number | null;
          flooringInstallation?: string | null;
          flooringUnderlayment?: string | null;
          flooringUnderlaymentType?: string | null;
          flooringUnderlaymentMm?: number | null;
          flooringBoxCoverageSqft?: number | null;
      } | null;
    } | null;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    paymentType: string;
    status: "POSTED" | "VOIDED";
    referenceNumber: string | null;
    receivedAt: string;
    notes: string | null;
  }>;
  storeCreditApplications: Array<{
    id: string;
    amount: string;
    createdAt: string;
    storeCredit: {
      id: string;
      returnId: string;
    };
  }>;
  paidTotal: string;
  balanceDue: string;
};

type StoreCreditPreview = {
  previewAmount: number;
  invoiceBalance: number;
  openCreditBalance: number;
  allocations: Array<{
    creditId: string;
    sourceReturnId: string | null;
    remainingBefore: number;
    willUse: number;
  }>;
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [openStoreCredit, setOpenStoreCredit] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; src: string } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "CASH",
    type: "FINAL",
    referenceNumber: "",
    receivedAt: "",
    notes: "",
  });
  const [applyingCredit, setApplyingCredit] = useState(false);
  const [storeCreditBalance, setStoreCreditBalance] = useState(0);
  const [storeCreditForm, setStoreCreditForm] = useState({
    amount: "",
  });
  const [storeCreditPreview, setStoreCreditPreview] = useState<StoreCreditPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [hasRelatedReturns, setHasRelatedReturns] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/invoices/${id}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load invoice");
      setData(payload.data);
      const soId = String(payload.data?.salesOrder?.id ?? "").trim();
      if (soId) {
        const returnRes = await fetch(`/api/after-sales/returns?salesOrderId=${soId}&invoiceId=${payload.data?.id ?? ""}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const returnPayload = await returnRes.json();
        if (returnRes.ok) {
          setHasRelatedReturns(Array.isArray(returnPayload.data) && returnPayload.data.length > 0);
        } else {
          setHasRelatedReturns(false);
        }
      } else {
        setHasRelatedReturns(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const paymentStatus = useMemo(() => {
    if (!data) return "unpaid";
    const balance = Number(data.balanceDue);
    if (balance <= 0) return "paid";
    if (Number(data.paidTotal) > 0) return "partial";
    return "unpaid";
  }, [data]);
  const paymentAmount = Number(paymentForm.amount || 0);
  const currentBalance = Number(data?.balanceDue ?? 0);
  const isOverPayment =
    paymentForm.type !== "REFUND" &&
    Number.isFinite(paymentAmount) &&
    paymentAmount > 0 &&
    paymentAmount > currentBalance + 0.0001;
  const appliedStoreCreditTotal = Number(
    (data?.storeCreditApplications ?? []).reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const canConfirmStoreCredit =
    !previewLoading &&
    !applyingCredit &&
    !saving &&
    Number(storeCreditPreview?.previewAmount ?? 0) > 0;

  const markSent = async () => {
    if (!data) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}/mark-sent`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to mark sent");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark sent");
    } finally {
      setSaving(false);
    }
  };

  const voidInvoice = async () => {
    if (!data) return;
    const ok = window.confirm("Void this invoice?");
    if (!ok) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}/void`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to void invoice");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void invoice");
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async () => {
    if (!data) return;
    const ok = window.confirm("Delete this invoice permanently?");
    if (!ok) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete invoice");
      router.push("/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setSaving(false);
    }
  };

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/invoices/${data.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(paymentForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add payment");
      setOpenPayment(false);
      setPaymentForm({
        amount: "",
        method: "CASH",
        type: "FINAL",
        referenceNumber: "",
        receivedAt: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment");
    } finally {
      setSaving(false);
    }
  };

  const fetchStoreCreditPreview = async (amount: number) => {
    if (!data) return null;
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const query = encodeURIComponent(Number.isFinite(amount) ? amount.toFixed(2) : "0");
      const res = await fetch(`/api/invoices/${data.id}/store-credit-preview?amount=${query}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to preview store credit");
      const preview: StoreCreditPreview = {
        previewAmount: Number(payload.data?.previewAmount ?? 0),
        invoiceBalance: Number(payload.data?.invoiceBalance ?? 0),
        openCreditBalance: Number(payload.data?.openCreditBalance ?? 0),
        allocations: Array.isArray(payload.data?.allocations)
          ? payload.data.allocations.map((row: Record<string, unknown>) => ({
              creditId: String(row.creditId ?? ""),
              sourceReturnId: row.sourceReturnId ? String(row.sourceReturnId) : null,
              remainingBefore: Number(row.remainingBefore ?? 0),
              willUse: Number(row.willUse ?? 0),
            }))
          : [],
      };
      setStoreCreditPreview(preview);
      setStoreCreditBalance(preview.openCreditBalance);
      return preview;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to preview store credit";
      setPreviewError(message);
      setStoreCreditPreview(null);
      return null;
    } finally {
      setPreviewLoading(false);
    }
  };

  const openApplyStoreCreditModal = async () => {
    if (!data) return;
    try {
      setSaving(true);
      setPreviewError(null);
      const preview = await fetchStoreCreditPreview(Number(data.balanceDue ?? 0));
      const defaultAmount = Number(preview?.previewAmount ?? 0);
      setStoreCreditForm({ amount: defaultAmount > 0 ? defaultAmount.toFixed(2) : "" });
      setOpenStoreCredit(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load store credits");
    } finally {
      setSaving(false);
    }
  };

  const applyStoreCredit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;
    try {
      setApplyingCredit(true);
      const res = await fetch(`/api/invoices/${data.id}/apply-store-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ amount: Number(storeCreditForm.amount || 0) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to apply store credit");
      setOpenStoreCredit(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply store credit");
    } finally {
      setApplyingCredit(false);
    }
  };

  const createReturnFromInvoice = () => {
    if (!data) return;
    const params = new URLSearchParams();
    params.set("openCreate", "1");
    if (data.customer?.id) params.set("customerId", data.customer.id);
    if (data.salesOrder?.id) params.set("salesOrderId", data.salesOrder.id);
    params.set("invoiceId", data.id);
    router.push(`/after-sales/returns?${params.toString()}`);
  };

  useEffect(() => {
    if (!openStoreCredit || !data) return;
    const timer = window.setTimeout(() => {
      const requestedAmount = Number(storeCreditForm.amount || 0);
      void fetchStoreCreditPreview(Number.isFinite(requestedAmount) ? requestedAmount : 0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [openStoreCredit, data, role, storeCreditForm.amount]);

  if (loading) return <div className="glass-card p-8 text-sm text-slate-400">Loading invoice...</div>;
  if (!data) return <div className="glass-card p-8 text-sm text-slate-400">Invoice not found.</div>;

  return (
    <section className="space-y-8">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/invoices" className="text-xs text-slate-500 hover:text-slate-700">
              ← Back to Invoices
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{data.invoiceNumber}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Customer: {data.customer?.name ?? "-"} · SO: {data.salesOrder?.orderNumber ?? "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-300 backdrop-blur-xl">{data.status}</span>
            <span className="rounded border border-emerald-400/30 bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200">{paymentStatus}</span>
            <button
              type="button"
              onClick={() =>
                setPdfPreview({
                  title: `Invoice ${data.invoiceNumber}`,
                  src: `/api/pdf/invoice/${data.id}`,
                })
              }
              className="ios-secondary-btn h-9 px-3 text-xs"
            >
              Preview PDF
            </button>
            <a
              href={`/api/pdf/invoice/${data.id}?download=true`}
              className="ios-secondary-btn h-9 px-3 text-xs"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download PDF
            </a>
            <button type="button" onClick={markSent} disabled={saving || data.status === "void"} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Mark Sent
            </button>
            <button type="button" onClick={() => setOpenPayment(true)} disabled={saving || data.status === "void"} className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60">
              Add Payment
            </button>
            <button
              type="button"
              onClick={openApplyStoreCreditModal}
              disabled={saving || data.status === "void" || Number(data.balanceDue) <= 0}
              className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              Apply Store Credit
            </button>
            <button
              type="button"
              onClick={createReturnFromInvoice}
              disabled={saving || data.status === "void"}
              className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60"
            >
              Create Return
            </button>
            {hasRelatedReturns && data.salesOrder?.orderNumber ? (
              <Link href={`/after-sales/returns?search=${encodeURIComponent(data.salesOrder.orderNumber)}`} className="ios-secondary-btn h-9 px-3 text-xs">
                View Returns
              </Link>
            ) : null}
            <button type="button" onClick={voidInvoice} disabled={saving || data.status === "void"} className="ios-secondary-btn h-9 px-3 text-xs disabled:opacity-60">
              Void
            </button>
            <button type="button" onClick={deleteInvoice} disabled={saving} className="ios-secondary-btn h-9 px-3 text-xs text-rose-700 disabled:opacity-60">
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="linear-card p-8 xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Items</h2>
          <div className="mt-4 space-y-2">
            {data.items.map((item) => (
              (() => {
                const flooringSummary = formatFlooringSubtitle({
                  flooringMaterial: item.variant?.product?.flooringMaterial,
                  flooringWearLayer: item.variant?.product?.flooringWearLayer,
                  flooringThicknessMm: item.variant?.product?.flooringThicknessMm,
                  flooringPlankLengthIn: item.variant?.product?.flooringPlankLengthIn,
                  flooringPlankWidthIn: item.variant?.product?.flooringPlankWidthIn,
                  flooringCoreThicknessMm: item.variant?.product?.flooringCoreThicknessMm,
                  flooringInstallation: item.variant?.product?.flooringInstallation,
                  flooringUnderlayment: item.variant?.product?.flooringUnderlayment,
                  flooringUnderlaymentType: item.variant?.product?.flooringUnderlaymentType,
                  flooringUnderlaymentMm: item.variant?.product?.flooringUnderlaymentMm,
                  flooringBoxCoverageSqft: item.variant?.product?.flooringBoxCoverageSqft,
                });
                const specSubtitle =
                  flooringSummary ||
                  getCustomerSpecLine(
                        getEffectiveSpecs(
                          {
                            frameMaterialDefault: item.variant?.product?.frameMaterialDefault,
                            openingTypeDefault: item.variant?.product?.openingTypeDefault,
                            slidingConfigDefault: item.variant?.product?.slidingConfigDefault,
                            glassTypeDefault: item.variant?.product?.glassTypeDefault,
                            glassCoatingDefault: item.variant?.product?.glassCoatingDefault,
                            glassThicknessMmDefault: item.variant?.product?.glassThicknessMmDefault,
                            glassFinishDefault: item.variant?.product?.glassFinishDefault,
                            screenDefault: item.variant?.product?.screenDefault,
                          },
                          {
                            glassTypeOverride: item.variant?.glassTypeOverride,
                            slidingConfigOverride: item.variant?.slidingConfigOverride,
                            glassCoatingOverride: item.variant?.glassCoatingOverride,
                            glassThicknessMmOverride: item.variant?.glassThicknessMmOverride,
                            glassFinishOverride: item.variant?.glassFinishOverride,
                            screenOverride: item.variant?.screenOverride,
                            openingTypeOverride: item.variant?.openingTypeOverride,
                            detailText: item.description,
                          },
                        ),
                      );
                const boxSummary =
                  flooringSummary && Number(item.variant?.product?.flooringBoxCoverageSqft ?? 0) > 0
                    ? formatBoxesSqftSummary(
                        Number(item.qty ?? 0),
                        Number(item.variant?.product?.flooringBoxCoverageSqft ?? 0),
                      )
                    : null;
                return (
<div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {flooringSummary
                        ? String(item.variant?.displayName ?? item.titleSnapshot ?? "").trim() || "-"
                        : formatLineItemTitle({
                            variant: {
                              title: item.titleSnapshot,
                              sku: item.skuSnapshot,
                              detailText: item.description,
                            },
                          })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatInternalSubtitle({ variantSku: item.skuSnapshot ?? "-", available: item.available })}
                      {item.uomSnapshot ? ` · ${item.uomSnapshot}` : ""}
                    </p>
                    {specSubtitle ? <p className="text-xs text-slate-500">{specSubtitle}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {boxSummary ? boxSummary : `Qty ${Number(item.qty).toFixed(2)}`}
                    </p>
                    <p className="font-semibold text-slate-900">${Number(item.lineTotal).toFixed(2)}</p>
                  </div>
                </div>
              </div>
                );
              })()
            ))}
          </div>
        </article>

        <aside className="linear-card space-y-3 p-8 text-sm">
          <h2 className="text-base font-semibold text-slate-900">Totals</h2>
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>${Number(data.subtotal).toFixed(2)}</span></div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tax ({Number(data.taxRate ?? 0).toFixed(3)}%)</span>
            <span>${Number(data.taxAmount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold"><span>Total</span><span>${Number(data.total).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>${Number(data.paidTotal).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance</span><span>${Number(data.balanceDue).toFixed(2)}</span></div>
          <div className="pt-2 text-xs text-slate-500">
            Billing Address: {data.billingAddress || "-"}
          </div>
        </aside>
      </div>

      <article className="linear-card p-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Payments</h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Ref</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-white/10">
                    <td className="py-2 pr-4">{new Date(payment.receivedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</td>
                    <td className="py-2 pr-4">{payment.method}</td>
                    <td className="py-2 pr-4">{payment.paymentType}</td>
                    <td className="py-2 pr-4">{payment.referenceNumber || "-"}</td>
                    <td className="py-2 pr-4">${Number(payment.amount).toFixed(2)}</td>
                    <td className="py-2 pr-4">{payment.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/invoices/${data.id}/payments/${payment.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                          Open Payment
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            setPdfPreview({
                              title: `Payment ${payment.id.slice(0, 8)}`,
                              src: `/api/pdf/payment/${payment.id}`,
                            })
                          }
                          className="ios-secondary-btn h-8 px-2 text-xs"
                        >
                          Preview Receipt PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="linear-card p-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Store Credit Applied</h2>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            Store Credit Applied: ${appliedStoreCreditTotal.toFixed(2)}
          </span>
        </div>
        {data.storeCreditApplications.length === 0 ? (
          <p className="text-sm text-slate-500">No store credit applications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Credit #</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Source Return</th>
                </tr>
              </thead>
              <tbody>
                {data.storeCreditApplications.map((row) => (
                  <tr key={row.id} className="border-b border-white/10">
                    <td className="py-2 pr-4">
                      {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                    </td>
                    <td className="py-2 pr-4">{row.storeCredit.id.slice(0, 8)}</td>
                    <td className="py-2 pr-4">${Number(row.amount).toFixed(2)}</td>
                    <td className="py-2">
                      <Link href={`/returns/${row.storeCredit.returnId}`} className="ios-secondary-btn h-8 px-2 text-xs">
                        Open Return
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {openPayment ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-4">
          <form onSubmit={addPayment} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
            <h3 className="text-base font-semibold text-slate-900">Add Payment</h3>
            <div className="mt-3 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Amount</span>
                <input className="ios-input h-10 w-full px-3 text-sm" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} required />
              </label>
              <p className="text-xs text-slate-500">
                Current Balance: ${currentBalance.toFixed(2)}
              </p>
              {isOverPayment ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  Payment exceeds current balance. Adjust amount or use Refund type if applicable.
                </p>
              ) : null}
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Method</span>
                <select className="ios-input h-10 w-full px-3 text-sm" value={paymentForm.method} onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}>
                  <option value="CASH">Cash</option>
                  <option value="CHECK">Check</option>
                  <option value="CARD">Card</option>
                  <option value="BANK">Bank</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Type</span>
                <select className="ios-input h-10 w-full px-3 text-sm" value={paymentForm.type} onChange={(e) => setPaymentForm((prev) => ({ ...prev, type: e.target.value }))}>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="FINAL">Final</option>
                  <option value="REFUND">Refund</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Reference</span>
                <input className="ios-input h-10 w-full px-3 text-sm" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm((prev) => ({ ...prev, referenceNumber: e.target.value }))} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Received Date</span>
                <input className="ios-input h-10 w-full px-3 text-sm" type="datetime-local" value={paymentForm.receivedAt} onChange={(e) => setPaymentForm((prev) => ({ ...prev, receivedAt: e.target.value }))} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenPayment(false)} className="ios-secondary-btn h-10 px-3 text-sm">
                Cancel
              </button>
              <button type="submit" className="ios-primary-btn h-10 px-3 text-sm" disabled={saving || isOverPayment}>
                {saving ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {openStoreCredit ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-4">
          <form onSubmit={applyStoreCredit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
            <h3 className="text-base font-semibold text-slate-900">Apply Store Credit</h3>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">
                Open Credit Balance: ${storeCreditBalance.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">
                Invoice Balance: ${Number(data.balanceDue).toFixed(2)}
              </p>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Amount to Apply</span>
                <input
                  className="ios-input h-10 w-full px-3 text-sm"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={Math.min(Number(data.balanceDue), storeCreditBalance).toFixed(2)}
                  value={storeCreditForm.amount}
                  onChange={(e) => setStoreCreditForm({ amount: e.target.value })}
                  required
                />
              </label>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Credit Breakdown Preview</h4>
                {previewLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Calculating preview...</p>
                ) : previewError ? (
                  <p className="mt-2 text-xs text-rose-600">{previewError}</p>
                ) : Number(storeCreditPreview?.previewAmount ?? 0) <= 0 ? (
                  <p className="mt-2 text-xs text-amber-700">No available credit or invoice already paid.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                      <span>Invoice Balance: ${Number(storeCreditPreview?.invoiceBalance ?? 0).toFixed(2)}</span>
                      <span>Open Credit: ${Number(storeCreditPreview?.openCreditBalance ?? 0).toFixed(2)}</span>
                      <span>Will Apply: ${Number(storeCreditPreview?.previewAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-slate-400">
                            <th className="px-2 py-1.5">Credit #</th>
                            <th className="px-2 py-1.5">Source</th>
                            <th className="px-2 py-1.5 text-right">Remaining</th>
                            <th className="px-2 py-1.5 text-right">Will Use</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(storeCreditPreview?.allocations ?? []).map((row) => (
                            <tr key={`${row.creditId}-${row.sourceReturnId ?? "none"}`} className="border-b border-white/10">
                              <td className="px-2 py-1.5">{row.creditId.slice(0, 8)}</td>
                              <td className="px-2 py-1.5">
                                {row.sourceReturnId ? (
                                  <Link href={`/returns/${row.sourceReturnId}`} className="text-slate-700 underline">
                                    Return {row.sourceReturnId.slice(0, 8)}
                                  </Link>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right">${Number(row.remainingBefore).toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold text-slate-900">${Number(row.willUse).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenStoreCredit(false)} className="ios-secondary-btn h-10 px-3 text-sm">
                Cancel
              </button>
              <button
                type="submit"
                className="ios-primary-btn h-10 px-3 text-sm disabled:opacity-60"
                disabled={!canConfirmStoreCredit}
              >
                {applyingCredit ? "Applying..." : "Confirm Apply"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <PDFPreviewModal
        open={Boolean(pdfPreview)}
        title={pdfPreview?.title ?? "PDF Preview"}
        src={pdfPreview?.src ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </section>
  );
}
