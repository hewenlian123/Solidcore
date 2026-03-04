"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  SALES_ORDER_STATUSES,
  getSalesOrderStatusBadge,
  getSalesOrderStatusLabel,
} from "@/lib/sales-order-ui";

type SalesOrderRow = {
  id: string;
  orderNumber: string;
  projectName: string | null;
  status: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  createdAt: string;
  customer: { name: string };
};

export default function SalesOrdersPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<SalesOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/sales-orders?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch sales orders");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sales orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const statuses = useMemo(() => ["ALL", ...SALES_ORDER_STATUSES], []);

  const openNewSalesOrder = () => {
    setCreating(true);
    router.push("/sales-orders/new?docType=SALES_ORDER");
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sales Orders</h1>
            <p className="mt-2 text-sm text-slate-500">
              Manage building-supply sales orders, payments, and balances.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewSalesOrder}
            disabled={creating}
            className="ios-primary-btn inline-flex h-12 items-center gap-2 px-4"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Creating..." : "New Sales Order"}
          </button>
        </div>
      </div>

      <div className="linear-card p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order # or customer"
              className="ios-input h-11 w-full pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === status
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {status === "ALL" ? "All" : getSalesOrderStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-500">
                  Loading sales orders...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-500">
                  No sales orders yet
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="group h-14 cursor-pointer odd:bg-white even:bg-slate-50/40 transition-colors duration-200 hover:bg-slate-100/70"
                  onClick={() => {
                    router.push(`/sales-orders/${row.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/sales-orders/${row.id}`);
                    }
                  }}
                >
                  <TableCell className="font-bold text-slate-900 group-hover:rounded-l-lg">
                    <Link
                      href={`/sales-orders/${row.id}`}
                      className="underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{row.customer.name}</TableCell>
                  <TableCell>{row.projectName || "-"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${getSalesOrderStatusBadge(
                        row.status,
                      )}`}
                    >
                      {getSalesOrderStatusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell>${Number(row.total).toFixed(2)}</TableCell>
                  <TableCell>${Number(row.paidAmount).toFixed(2)}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        Number(row.balanceDue) <= 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {Number(row.balanceDue) <= 0
                        ? "Paid"
                        : `$${Number(row.balanceDue).toFixed(2)}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                  </TableCell>
                  <TableCell className="text-right group-hover:rounded-r-lg">
                    <span
                      className="inline-flex items-center text-slate-400 opacity-20 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
                      aria-hidden="true"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
