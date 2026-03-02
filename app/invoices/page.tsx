"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";

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
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "partially_paid") return "bg-amber-100 text-amber-700";
  if (status === "void") return "bg-slate-200 text-slate-600";
  if (status === "sent") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

export default function InvoicesPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNPAID" | "OVERDUE" | "PAID">("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = async () => {
    try {
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

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Invoices</h1>
        <p className="mt-2 text-sm text-slate-500">Invoice v1 generated from sales orders, with payment tracking.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card flex flex-wrap items-end gap-3 p-6">
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
        <button type="button" onClick={load} className="ios-secondary-btn h-10 px-4 text-sm">
          Apply
        </button>
      </div>

      <div className="linear-card flex flex-wrap gap-2 p-4">
        {(["ALL", "UNPAID", "OVERDUE", "PAID"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`h-9 rounded-lg px-3 text-xs ${
              statusFilter === value ? "bg-slate-200 font-semibold text-slate-900" : "bg-slate-50 text-slate-600"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="linear-card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-slate-500">
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
            {filteredRows.length === 0 ? (
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
                  className="group h-14 cursor-pointer border-b border-slate-100 transition-colors duration-200 hover:bg-slate-100/70"
                  onClick={() => router.push(`/invoices/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/invoices/${row.id}`);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-semibold text-slate-900 group-hover:rounded-l-lg">
                    {row.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 group-hover:rounded-r-lg">
                    {row.salesOrderNumber ? (
                      <Link
                        href={`/invoices/${row.id}`}
                        className="text-slate-900 underline-offset-2 hover:underline"
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
                      <Link
                        href={`/invoices/${row.id}`}
                        className="ios-secondary-btn h-8 px-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Print
                      </Link>
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
    </section>
  );
}
