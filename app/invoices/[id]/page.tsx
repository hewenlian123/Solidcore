"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  discountAmount: string;
  taxRate: number | null;
  taxAmount: string;
  total: string;
  billingAddress: string | null;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
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
  unallocatedPayments: Array<{
    id: string;
    amount: string;
    method: string;
    paymentType: string;
    status: "POSTED" | "VOIDED";
    referenceNumber: string | null;
    receivedAt: string;
    notes: string | null;
  }>;
  unallocatedPaymentTotal: string;
  originalTotal: string;
  commercialReduction: string;
  requiredDeposit: string;
  depositPaid: string;
  grossPaidTotal: string;
  refundedTotal: string;
  paidTotal: string;
  balanceDue: string;
};

function createPaymentIntentKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeInvoiceDetail(invoice: InvoiceDetail): InvoiceDetail {
  return {
    ...invoice,
    items: Array.isArray(invoice.items) ? invoice.items : [],
    payments: Array.isArray(invoice.payments) ? invoice.payments : [],
    unallocatedPayments: Array.isArray(invoice.unallocatedPayments)
      ? invoice.unallocatedPayments
      : [],
    unallocatedPaymentTotal: invoice.unallocatedPaymentTotal ?? "0",
    originalTotal: invoice.originalTotal ?? invoice.total ?? "0",
    commercialReduction:
      invoice.commercialReduction ?? invoice.discountAmount ?? "0",
    requiredDeposit: invoice.requiredDeposit ?? "0",
    depositPaid: invoice.depositPaid ?? "0",
    grossPaidTotal: invoice.grossPaidTotal ?? invoice.paidTotal ?? "0",
    refundedTotal: invoice.refundedTotal ?? "0",
    paidTotal: invoice.paidTotal ?? "0",
    balanceDue: invoice.balanceDue ?? invoice.total ?? "0",
  };
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(
    null,
  );
  const [openPayment, setOpenPayment] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{
    title: string;
    src: string;
  } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "CASH",
    type: "FINAL",
    referenceNumber: "",
    receivedAt: "",
    notes: "",
  });
  const [paymentIntentKey, setPaymentIntentKey] = useState(
    createPaymentIntentKey,
  );
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
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
      if (!payload.data) throw new Error("Failed to load invoice");
      const invoiceData = normalizeInvoiceDetail(payload.data);
      setData(invoiceData);
      const soId = String(invoiceData.salesOrder?.id ?? "").trim();
      if (soId) {
        const returnRes = await fetch(
          `/api/after-sales/returns?salesOrderId=${soId}&invoiceId=${invoiceData.id}`,
          {
            cache: "no-store",
            headers: { "x-user-role": role },
          },
        );
        const returnPayload = await returnRes.json();
        if (returnRes.ok) {
          setHasRelatedReturns(
            Array.isArray(returnPayload.data) && returnPayload.data.length > 0,
          );
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
    Number.isFinite(paymentAmount) &&
    paymentAmount > 0 &&
    paymentAmount > currentBalance + 0.0001;
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
    if (!data || saving) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/invoices/${data.id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": paymentIntentKey,
          "x-user-role": role,
        },
        body: JSON.stringify(paymentForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add payment");
      setLastPaymentId(String(payload?.data?.paymentId ?? "") || null);
      setOpenPayment(false);
      setPaymentForm({
        amount: "",
        method: "CASH",
        type: "FINAL",
        referenceNumber: "",
        receivedAt: "",
        notes: "",
      });
      setPaymentIntentKey(createPaymentIntentKey());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment");
    } finally {
      setSaving(false);
    }
  };

  const allocatePaymentToInvoice = async (paymentId: string) => {
    if (!data) return;
    try {
      setSaving(true);
      setAllocatingPaymentId(paymentId);
      setError(null);
      const res = await fetch(
        `/api/invoices/${data.id}/payments/${paymentId}/allocate`,
        {
          method: "PATCH",
          headers: { "x-user-role": role },
        },
      );
      const payload = await res.json();
      if (!res.ok)
        throw new Error(
          payload.error ?? "Failed to apply order payment to invoice",
        );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to apply order payment to invoice",
      );
    } finally {
      setAllocatingPaymentId(null);
      setSaving(false);
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

  if (loading) {
    return (
      <p className="border-y border-[var(--sc-color-divider)] py-10 text-sm text-[var(--sc-color-text-secondary)]">
        Loading invoice...
      </p>
    );
  }
  if (!data) {
    return (
      <p className="border-y border-[var(--sc-color-divider)] py-10 text-sm text-[var(--sc-color-text-secondary)]">
        Invoice not found.
      </p>
    );
  }

  const financialMetrics = [
    ["Original Total", data.originalTotal],
    ["Commercial Reduction", data.commercialReduction],
    ["Issued Total", data.total],
    ["Required Deposit", data.requiredDeposit],
    ["Deposit Paid", data.depositPaid],
    ["Total Paid", data.grossPaidTotal],
    ["Refunded", data.refundedTotal],
    ["Balance Due", data.balanceDue],
  ] as const;

  return (
    <section className="space-y-8" data-testid="invoice-detail-workspace">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sc-color-divider)] pb-6">
        <div>
          <Link
            href="/invoices"
            className="text-sm text-[var(--sc-color-accent)] hover:underline"
          >
            Invoices & Payments
          </Link>
          <h1 className="mt-2 text-[28px] font-semibold leading-9">
            {data.invoiceNumber}
          </h1>
          <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
            {data.customer?.name ?? "Unknown customer"} ·{" "}
            {data.salesOrder?.orderNumber ?? "No order"} · {data.status} ·{" "}
            {paymentStatus}
          </p>
          <p className="mt-1 text-xs text-[var(--sc-color-text-muted)]">
            Issued snapshot · Invoice ID {data.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="ios-secondary-btn flex min-h-11 cursor-pointer list-none items-center px-3 text-sm">
              More
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-[var(--sc-color-border)] bg-[var(--sc-color-surface)] p-1 shadow-[0_8px_24px_rgba(36,37,33,0.08)]">
              <button
                type="button"
                onClick={() =>
                  setPdfPreview({
                    title: `Invoice ${data.invoiceNumber}`,
                    src: `/api/pdf/invoice/${data.id}`,
                  })
                }
                className="block min-h-11 w-full rounded px-3 text-left text-sm hover:bg-[var(--sc-color-hover)]"
              >
                Preview PDF
              </button>
              <a
                href={`/api/pdf/invoice/${data.id}?download=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center rounded px-3 text-sm hover:bg-[var(--sc-color-hover)]"
              >
                Download PDF
              </a>
              <button
                type="button"
                onClick={markSent}
                disabled={saving || data.status === "void"}
                className="block min-h-11 w-full rounded px-3 text-left text-sm hover:bg-[var(--sc-color-hover)] disabled:opacity-50"
              >
                Mark Issued
              </button>
              <button
                type="button"
                onClick={createReturnFromInvoice}
                disabled={saving || data.status === "void"}
                className="block min-h-11 w-full rounded px-3 text-left text-sm hover:bg-[var(--sc-color-hover)] disabled:opacity-50"
              >
                Create Return
              </button>
              {hasRelatedReturns && data.salesOrder?.orderNumber ? (
                <Link
                  href={`/after-sales/returns?search=${encodeURIComponent(data.salesOrder.orderNumber)}`}
                  className="flex min-h-11 items-center rounded px-3 text-sm hover:bg-[var(--sc-color-hover)]"
                >
                  View Returns
                </Link>
              ) : null}
              <button
                type="button"
                onClick={voidInvoice}
                disabled={saving || data.status === "void"}
                className="block min-h-11 w-full rounded px-3 text-left text-sm text-[var(--sc-color-critical)] hover:bg-[var(--sc-color-critical-surface)] disabled:opacity-50"
              >
                Void Invoice
              </button>
              {data.status === "draft" ? (
                <button
                  type="button"
                  onClick={deleteInvoice}
                  disabled={saving}
                  className="block min-h-11 w-full rounded px-3 text-left text-sm text-[var(--sc-color-critical)] hover:bg-[var(--sc-color-critical-surface)] disabled:opacity-50"
                >
                  Delete Draft
                </button>
              ) : null}
            </div>
          </details>
          <button
            type="button"
            onClick={() => {
              setLastPaymentId(null);
              setOpenPayment(true);
            }}
            disabled={
              saving || data.status === "void" || Number(data.balanceDue) <= 0
            }
            className="ios-primary-btn min-h-11 px-4 text-sm disabled:opacity-50"
          >
            Add Payment
          </button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--sc-color-critical)] bg-[var(--sc-color-critical-surface)] px-4 py-3 text-sm text-[var(--sc-color-critical)]"
        >
          {error}
        </div>
      ) : null}
      {lastPaymentId && data.salesOrder?.id ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--sc-color-success)] bg-[var(--sc-color-success-surface)] px-4 py-3 text-sm text-[var(--sc-color-success)]"
        >
          <span>
            Payment posted once. Balance due is now $
            {Number(data.balanceDue).toFixed(2)}.
          </span>
          <Link
            href={`/sales-orders/${data.salesOrder.id}/payments/${lastPaymentId}/receipt`}
            className="font-medium underline"
          >
            Open Payment Receipt
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="financial-position-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="financial-position-heading"
              className="text-xl font-semibold"
            >
              Financial position
            </h2>
            <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
              Required Deposit is a requirement, not a payment. Posted events
              determine paid and refunded totals.
            </p>
          </div>
          <p className="text-xs text-[var(--sc-color-text-muted)]">
            Billing: {data.billingAddress || "Not recorded"}
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-2 divide-x divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)] sm:grid-cols-4">
          {financialMetrics.map(([label, value], index) => (
            <div
              key={label}
              className={`px-3 py-4 ${index % 4 === 0 ? "sm:border-l-0" : ""}`}
            >
              <dt className="text-xs text-[var(--sc-color-text-muted)]">
                {label}
              </dt>
              <dd
                className={`mt-1 text-lg font-medium tabular-nums ${
                  label === "Balance Due"
                    ? "text-[var(--sc-color-critical)]"
                    : ""
                }`}
              >
                ${Number(value).toFixed(2)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="invoice-items-heading">
        <h2 id="invoice-items-heading" className="text-xl font-semibold">
          Issued items
        </h2>
        <div className="mt-3 divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)]">
          {data.items.map((item) => {
            const flooringSummary = formatFlooringSubtitle({
              flooringMaterial: item.variant?.product?.flooringMaterial,
              flooringWearLayer: item.variant?.product?.flooringWearLayer,
              flooringThicknessMm: item.variant?.product?.flooringThicknessMm,
              flooringPlankLengthIn:
                item.variant?.product?.flooringPlankLengthIn,
              flooringPlankWidthIn: item.variant?.product?.flooringPlankWidthIn,
              flooringCoreThicknessMm:
                item.variant?.product?.flooringCoreThicknessMm,
              flooringInstallation: item.variant?.product?.flooringInstallation,
              flooringUnderlayment: item.variant?.product?.flooringUnderlayment,
              flooringUnderlaymentType:
                item.variant?.product?.flooringUnderlaymentType,
              flooringUnderlaymentMm:
                item.variant?.product?.flooringUnderlaymentMm,
              flooringBoxCoverageSqft:
                item.variant?.product?.flooringBoxCoverageSqft,
            });
            const specSubtitle =
              flooringSummary ||
              getCustomerSpecLine(
                getEffectiveSpecs(
                  {
                    frameMaterialDefault:
                      item.variant?.product?.frameMaterialDefault,
                    openingTypeDefault:
                      item.variant?.product?.openingTypeDefault,
                    slidingConfigDefault:
                      item.variant?.product?.slidingConfigDefault,
                    glassTypeDefault: item.variant?.product?.glassTypeDefault,
                    glassCoatingDefault:
                      item.variant?.product?.glassCoatingDefault,
                    glassThicknessMmDefault:
                      item.variant?.product?.glassThicknessMmDefault,
                    glassFinishDefault:
                      item.variant?.product?.glassFinishDefault,
                    screenDefault: item.variant?.product?.screenDefault,
                  },
                  {
                    glassTypeOverride: item.variant?.glassTypeOverride,
                    slidingConfigOverride: item.variant?.slidingConfigOverride,
                    glassCoatingOverride: item.variant?.glassCoatingOverride,
                    glassThicknessMmOverride:
                      item.variant?.glassThicknessMmOverride,
                    glassFinishOverride: item.variant?.glassFinishOverride,
                    screenOverride: item.variant?.screenOverride,
                    openingTypeOverride: item.variant?.openingTypeOverride,
                    detailText: item.description,
                  },
                ),
              );
            const title = flooringSummary
              ? String(
                  item.variant?.displayName ?? item.titleSnapshot ?? "",
                ).trim() || "-"
              : formatLineItemTitle({
                  variant: {
                    title: item.titleSnapshot,
                    sku: item.skuSnapshot,
                    detailText: item.description,
                  },
                });
            const quantityText =
              flooringSummary &&
              Number(item.variant?.product?.flooringBoxCoverageSqft ?? 0) > 0
                ? formatBoxesSqftSummary(
                    Number(item.qty ?? 0),
                    Number(item.variant?.product?.flooringBoxCoverageSqft ?? 0),
                  )
                : `${Number(item.qty).toFixed(2)} ${item.uomSnapshot || "unit"}`;
            return (
              <article
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-xs text-[var(--sc-color-text-muted)]">
                    {formatInternalSubtitle({
                      variantSku: item.skuSnapshot ?? "-",
                      available: item.available,
                    })}
                  </p>
                  {specSubtitle ? (
                    <p className="text-xs text-[var(--sc-color-text-secondary)]">
                      {specSubtitle}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--sc-color-text-secondary)]">
                    {quantityText}
                  </p>
                  <p className="font-medium tabular-nums">
                    ${Number(item.lineTotal).toFixed(2)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="allocated-payments-heading">
        <h2 id="allocated-payments-heading" className="text-xl font-semibold">
          Allocated Invoice Payments
        </h2>
        {data.payments.length === 0 ? (
          <p className="mt-3 border-y border-[var(--sc-color-divider)] py-5 text-sm text-[var(--sc-color-text-secondary)]">
            No payments are allocated to this invoice yet.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)]">
            {data.payments.map((payment) => (
              <article
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium">
                    {payment.paymentType === "DEPOSIT" ? "Deposit" : "Payment"}{" "}
                    · {payment.status}
                  </p>
                  <p className="text-sm text-[var(--sc-color-text-secondary)]">
                    {new Date(payment.receivedAt).toLocaleString("en-US", {
                      timeZone: "UTC",
                    })}{" "}
                    · {payment.method} ·{" "}
                    {payment.referenceNumber || "No reference"}
                  </p>
                  <p className="text-xs text-[var(--sc-color-text-muted)]">
                    Payment ID {payment.id}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">
                    ${Number(payment.amount).toFixed(2)}
                  </span>
                  {data.salesOrder?.id ? (
                    <Link
                      href={`/sales-orders/${data.salesOrder.id}/payments/${payment.id}/receipt`}
                      className="ios-secondary-btn flex min-h-11 items-center px-3 text-sm"
                    >
                      Open Payment
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="border-y border-[var(--sc-color-divider)] py-4" open>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                Unallocated Order Payments
              </h2>
              <p className="text-sm text-[var(--sc-color-text-secondary)]">
                Available: ${Number(data.unallocatedPaymentTotal).toFixed(2)}
              </p>
            </div>
            <span className="text-sm text-[var(--sc-color-accent)]">
              Review
            </span>
          </div>
        </summary>
        <div className="mt-4 divide-y divide-[var(--sc-color-divider)]">
          {data.unallocatedPayments.length === 0 ? (
            <p className="py-3 text-sm text-[var(--sc-color-text-secondary)]">
              No unallocated order payments are available for this invoice.
            </p>
          ) : (
            data.unallocatedPayments.map((payment) => {
              const amount = Number(payment.amount);
              const exceedsBalance = amount > Number(data.balanceDue) + 0.0001;
              return (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {payment.paymentType} · ${amount.toFixed(2)}
                    </p>
                    <p className="text-sm text-[var(--sc-color-text-secondary)]">
                      {payment.method} ·{" "}
                      {payment.referenceNumber || "No reference"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void allocatePaymentToInvoice(payment.id)}
                    disabled={
                      saving || data.status === "void" || exceedsBalance
                    }
                    className="ios-secondary-btn min-h-11 px-3 text-sm disabled:opacity-50"
                  >
                    {allocatingPaymentId === payment.id
                      ? "Applying..."
                      : exceedsBalance
                        ? "Exceeds Balance"
                        : "Apply to Invoice"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </details>

      <Dialog
        open={openPayment}
        onOpenChange={(open) => {
          setOpenPayment(open);
          if (!open) setPaymentIntentKey(createPaymentIntentKey());
        }}
      >
        <DialogContent>
          <form onSubmit={addPayment} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add Payment</DialogTitle>
              <DialogDescription>
                Current balance{" "}
                {currentBalance.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm">Amount</span>
                <input
                  className="ios-input mt-1 min-h-11 w-full px-3 text-sm"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                  autoFocus
                />
              </label>
              {isOverPayment ? (
                <p
                  role="alert"
                  className="rounded-md border border-[var(--sc-color-warning)] bg-[var(--sc-color-warning-surface)] px-3 py-2 text-sm text-[var(--sc-color-warning)]"
                >
                  Payment exceeds the current balance.
                </p>
              ) : null}
              <label className="block">
                <span className="text-sm">Method</span>
                <select
                  className="ios-input mt-1 min-h-11 w-full px-3 text-sm"
                  value={paymentForm.method}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      method: event.target.value,
                    }))
                  }
                >
                  <option value="CASH">Cash</option>
                  <option value="CHECK">Check</option>
                  <option value="CARD">Card</option>
                  <option value="BANK">Bank</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm">Payment type</span>
                <select
                  className="ios-input mt-1 min-h-11 w-full px-3 text-sm"
                  value={paymentForm.type}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                >
                  <option value="DEPOSIT">Deposit</option>
                  <option value="FINAL">Final Payment</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm">Reference</span>
                <input
                  className="ios-input mt-1 min-h-11 w-full px-3 text-sm"
                  value={paymentForm.referenceNumber}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      referenceNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm">Received date and time</span>
                <input
                  className="ios-input mt-1 min-h-11 w-full px-3 text-sm"
                  type="datetime-local"
                  value={paymentForm.receivedAt}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      receivedAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm">Notes</span>
                <textarea
                  className="ios-input mt-1 min-h-20 w-full px-3 py-2 text-sm"
                  value={paymentForm.notes}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => {
                  setOpenPayment(false);
                  setPaymentIntentKey(createPaymentIntentKey());
                }}
                className="ios-secondary-btn min-h-11 px-3 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ios-primary-btn min-h-11 px-4 text-sm"
                disabled={saving || isOverPayment}
              >
                {saving ? "Posting..." : "Save Payment"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PDFPreviewModal
        open={Boolean(pdfPreview)}
        title={pdfPreview?.title ?? "PDF Preview"}
        src={pdfPreview?.src ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </section>
  );
}
