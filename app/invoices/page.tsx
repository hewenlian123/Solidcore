"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  salesOrderNumber: string | null;
  customer: { id: string; name: string } | null;
  issueDate: string;
  dueDate: string | null;
  status: string;
  total: string;
  paidTotal: string;
  balanceDue: string;
};

type View = "ALL" | "OPEN" | "OVERDUE" | "PAID";

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function date(value: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
}

function statusLabel(status: string, balance: number) {
  if (status === "void") return "Void";
  if (balance <= 0) return "Paid";
  if (status === "partially_paid") return "Partial";
  if (status === "sent") return "Issued";
  return "Open";
}

export default function InvoicesPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("ALL");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/invoices", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "Failed to load invoices.");
        if (!cancelled)
          setRows(Array.isArray(payload.data) ? payload.data : []);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Failed to load invoices.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows.filter((row) => {
      const balance = Number(row.balanceDue);
      const matchesQuery =
        !normalized ||
        [row.invoiceNumber, row.salesOrderNumber, row.customer?.name].some(
          (value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(normalized),
        );
      if (!matchesQuery) return false;
      if (view === "PAID") return balance <= 0 && row.status !== "void";
      if (view === "OPEN") return balance > 0 && row.status !== "void";
      if (view === "OVERDUE") {
        if (!row.dueDate || balance <= 0 || row.status === "void") return false;
        return new Date(row.dueDate) < today;
      }
      return true;
    });
  }, [query, rows, view]);

  return (
    <section className="space-y-6" data-testid="invoice-workspace">
      <header className="flex items-end justify-between gap-4 border-b border-[var(--sc-color-divider)] pb-5">
        <div>
          <h1 className="text-[28px] font-semibold leading-9">
            Invoices & Payments
          </h1>
          <p className="mt-1 text-sm text-[var(--sc-color-text-secondary)]">
            Issued totals are fixed. Payments and refunds appear as linked
            events.
          </p>
        </div>
        <Link
          href="/sales-orders/new"
          className="ios-primary-btn inline-flex min-h-11 shrink-0 items-center px-4 text-sm md:hidden"
        >
          Create Sale
        </Link>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-xl">
          <span className="sr-only">Search invoices, orders, or customers</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sc-color-text-muted)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search invoice, order, or customer"
            className="ios-input min-h-11 w-full pl-10 pr-3 text-sm"
          />
        </label>
        <div
          className="inline-flex self-start rounded-md border border-[var(--sc-color-border)] p-1"
          aria-label="Invoice status view"
        >
          {(["ALL", "OPEN", "OVERDUE", "PAID"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={`min-h-9 rounded px-3 text-sm ${
                view === value
                  ? "bg-[var(--sc-color-selected)] font-medium"
                  : "text-[var(--sc-color-text-secondary)] hover:bg-[var(--sc-color-hover)]"
              }`}
            >
              {value === "ALL"
                ? "All"
                : value === "OPEN"
                  ? "Open"
                  : value === "OVERDUE"
                    ? "Overdue"
                    : "Paid"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--sc-color-critical)] bg-[var(--sc-color-critical-surface)] px-4 py-3 text-sm text-[var(--sc-color-critical)]"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="border-y border-[var(--sc-color-divider)] py-10 text-sm text-[var(--sc-color-text-secondary)]">
          Loading invoices...
        </p>
      ) : filtered.length === 0 ? (
        <p className="border-y border-[var(--sc-color-divider)] py-10 text-sm text-[var(--sc-color-text-secondary)]">
          No invoices match this view.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--sc-color-border)] text-left text-xs text-[var(--sc-color-text-muted)]">
                  <th className="px-3 py-3 font-medium">Invoice</th>
                  <th className="px-3 py-3 font-medium">Customer / Order</th>
                  <th className="px-3 py-3 font-medium">Issued / Due</th>
                  <th className="px-3 py-3 text-right font-medium">
                    Original Total
                  </th>
                  <th className="px-3 py-3 text-right font-medium">
                    Total Paid
                  </th>
                  <th className="px-3 py-3 text-right font-medium">
                    Balance Due
                  </th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const balance = Number(row.balanceDue);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--sc-color-divider)] hover:bg-[var(--sc-color-hover)]"
                    >
                      <td className="px-3 py-4">
                        <Link
                          href={`/invoices/${row.id}`}
                          className="font-medium text-[var(--sc-color-accent)] hover:underline"
                        >
                          {row.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-4">
                        <p>{row.customer?.name ?? "Unknown customer"}</p>
                        <p className="text-xs text-[var(--sc-color-text-muted)]">
                          {row.salesOrderNumber ?? "No order number"}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <p>{date(row.issueDate)}</p>
                        <p className="text-xs text-[var(--sc-color-text-muted)]">
                          Due {date(row.dueDate)}
                        </p>
                      </td>
                      <td className="px-3 py-4 text-right tabular-nums">
                        {money(row.total)}
                      </td>
                      <td className="px-3 py-4 text-right tabular-nums">
                        {money(row.paidTotal)}
                      </td>
                      <td className="px-3 py-4 text-right font-medium tabular-nums">
                        {money(balance)}
                      </td>
                      <td className="px-3 py-4">
                        {statusLabel(row.status, balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--sc-color-divider)] border-y border-[var(--sc-color-divider)] md:hidden">
            {filtered.map((row) => (
              <Link
                key={row.id}
                href={`/invoices/${row.id}`}
                className="block min-h-11 py-4 hover:bg-[var(--sc-color-hover)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{row.invoiceNumber}</p>
                    <p className="truncate text-sm text-[var(--sc-color-text-secondary)]">
                      {row.customer?.name ?? "Unknown customer"} ·{" "}
                      {row.salesOrderNumber ?? "No order"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">
                      {money(row.balanceDue)}
                    </p>
                    <p className="text-xs text-[var(--sc-color-text-muted)]">
                      Balance due
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
