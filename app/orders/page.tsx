"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { FileText, PackageSearch, Plus, ShoppingBag } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Button } from "@/components/ui/button";
import { OperationalRow } from "@/components/ui/operational-row";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusLabel, StatusTone } from "@/components/ui/status-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSalesOrderStatusLabel } from "@/lib/sales-order-ui";
import { cn } from "@/lib/utils";

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

const salesOrderStatuses = [
  "ALL",
  "DRAFT",
  "CONFIRMED",
  "READY",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
] as const;

const quoteStatuses = ["ALL", "DRAFT", "QUOTED", "CANCELLED"] as const;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatMoney(value: string) {
  return money.format(Number(value ?? 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function statusTone(status: string): StatusTone {
  if (status === "FULFILLED") return "success";
  if (status === "READY") return "info";
  if (status === "PARTIALLY_FULFILLED") return "warning";
  if (status === "CANCELLED") return "critical";
  return "neutral";
}

function OrdersPageFallback() {
  return (
    <div className="sc-workspace">
      <LoadingState title="Loading orders" description="Preparing the order workspace." />
    </div>
  );
}

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useRole();
  const initialDocType = searchParams.get("docType") === "QUOTE" ? "QUOTE" : "SALES_ORDER";
  const [docType, setDocType] = useState<"QUOTE" | "SALES_ORDER">(initialDocType);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [status, setStatus] = useState("ALL");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const ordersQuery = useQuery({
    queryKey: ["sales-orders", role, docType, status, specialOnly, debouncedQuery],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({ doc_type: docType });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (status !== "ALL") params.set("status", status);
      if (specialOnly) params.set("special_order", "true");
      const response = await fetch(`/api/sales-orders?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to load orders.");
      return (payload.data ?? []) as Row[];
    },
  });

  const rows = ordersQuery.data ?? [];
  const statusOptions = useMemo(
    () => (docType === "QUOTE" ? quoteStatuses : salesOrderStatuses),
    [docType],
  );
  const pageLabel = docType === "QUOTE" ? "Quotes" : "Orders";
  const createLabel = docType === "QUOTE" ? "Create Quote" : "Create Sale";

  const selectDocType = (nextDocType: "QUOTE" | "SALES_ORDER") => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("docType", nextDocType);
    setDocType(nextDocType);
    setStatus("ALL");
    setSpecialOnly(false);
    window.history.replaceState(
      window.history.state,
      "",
      `/orders?${nextParams.toString()}`,
    );
  };

  const openOrder = (id: string) => router.push(`/sales-orders/${id}`);

  return (
    <div className="sc-workspace">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="sc-page-title">{pageLabel}</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-foreground-secondary">
            Find, review, and continue customer work.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          loading={creating}
          onClick={() => {
            setCreating(true);
            router.push(`/sales-orders/new?docType=${docType}`);
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {createLabel}
        </Button>
      </header>

      <section className="mt-6 rounded-sc bg-surface p-3 sm:p-4" aria-label="Order filters">
        <div
          className="grid grid-cols-2 rounded-sc border border-border bg-surface-secondary p-1 sm:w-64"
          role="group"
          aria-label="Document type"
        >
          <button
            type="button"
            aria-pressed={docType === "SALES_ORDER"}
            onClick={() => selectDocType("SALES_ORDER")}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-sc-sm px-3 text-sm font-semibold transition-colors duration-fast",
              docType === "SALES_ORDER"
                ? "border border-border bg-surface text-foreground shadow-sc-low"
                : "text-foreground-secondary hover:bg-hover hover:text-foreground",
            )}
          >
            <ShoppingBag aria-hidden="true" className="h-4 w-4" />
            Orders
          </button>
          <button
            type="button"
            aria-pressed={docType === "QUOTE"}
            onClick={() => selectDocType("QUOTE")}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-sc-sm px-3 text-sm font-semibold transition-colors duration-fast",
              docType === "QUOTE"
                ? "border border-border bg-surface text-foreground shadow-sc-low"
                : "text-foreground-secondary hover:bg-hover hover:text-foreground",
            )}
          >
            <FileText aria-hidden="true" className="h-4 w-4" />
            Quotes
          </button>
        </div>

        <div className="mt-3 max-w-2xl">
          <SearchField
            label={`Search ${pageLabel.toLowerCase()}`}
            placeholder="Order number, customer, phone, or job"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
          />
        </div>

        <div className="mt-3 flex max-w-full items-center gap-2 overflow-x-auto pb-1" aria-label="Status views">
          {statusOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              onClick={() => setStatus(option)}
              className={cn(
                "h-9 shrink-0 rounded-sc-sm border px-3 text-[13px] font-semibold transition-colors duration-fast",
                status === option
                  ? "border-accent bg-accent-pale text-accent-hover"
                  : "border-border bg-surface text-foreground-secondary hover:bg-hover hover:text-foreground",
              )}
            >
              {option === "ALL" ? "All" : getSalesOrderStatusLabel(option)}
            </button>
          ))}
          {docType === "SALES_ORDER" ? (
            <button
              type="button"
              aria-pressed={specialOnly}
              onClick={() => setSpecialOnly((current) => !current)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-sc-sm border px-3 text-[13px] font-semibold transition-colors duration-fast",
                specialOnly
                  ? "border-accent bg-accent-pale text-accent-hover"
                  : "border-border bg-surface text-foreground-secondary hover:bg-hover hover:text-foreground",
              )}
            >
              <PackageSearch aria-hidden="true" className="h-4 w-4" />
              Special order
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-sc bg-surface" aria-label={`${pageLabel} results`}>
        {ordersQuery.isLoading && !ordersQuery.data ? (
          <LoadingState title={`Loading ${pageLabel.toLowerCase()}`} description="Checking current records." />
        ) : ordersQuery.isError ? (
          <ErrorState
            title={`Could not load ${pageLabel.toLowerCase()}`}
            description={ordersQuery.error instanceof Error ? ordersQuery.error.message : "Try again."}
            actionLabel="Try again"
            onAction={() => void ordersQuery.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={`No ${pageLabel.toLowerCase()} found`}
            description={
              query || status !== "ALL" || specialOnly
                ? "Clear or change the current filters."
                : `Create the first ${docType === "QUOTE" ? "quote" : "sale"} when the customer is ready.`
            }
          />
        ) : (
          <>
            <div className="md:hidden">
              {rows.map((row) => (
                <OperationalRow
                  key={row.id}
                  title={`${row.orderNumber} · ${row.customer.name}`}
                  description={[
                    row.projectName,
                    getSalesOrderStatusLabel(row.status),
                    row.specialOrder ? "Special order" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  detail={
                    Number(row.balanceDue) > 0
                      ? `${formatMoney(row.balanceDue)} due`
                      : formatMoney(row.total)
                  }
                  tone={Number(row.balanceDue) > 0 ? "warning" : "default"}
                  actionLabel={`Open ${row.orderNumber}`}
                  onAction={() => openOrder(row.id)}
                  className="px-4"
                />
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer / job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      tabIndex={0}
                      aria-label={`Open ${row.orderNumber}`}
                      className="cursor-pointer"
                      onClick={() => openOrder(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openOrder(row.id);
                        }
                      }}
                    >
                      <TableCell>
                        <span className="font-semibold text-foreground">{row.orderNumber}</span>
                        {row.specialOrder ? (
                          <span className="mt-0.5 block text-xs font-medium text-warning">
                            Special order
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="block font-medium text-foreground">{row.customer.name}</span>
                        <span className="mt-0.5 block text-xs text-foreground-secondary">
                          {row.projectName || row.customer.phone || "No job name"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusLabel tone={statusTone(row.status)}>
                          {getSalesOrderStatusLabel(row.status)}
                        </StatusLabel>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(row.total)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          Number(row.balanceDue) > 0 ? "text-warning" : "text-success",
                        )}
                      >
                        {Number(row.balanceDue) > 0 ? formatMoney(row.balanceDue) : "Paid"}
                      </TableCell>
                      <TableCell className="text-foreground-secondary">{formatDate(row.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageFallback />}>
      <OrdersContent />
    </Suspense>
  );
}
