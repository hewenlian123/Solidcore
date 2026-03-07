"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/layout/role-provider";
import { Spinner } from "@/components/ui/spinner";
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
import { TableSkeletonRows } from "@/components/ui/table-skeleton";

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

type InventoryAlertsPayload = {
  lowStockCount: number;
};

export default function OrdersPage() {
  const router = useRouter();
  const { role } = useRole();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<"QUOTE" | "SALES_ORDER">("SALES_ORDER");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingDocType, setCreatingDocType] = useState<"QUOTE" | "SALES_ORDER" | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const ordersQuery = useQuery({
    queryKey: ["sales-orders", role, docTypeFilter, statusFilter, specialOnly, debouncedQuery],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("doc_type", docTypeFilter);
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (specialOnly) params.set("special_order", "true");
      const res = await fetch(`/api/sales-orders?${params.toString()}`, {
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch orders");
      return (payload.data ?? []) as Row[];
    },
  });

  const snapshotQuery = useQuery({
    queryKey: ["orders-snapshot", role],
    queryFn: async () => {
      const res = await fetch("/api/orders/snapshot", {
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load snapshot");
      return payload as SnapshotPayload;
    },
  });

  const alertsQuery = useQuery({
    queryKey: ["inventory-alerts", role],
    queryFn: async () => {
      const res = await fetch("/api/inventory/alerts", {
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load alerts");
      return {
        lowStockCount: Number(payload?.data?.lowStockCount ?? 0),
      } as InventoryAlertsPayload;
    },
  });

  const rows = ordersQuery.data ?? [];
  const snapshot = snapshotQuery.data ?? null;
  const alerts = alertsQuery.data ?? { lowStockCount: 0 };
  const loading = ordersQuery.isLoading && !ordersQuery.data;
  const resolvedError = error ?? (ordersQuery.error instanceof Error ? ordersQuery.error.message : null);

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
      await Promise.all([ordersQuery.refetch(), snapshotQuery.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sales order");
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateOrder = (docType: "QUOTE" | "SALES_ORDER") => {
    setCreatingDocType(docType);
    router.push(`/sales-orders/new?docType=${docType}`);
  };

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
      <div className="glass-card p-6">
        <div className="glass-card-content flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Order Management
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Manage quotes and sales orders with quick conversion actions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCreateOrder("SALES_ORDER")}
              disabled={creatingDocType !== null}
              className="ios-primary-btn inline-flex h-12 items-center gap-2 px-4"
            >
              <Plus className="h-4 w-4" />
              {creatingDocType === "SALES_ORDER" ? "Creating..." : "New Sales Order"}
            </button>
            <button
              type="button"
              onClick={() => openCreateOrder("QUOTE")}
              disabled={creatingDocType !== null}
              className="ios-secondary-btn inline-flex h-12 items-center gap-2 px-4"
            >
              <Plus className="h-4 w-4" />
              {creatingDocType === "QUOTE" ? "Creating..." : "New Quote"}
            </button>
          </div>
        </div>
        <div
          className={`glass-card-content mt-4 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 text-sm sm:grid-cols-2 ${
            hasMonthData ? "xl:grid-cols-5" : "xl:grid-cols-3"
          }`}
        >
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition-colors hover:bg-white/[0.06]">
            <p className="text-[11px] uppercase tracking-wide text-white/40">This Month Sales</p>
            <p className="text-lg font-semibold text-white">${Number(snapshot?.monthSales ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition-colors hover:bg-white/[0.06]">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Orders Count</p>
            <p className="text-lg font-semibold text-white">{snapshot?.monthOrders ?? 0}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/products?filter=low&lowStockOnly=true")}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-left transition hover:bg-rose-500/20"
          >
            <p className="text-[11px] uppercase tracking-wide text-rose-300">Low Stock Items</p>
            <p className="text-lg font-semibold text-rose-200">{alerts.lowStockCount}</p>
            <p className="text-xs text-rose-400/80">Based on available boxes</p>
          </button>
          {hasMonthData ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition-colors hover:bg-white/[0.06]">
              <p className="text-[11px] uppercase tracking-wide text-white/40">Top Product</p>
              {topProductLink ? (
                <button
                  type="button"
                  onClick={() => router.push(topProductLink)}
                  className="max-w-full cursor-pointer truncate text-left text-sm font-medium text-white underline-offset-2 hover:text-slate-300 hover:underline"
                >
                  {snapshot?.topProduct?.name ?? "-"}
                </button>
              ) : (
                <p className="truncate text-sm font-medium text-white">{snapshot?.topProduct?.name ?? "-"}</p>
              )}
              <p className="text-xs text-white/40">${Number(snapshot?.topProduct?.amount ?? 0).toFixed(2)}</p>
            </div>
          ) : null}
          {hasMonthData ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition-colors hover:bg-white/[0.06]">
              <p className="text-[11px] uppercase tracking-wide text-white/40">Top Customer</p>
              {topCustomerLink ? (
                <button
                  type="button"
                  onClick={() => router.push(topCustomerLink)}
                  className="max-w-full cursor-pointer truncate text-left text-sm font-medium text-white underline-offset-2 hover:text-slate-300 hover:underline"
                >
                  {snapshot?.topCustomer?.name ?? "-"}
                </button>
              ) : (
                <p className="truncate text-sm font-medium text-white">{snapshot?.topCustomer?.name ?? "-"}</p>
              )}
              <p className="text-xs text-white/40">${Number(snapshot?.topCustomer?.amount ?? 0).toFixed(2)}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex rounded-2xl border border-white/[0.12] bg-white/[0.06] p-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setDocTypeFilter("QUOTE")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                docTypeFilter === "QUOTE"
                  ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg"
                  : "bg-transparent text-white/70 hover:bg-white/[0.06]"
              }`}
            >
              Quotes
            </button>
            <button
              type="button"
              onClick={() => setDocTypeFilter("SALES_ORDER")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                docTypeFilter === "SALES_ORDER"
                  ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg"
                  : "bg-transparent text-white/70 hover:bg-white/[0.06]"
              }`}
            >
              Sales Orders
            </button>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by order # / customer / phone"
              className="ios-input h-11 w-full pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="glass-card-content mt-3 flex flex-wrap items-center gap-2">
          {statusOptions.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                statusFilter === status
                  ? "border-transparent bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg"
                  : "border-white/[0.12] bg-white/[0.05] text-white/70 hover:bg-white/[0.08]"
              }`}
            >
              {status === "ALL" ? "All Statuses" : getSalesOrderStatusLabel(status)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSpecialOnly((prev) => !prev)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              specialOnly
                ? "border-transparent bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg"
                : "border-white/[0.12] bg-white/[0.05] text-white/70 hover:bg-white/[0.08]"
            }`}
          >
            Special Order
          </button>
        </div>
      </div>

      {resolvedError ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {resolvedError}
        </div>
      ) : null}

      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">#</TableHead>
              <TableHead className="text-slate-400">Customer</TableHead>
              <TableHead className="text-slate-400">Job</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Total</TableHead>
              <TableHead className="text-slate-400">Paid</TableHead>
              <TableHead className="text-slate-400">Balance</TableHead>
              <TableHead className="text-slate-400">Supplier</TableHead>
              <TableHead className="text-slate-400">ETA</TableHead>
              <TableHead className="text-slate-400">Special Status</TableHead>
              <TableHead className="text-slate-400">Created</TableHead>
              <TableHead className="text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows columns={12} rows={8} />
            ) : rows.length === 0 ? (
              <TableRow className="border-white/10">
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
                  className="group cursor-pointer border-white/10 text-slate-300 transition-colors duration-200 hover:bg-white/[0.06]"
                  onClick={() => router.push(`/sales-orders/${row.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/sales-orders/${row.id}`);
                    }
                  }}
                >
                  <TableCell className="font-bold text-white">
                    {row.orderNumber}
                  </TableCell>
                  <TableCell>
                    <p className="text-white">{row.customer.name}</p>
                    <p className="text-xs text-slate-500">{row.customer.phone ?? "-"}</p>
                  </TableCell>
                  <TableCell className="text-slate-300">{row.projectName || "-"}</TableCell>
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
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                    }`}
                  >
                    {Number(row.balanceDue) <= 0
                      ? "Paid"
                      : `$${Number(row.balanceDue).toFixed(2)}`}
                  </span>
                </TableCell>
                <TableCell className="text-slate-400">{row.specialOrder ? row.supplier?.name ?? "-" : "-"}</TableCell>
                <TableCell className="text-slate-400">
                  {row.specialOrder && row.etaDate
                    ? new Date(row.etaDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                    : "-"}
                </TableCell>
                <TableCell className="text-slate-400">{row.specialOrder ? row.specialOrderStatus ?? "-" : "-"}</TableCell>
                <TableCell className="text-slate-500">
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
                            void ordersQuery.refetch();
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-40"
                        aria-label={`Delete ${row.orderNumber}`}
                        title="Delete sales order"
                      >
                        {deletingId === row.id ? (
                          <Spinner className="h-4 w-4 text-rose-300" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                      <span
                        className="ml-1 inline-flex items-center text-slate-500 opacity-60 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
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
