"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3, PackageCheck, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Button } from "@/components/ui/button";
import { OperationalRow } from "@/components/ui/operational-row";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type WorkOrder = {
  id: string;
  orderNumber: string;
  projectName: string | null;
  customer: string;
  total: number;
  itemCount: number;
  updatedAt: string;
};

type ReadyOrder = WorkOrder & {
  status: "READY" | "PARTIALLY_FULFILLED";
  fulfillmentMethod: "PICKUP" | "DELIVERY";
};

type FollowUpReminder = {
  id: string;
  followupDate: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  product: string;
};

type UnpaidOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  balanceDue: number;
};

type OverdueDelivery = {
  id: string;
  salesOrderId: string;
  startAt: string;
  orderNumber: string;
  customer: string;
  address: string | null;
  status: string;
};

type DashboardData = {
  recentDraftOrders: WorkOrder[];
  readySalesOrders: ReadyOrder[];
  followUpReminders: FollowUpReminder[];
  topUnpaidOrders: UnpaidOrder[];
  overdueDeliveries: OverdueDelivery[];
};

type SearchData = {
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    total: number;
  }>;
  customers: Array<{
    id: string;
    name: string;
    phone: string | null;
    companyName: string | null;
  }>;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function roleLabel(role: "ADMIN" | "SALES" | "WAREHOUSE") {
  if (role === "ADMIN") return "Owner / Manager";
  if (role === "SALES") return "Sales";
  return "Warehouse / Receiving";
}

