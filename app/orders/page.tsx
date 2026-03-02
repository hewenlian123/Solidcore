"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import {
  SALES_ORDER_STATUSES,
  getSalesOrderStatusBadge,
  getSalesOrderStatusLabel,
} from "@/lib/sales-order-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  id: string;
  orderNumber: string;
  docType: "QUOTE" | "SALES_ORDER";
  projectName: string | null;
  status: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  specialOrder: boolean;
  specialOrderStatus: string | null;
  etaDate: string | null;
  supplier: { id: string; name: string } | null;
  customer: { name: string; phone: string | null };
  createdAt: string;
};

type SnapshotPayload = {
  monthSales: number;
  monthOrders: number;
  topProduct: {
    productId?: string;
    variantId?: string;
    name: string;
    amount: number;
  };
  topCustomer: {
    customerId: string;
    name: string;
    amount: number;
  };
};

export default function OrdersPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<"QUOTE" | "SALES_ORDER">("SALES_ORDER");
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("doc_type", docTypeFilter);
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (specialOnly) params.set("special_order", "true");
      const res = await fetch(`/api/sales-orders?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch orders");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  };

  const loadSnapshot = async () => {
    try {
      const res = await fetch("/api/orders/snapshot", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load snapshot");
      setSnapshot(payload);
    } catch {
      setSnapshot(null);
    }
  };

  const deleteSalesOrder = async (row: Row) => {
    const ok = window.confirm(`Delete ${row.orderNumber}? This action cannot be undone.`);
    if (!ok) return;
    try {
      setDeletingId(row.id);
      setError(null);
      const res = await fetch(`/api/sales-orders/${row.id}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete sales order");
      await load();
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sales order");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    load();
    loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, docTypeFilter, specialOnly, role]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const statusOptions = useMemo(() => ["ALL", ...SALES_ORDER_STATUSES], []);
  const hasMonthData = Number(snapshot?.monthOrders ?? 0) > 0;
  const topProductLink = useMemo(() => {
    if (!snapshot?.topProduct?.productId) return null;
    // Product detail page is not present in current app, fallback to list highlight.
    const params = new URLSearchParams();
    params.set("highlight", snapshot.topProduct.productId);
    if (snapshot.topProduct.variantId) params.set("variant", snapshot.topProduct.variantId);
    return `/products?${params.toString()}`;
  }, [snapshot?.topProduct?.productId, snapshot?.topProduct?.variantId]);
  const topCustomerLink = useMemo(() => {
    if (!snapshot?.topCustomer?.customerId) return null;
    // Customer detail page is not present in current app, fallback to list highlight.
    return `/customers?highlight=${snapshot.topCustomer.customerId}`;
  }, [snapshot?.topCustomer?.customerId]);

  return (
    <section className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Order Management
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Manage quotes and sales orders with quick conversion actions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/orders/new"
              className="ios-primary-btn inline-flex h-12 items-center gap-2 px-4"
            >
              <Plus className="h-4 w-4" />
              New Sales Order
            </Link>
            <Link
              href="/sales-orders/new?docType=QUOTE"
              className="ios-secondary-btn inline-flex h-12 items-center gap-2 px-4"
            >
              <Plus className="h-4 w-4" />
              New Quote
            </Link>
          </div>
        </div>
        <div
          className={`mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2 ${
            hasMonthData ? "xl:grid-cols-4" : "xl:grid-cols-2"
          }`}
        >
          <div className="rounded-md bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">This Month Sales</p>
            <p className="text-lg font-semibold text-slate-900">${Number(snapshot?.monthSales ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-md bg-white px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Orders Count</p>
            <p className="text-lg font-semibold text-slate-900">{snapshot?.monthOrders ?? 0}</p>
          </div>
          {hasMonthData ? (
            <div className="rounded-md bg-white px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Top Product</p>
              {topProductLink ? (
                <button
                  type="button"
                  onClick={() => router.push(topProductLink)}
                  className="max-w-full cursor-pointer truncate text-left text-sm font-medium text-slate-900 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  {snapshot?.topProduct?.name ?? "-"}
                </button>
              ) : (
                <p className="truncate text-sm font-medium text-slate-900">{snapshot?.topProduct?.name ?? "-"}</p>
              )}
              <p className="text-xs text-slate-500">${Number(snapshot?.topProduct?.amount ?? 0).toFixed(2)}</p>
            </div>
          ) : null}
          {hasMonthData ? (
            <div className="rounded-md bg-white px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Top Customer</p>
              {topCustomerLink ? (
                <button
                  type="button"
                  onClick={() => router.push(topCustomerLink)}
                  className="max-w-full cursor-pointer truncate text-left text-sm font-medium text-slate-900 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  {snapshot?.topCustomer?.name ?? "-"}
                </button>
              ) : (
                <p className="truncate text-sm font-medium text-slate-900">{snapshot?.topCustomer?.name ?? "-"}</p>
              )}
              <p className="text-xs text-slate-500">${Number(snapshot?.topCustomer?.amount ?? 0).toFixed(2)}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border border-slate-100 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setDocTypeFilter("QUOTE")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                docTypeFilter === "QUOTE" ? "bg-white text-slate-900" : "text-slate-600"
              }`}
            >
              Quotes
            </button>
            <button
              type="button"
              onClick={() => setDocTypeFilter("SALES_ORDER")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                docTypeFilter === "SALES_ORDER" ? "bg-white text-slate-900" : "text-slate-600"
              }`}
            >
              Sales Orders
            </button>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by order # / customer / phone"
              className="ios-input h-11 w-full pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {statusOptions.map((status) => (
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
              {status === "ALL" ? "All Statuses" : getSalesOrderStatusLabel(status)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSpecialOnly((prev) => !prev)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              specialOnly ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Special Order
          </button>
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
              <TableHead>#</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Special Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-slate-500">
                  Loading orders...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-slate-500">
                  No orders found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="group cursor-pointer odd:bg-white even:bg-slate-50/40 transition-colors duration-200 hover:bg-slate-100/70"
                  onClick={() => router.push(`/sales-orders/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/sales-orders/${row.id}`);
                    }
                  }}
                >
                  <TableCell className="font-bold text-slate-900">
                    {row.orderNumber}
                  </TableCell>
                  <TableCell>
                    <p>{row.customer.name}</p>
                    <p className="text-xs text-slate-500">{row.customer.phone ?? "-"}</p>
                  </TableCell>
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
                  <TableCell>{row.specialOrder ? row.supplier?.name ?? "-" : "-"}</TableCell>
                  <TableCell>
                    {row.specialOrder && row.etaDate
                      ? new Date(row.etaDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                      : "-"}
                  </TableCell>
                  <TableCell>{row.specialOrder ? row.specialOrderStatus ?? "-" : "-"}</TableCell>
                  <TableCell>
                    {new Date(row.createdAt).toLocaleDateString("en-US", {
                      timeZone: "UTC",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/sales-orders/${row.id}`}
                        className="ios-secondary-btn h-9 px-3 py-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                      {row.docType === "QUOTE" ? (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = window.confirm("Convert Quote to Sales Order?");
                            if (!ok) return;
                            const res = await fetch(`/api/sales-orders/${row.id}/convert`, {
                              method: "PATCH",
                              headers: { "x-user-role": role },
                            });
                            const payload = await res.json();
                            if (!res.ok) {
                              setError(payload.error ?? "Failed to convert quote");
                              return;
                            }
                            load();
                          }}
                          className="ios-secondary-btn h-9 px-3 py-2 text-xs"
                        >
                          Convert to Sales Order
                        </button>
                      ) : null}
                      <Link
                        href={`/orders/${row.id}/print`}
                        className="ios-secondary-btn h-9 px-3 py-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.docType === "QUOTE" ? "Print Quote" : "Print"}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteSalesOrder(row);
                        }}
                        disabled={deletingId === row.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                        aria-label={`Delete ${row.orderNumber}`}
                        title="Delete sales order"
                      >
                        {deletingId === row.id ? (
                          <span className="text-[11px] font-medium">...</span>
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                      <span
                        className="ml-1 inline-flex items-center text-slate-400 opacity-20 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
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
