"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { Spinner } from "@/components/ui/spinner";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  issueDate: string;
  dueDate: string | null;
  status: string;
  total: string;
  paidTotal: string;
  balanceDue: string;
};

function getStatusBadgeClass(status: string) {
  if (status === "paid") return "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30";
  if (status === "partially_paid") return "bg-amber-500/20 text-amber-300 border border-amber-400/30";
  if (status === "void") return "bg-white/10 text-slate-400 border border-white/10";
  if (status === "sent") return "bg-blue-500/20 text-blue-300 border border-blue-400/30";
  return "bg-white/5 text-slate-300 border border-white/10";
}

export default function InvoicesPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNPAID" | "OVERDUE" | "PAID">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pdfPreview, setPdfPreview] = useState<{ title: string; src: string } | null>(null);

  const load = async () => {
    try {
      setLoadingRows(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const qs = params.toString();
      const res = await fetch(qs ? `/api/invoices?${qs}` : "/api/invoices", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch invoices");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch invoices");
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filteredRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows.filter((row) => {
      const balance = Number(row.balanceDue);
      if (statusFilter === "PAID") return balance <= 0 || row.status === "paid";
      if (statusFilter === "UNPAID") return balance > 0 && row.status !== "void";
      if (statusFilter === "OVERDUE") {
        if (!row.dueDate) return false;
        const due = new Date(row.dueDate);
        due.setHours(0, 0, 0, 0);
        return due < today && balance > 0 && row.status !== "void";
      }
      return true;
    });
  }, [rows, statusFilter]);

  const renderSkeletonRows = (count: number) =>
    Array.from({ length: count }).map((_, idx) => (
      <tr key={`sk-${idx}`} className="h-14 border-b border-white/10">
        {Array.from({ length: 10 }).map((__, cIdx) => (
          <td key={`sk-${idx}-${cIdx}`} className="px-4 py-3">
            <div className="relative h-4 w-full overflow-hidden rounded-md bg-white/[0.06]">
              <div className="absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-[dashboardShimmer_1.6s_ease-in-out_infinite]" />
            </div>
          </td>
        ))}
      </tr>
    ));

  return (
    <section className="space-y-8">
      <div className="glass-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Invoices</h1>
        <p className="mt-2 text-sm text-slate-400">Invoice v1 generated from sales orders, with payment tracking.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice # / SO # / customer"
            className="ios-input h-10 w-64 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Issue Start</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="ios-input h-10 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Issue End</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="ios-input h-10 px-3 text-sm"
          />
        </label>
        <button type="button" onClick={load} disabled={loadingRows} className="ios-secondary-btn h-10 px-4 text-sm">
          <span className="inline-flex items-center gap-2">
            {loadingRows ? <Spinner className="text-white/60" /> : null}
            {loadingRows ? "Loading..." : "Apply"}
          </span>
        </button>
      </div>

      <div className="glass-card p-4">
        <div className="inline-flex rounded-2xl border border-white/[0.12] bg-white/[0.06] p-1.5 backdrop-blur-xl">
          {(["ALL", "UNPAID", "OVERDUE", "PAID"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-tight transition-all duration-150 ${
                statusFilter === value
                  ? "border-0 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)]"
                  : "border border-transparent bg-transparent text-white/80 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-left text-slate-400">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Issue Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows && rows.length === 0 ? (
              renderSkeletonRows(8)
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  No invoices found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="group h-14 cursor-pointer border-b border-white/10 text-slate-300 transition-colors duration-200 hover:bg-white/10"
                  onClick={() => router.push(`/invoices/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/invoices/${row.id}`);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-semibold text-white group-hover:rounded-l-lg">
                    {row.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 group-hover:rounded-r-lg">
                    {row.salesOrderNumber ? (
                      <Link
                        href={`/invoices/${row.id}`}
                        className="text-white underline-offset-2 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.salesOrderNumber}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">{row.customer?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    {new Date(row.issueDate).toLocaleDateString("en-US", { timeZone: "UTC" })}
                  </td>
                  <td className="px-4 py-3">
                    {row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-US", { timeZone: "UTC" }) : "-"}
                  </td>
                  <td className="px-4 py-3">${Number(row.total).toFixed(2)}</td>
                  <td className="px-4 py-3">${Number(row.paidTotal).toFixed(2)}</td>
                  <td className="px-4 py-3">${Number(row.balanceDue).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/invoices/${row.id}`}
                        className="ios-secondary-btn h-8 px-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        className="ios-secondary-btn h-8 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPdfPreview({
                            title: `Invoice ${row.invoiceNumber} · PDF`,
                            src: `/api/pdf/invoice/${row.id}`,
                          });
                        }}
                      >
                        Print
                      </button>
                      <span
                        className="ml-auto inline-flex items-center text-slate-400 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