export default function DashboardPage() {
  const router = useRouter();
  const { role } = useRole();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim();

  const dashboardQuery = useQuery({
    queryKey: ["sales-desk", role],
    queryFn: async () => {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to load the Sales Desk.");
      return payload.data as DashboardData;
    },
  });

  const searchQuery = useQuery({
    queryKey: ["sales-desk-search", role, normalizedQuery],
    enabled: normalizedQuery.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({ q: normalizedQuery });
      const response = await fetch(`/api/search/global?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Search did not complete.");
      return {
        orders: Array.isArray(payload.data?.orders) ? payload.data.orders : [],
        customers: Array.isArray(payload.data?.customers) ? payload.data.customers : [],
      } as SearchData;
    },
  });

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: "Pacific/Honolulu",
      }).format(new Date()),
    [],
  );

  const data = dashboardQuery.data;
  const searchData = searchQuery.data;
  const showSearchResults = normalizedQuery.length >= 2;

  return (
    <div className="sc-workspace">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="sc-page-title">Sales Desk</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-foreground-secondary">
            {dateLabel} · {roleLabel(role)}
          </p>
        </div>
        <Button className="w-full sm:w-auto md:hidden" onClick={() => router.push("/sales-orders/new")}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Create Sale
        </Button>
      </header>

      <div className="relative mt-6 max-w-3xl">
        <SearchField
          label="Search orders or customers"
          placeholder="Search orders or customers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
        />
        {showSearchResults ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-sc border border-border bg-surface shadow-sc-raised">
            {searchQuery.isLoading ? (
              <p className="px-4 py-4 text-sm text-foreground-secondary">Searching...</p>
            ) : searchQuery.isError ? (
              <p role="alert" className="px-4 py-4 text-sm text-critical">
                Search did not complete. Try again.
              </p>
            ) : (searchData?.orders.length ?? 0) + (searchData?.customers.length ?? 0) === 0 ? (
              <p className="px-4 py-4 text-sm text-foreground-secondary">No matching orders or customers.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto p-2">
                {searchData?.orders.slice(0, 4).map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => router.push(`/sales-orders/${order.id}`)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-sc-sm px-3 py-2 text-left hover:bg-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {order.orderNumber}
                      </span>
                      <span className="block truncate text-xs text-foreground-secondary">
                        {order.customerName}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground-secondary">
                      {money.format(Number(order.total ?? 0))}
                    </span>
                  </button>
                ))}
                {searchData?.customers.slice(0, 4).map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="flex min-h-14 w-full items-center rounded-sc-sm px-3 py-2 text-left hover:bg-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {customer.name}
                      </span>
                      <span className="block truncate text-xs text-foreground-secondary">
                        {customer.companyName || customer.phone || "Customer"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <section className="mt-6 overflow-hidden rounded-sc bg-surface px-4 py-3 sm:px-6" aria-label="Sales Desk work">
        {dashboardQuery.isLoading ? (
          <LoadingState title="Loading today’s work" description="Checking orders that need action." />
        ) : dashboardQuery.isError ? (
          <ErrorState
            title="Could not load the Sales Desk"
            description={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Try again."}
            actionLabel="Try again"
            onAction={() => void dashboardQuery.refetch()}
          />
        ) : (
          <>
            <div className="py-2">
              <h2 className="text-sm font-bold leading-5 text-foreground">Continue Working</h2>
              <div className="mt-1">
                {(data?.recentDraftOrders ?? []).length === 0 &&
                (data?.followUpReminders ?? []).length === 0 ? (
                  <p className="py-4 text-sm text-foreground-secondary">No drafts or follow-ups waiting.</p>
                ) : (
                  <>
                    {data?.recentDraftOrders.slice(0, 3).map((order) => (
                      <OperationalRow
                        key={`draft-${order.id}`}
                        icon={<Clock3 aria-hidden="true" className="h-5 w-5 text-foreground-secondary" />}
                        title={`${order.orderNumber} · ${order.projectName || order.customer}`}
                        description={`${order.customer} · Resume ${order.itemCount}-item order`}
                        detail={money.format(order.total)}
                        actionLabel={`Resume ${order.orderNumber}`}
                        onAction={() => router.push(`/sales-orders/edit/${order.id}`)}
                      />
                    ))}
                    {data?.followUpReminders.slice(0, 3).map((reminder) => (
                      <OperationalRow
                        key={`follow-up-${reminder.id}`}
                        icon={<Clock3 aria-hidden="true" className="h-5 w-5 text-warning" />}
                        title={`${reminder.orderNumber} · ${reminder.customer}`}
                        description={`Follow up on ${reminder.product}`}
                        detail="Today"
                        tone="warning"
                        actionLabel={`Open ${reminder.orderNumber}`}
                        onAction={() => router.push(`/sales-orders/${reminder.orderId}`)}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-divider py-4">
              <h2 className="text-sm font-bold leading-5 text-foreground">Ready</h2>
              <div className="mt-1">
                {(data?.readySalesOrders ?? []).length === 0 ? (
                  <p className="py-4 text-sm text-foreground-secondary">No orders are ready right now.</p>
                ) : (
                  data?.readySalesOrders.slice(0, 6).map((order) => (
                    <OperationalRow
                      key={`ready-${order.id}`}
                      icon={<PackageCheck aria-hidden="true" className="h-5 w-5 text-success" />}
                      title={`${order.orderNumber} · ${order.projectName || order.customer}`}
                      description={`${order.customer} · ${
                        order.fulfillmentMethod === "PICKUP" ? "Pickup" : "Delivery"
                      } · ${order.itemCount} items`}
                      detail={order.status === "PARTIALLY_FULFILLED" ? "Partial" : "Ready"}
                      actionLabel={`Open ${order.orderNumber}`}
                      onAction={() => router.push(`/sales-orders/${order.id}`)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-divider py-4">
              <h2 className="text-sm font-bold leading-5 text-foreground">Needs Attention</h2>
              <div className="mt-1">
                {(data?.overdueDeliveries ?? []).length === 0 &&
                (data?.topUnpaidOrders ?? []).length === 0 ? (
                  <EmptyState
                    className="min-h-28 py-4"
                    title="Nothing needs attention"
                    description="Balances and overdue deliveries are clear."
                  />
                ) : (
                  <>
                    {data?.overdueDeliveries.slice(0, 3).map((delivery) => (
                      <OperationalRow
                        key={`overdue-${delivery.id}`}
                        icon={<AlertTriangle aria-hidden="true" className="h-5 w-5 text-blocking" />}
                        title={`${delivery.orderNumber} · ${delivery.customer}`}
                        description="Delivery is past its scheduled time"
                        detail="Overdue"
                        tone="critical"
                        actionLabel={`Review ${delivery.orderNumber}`}
                        onAction={() => router.push(`/sales-orders/${delivery.salesOrderId}`)}
                      />
                    ))}
                    {data?.topUnpaidOrders.slice(0, 3).map((order) => (
                      <OperationalRow
                        key={`balance-${order.id}`}
                        icon={<AlertTriangle aria-hidden="true" className="h-5 w-5 text-warning" />}
                        title={`${order.orderNumber} · ${order.customer}`}
                        description="Payment balance requires review"
                        detail={`${money.format(order.balanceDue)} due`}
                        tone="warning"
                        actionLabel={`Review ${order.orderNumber}`}
                        onAction={() => router.push(`/sales-orders/${order.id}`)}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
