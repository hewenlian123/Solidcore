"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  MapPin,
  MessageSquareText,
  Plus,
  RotateCcw,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  ArchiveCustomerDialog,
  MergeCustomerDialog,
} from "@/components/customers/customer-lifecycle-dialogs";
import {
  AddContactDialog,
  AddFollowUpDialog,
  AddJobSiteDialog,
  AddNoteDialog,
  CompleteFollowUpDialog,
} from "@/components/customers/customer-workspace-dialogs";
import { useRole } from "@/components/layout/role-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusLabel } from "@/components/ui/status-label";
import { cn } from "@/lib/utils";

type WorkspaceTab = "OVERVIEW" | "ORDERS" | "FINANCIAL" | "ACTIVITY";

type WorkspaceData = {
  profile: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    installAddress: string | null;
    billingAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    companyName: string | null;
    customerType: string | null;
    taxExempt: boolean;
    taxRate: number | null;
    archivedAt: string | null;
    createdAt: string;
  };
  summary: {
    totalOrders: number;
    openOrders: number;
    unpaidBalance: number;
    lastOrderDate: string | null;
    pendingDeliveryCount: number;
    specialOrderCount: number;
    unpaidCount: number;
  };
  contacts: Array<{
    id: string;
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    isPrimary: boolean;
  }>;
  jobSites: Array<{
    id: string;
    name: string;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zipCode: string;
    notes: string | null;
    active: boolean;
    contact: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    } | null;
  }>;
  followUps: Array<{
    id: string;
    owner: string;
    dueAt: string;
    nextAction: string;
    status: "OPEN" | "COMPLETED" | "CANCELLED";
    completionNote: string | null;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    createdAt: string;
    status: string;
    total: number;
    paidTotal: number;
    balance: number;
    deliveryRequired: boolean;
    deliveryStatus: string | null;
    isSpecialOrder: boolean;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    salesOrderId: string;
    status: string;
    issueDate: string;
    total: number;
    paid: number;
    balance: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    paymentType: string;
    status: string;
    referenceNumber: string | null;
    receivedAt: string;
    orderNumber: string;
    invoiceNumber: string | null;
    invoiceId: string | null;
  }>;
  aliases: Array<{
    id: string;
    kind: string;
    value: string;
    sourceCustomerId: string | null;
  }>;
  mergedCustomers: Array<{
    id: string;
    name: string;
    companyName: string | null;
    mergedAt: string | null;
    mergedBy: string | null;
    mergeReason: string | null;
  }>;
  activity: Array<{
    id: string;
    kind: string;
    title: string;
    detail: string;
    actor: string | null;
    occurredAt: string;
    href: string | null;
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}

function statusTone(status: string) {
  const value = status.toUpperCase();
  if (["COMPLETED", "FULFILLED", "PAID", "POSTED", "READY"].includes(value)) {
    return "success" as const;
  }
  if (["CANCELLED", "VOID", "REFUND"].includes(value))
    return "critical" as const;
  if (["PARTIAL", "PARTIALLY_FULFILLED", "OVERDUE"].includes(value)) {
    return "warning" as const;
  }
  return "info" as const;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { role } = useRole();
  const id = String(params.id || "");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("OVERVIEW");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addFollowUpOpen, setAddFollowUpOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [completingFollowUp, setCompletingFollowUp] = useState<{
    id: string;
    nextAction: string;
  } | null>(null);
  const [sessionName, setSessionName] = useState(role);

  const loadWorkspace = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${id}/workspace`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await response.json();
      if (
        response.status === 409 &&
        payload.code === "CUSTOMER_MERGED" &&
        payload.redirectCustomerId
      ) {
        router.replace(`/customers/${payload.redirectCustomerId}`);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "Could not load this customer.");
      }
      setData(payload.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load this customer.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, role, router]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.data?.name) setSessionName(payload.data.name);
      })
      .catch(() => undefined);
  }, []);

  const openFollowUps = useMemo(
    () =>
      data?.followUps.filter((followUp) => followUp.status === "OPEN") ?? [],
    [data?.followUps],
  );
  const followUpsInOverview = useMemo(
    () =>
      data?.followUps.filter(
        (followUp) => followUp.id !== openFollowUps[0]?.id,
      ) ?? [],
    [data?.followUps, openFollowUps],
  );

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <LoadingState
          title="Loading customer"
          description="Orders, Job Sites, and activity are being assembled."
        />
      </main>
    );
  }
  if (error && !data) {
    return (
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState
          title="Customer could not be loaded"
          description={error}
          actionLabel="Try again"
          onAction={loadWorkspace}
        />
      </main>
    );
  }
  if (!data) return null;

  const { profile, summary } = data;
  const customerName = profile.companyName || profile.name;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to customers"
            onClick={() => router.push("/customers")}
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {profile.companyName ? (
                    <Building2
                      aria-hidden="true"
                      className="h-5 w-5 text-foreground-secondary"
                    />
                  ) : (
                    <UserRound
                      aria-hidden="true"
                      className="h-5 w-5 text-foreground-secondary"
                    />
                  )}
                  <h1 className="truncate text-[28px] font-bold leading-9 text-foreground">
                    {customerName}
                  </h1>
                </div>
                {profile.companyName ? (
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Primary contact: {profile.name}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-foreground-secondary">
                  {[profile.phone, profile.email].filter(Boolean).join(" · ") ||
                    "No primary contact method"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {role === "ADMIN" && !profile.archivedAt ? (
                  <Button variant="ghost" onClick={() => setMergeOpen(true)}>
                    <UsersRound aria-hidden="true" className="h-4 w-4" />
                    Merge
                  </Button>
                ) : null}
                {role === "ADMIN" ? (
                  <Button
                    variant="outline"
                    onClick={() => setArchiveOpen(true)}
                  >
                    {profile.archivedAt ? (
                      <RotateCcw aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Archive aria-hidden="true" className="h-4 w-4" />
                    )}
                    {profile.archivedAt ? "Restore" : "Archive"}
                  </Button>
                ) : null}
                {!profile.archivedAt ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => setAddNoteOpen(true)}
                    >
                      <MessageSquareText
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                      Add note
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAddFollowUpOpen(true)}
                    >
                      <CalendarClock aria-hidden="true" className="h-4 w-4" />
                      Follow-Up
                    </Button>
                    <Button
                      onClick={() =>
                        router.push(
                          `/sales-orders/new?docType=SALES_ORDER&customerId=${id}`,
                        )
                      }
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      New sale
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-foreground-secondary">Open orders</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {summary.openOrders}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-secondary">
              Unpaid balance
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {money(summary.unpaidBalance)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-secondary">Job Sites</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {data.jobSites.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-secondary">
              Open Follow-Ups
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {openFollowUps.length}
            </dd>
          </div>
        </dl>
      </header>

      {error ? (
        <div className="mt-4 border-l-4 border-critical bg-critical-surface px-3 py-2.5">
          <p role="alert" className="text-sm font-medium text-critical">
            {error}
          </p>
        </div>
      ) : null}

      {profile.archivedAt ? (
        <section className="mt-5 border-y border-warning/30 bg-warning-surface px-4 py-3">
          <div className="flex items-start gap-3">
            <Archive
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-warning"
            />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Archived customer
              </h2>
              <p className="mt-1 text-sm text-foreground-secondary">
                History remains available, but new sales and customer edits are
                paused until an administrator restores this customer.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!profile.archivedAt && openFollowUps.length > 0 ? (
        <section className="mt-5 border-y border-warning/30 bg-warning-surface px-4 py-3">
          <div className="flex items-start gap-3">
            <CalendarClock
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-warning"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                Next Follow-Up
              </h2>
              <p className="mt-1 text-sm text-foreground">
                {openFollowUps[0].nextAction}
              </p>
              <p className="mt-1 text-xs text-foreground-secondary">
                {dateTime(openFollowUps[0].dueAt)} · {openFollowUps[0].owner}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCompletingFollowUp({
                  id: openFollowUps[0].id,
                  nextAction: openFollowUps[0].nextAction,
                })
              }
            >
              <Check aria-hidden="true" className="h-4 w-4" />
              Complete
            </Button>
          </div>
        </section>
      ) : null}

      <nav
        aria-label="Customer workspace"
        className="mt-5 flex gap-1 overflow-x-auto border-b border-border"
      >
        {(
          [
            ["OVERVIEW", "Overview"],
            ["ORDERS", "Orders"],
            ["FINANCIAL", "Financial"],
            ["ACTIVITY", "Activity"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold",
              tab === key
                ? "border-accent text-foreground"
                : "border-transparent text-foreground-secondary hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="py-6">
        {tab === "OVERVIEW" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    Contacts
                  </h2>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    People connected to this customer.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Add contact"
                  onClick={() => setAddContactOpen(true)}
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add
                </Button>
              </div>
              {data.contacts.length === 0 ? (
                <EmptyState
                  title="No contacts"
                  description="Add the person Sales or Delivery should contact."
                />
              ) : (
                <div className="divide-y divide-border">
                  {data.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex min-h-[76px] items-center gap-3 py-3"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sc bg-surface-secondary text-foreground-secondary">
                        <UserRound aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">
                            {contact.name}
                          </p>
                          {contact.isPrimary ? (
                            <StatusLabel tone="info">Primary</StatusLabel>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-foreground-secondary">
                          {[contact.role, contact.phone, contact.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    Job Sites
                  </h2>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Reusable locations for future delivery selection.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Add Job Site"
                  onClick={() => setAddSiteOpen(true)}
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add
                </Button>
              </div>
              {data.jobSites.length === 0 ? (
                <EmptyState
                  title="No Job Sites"
                  description="Add a delivery location without changing billing identity."
                />
              ) : (
                <div className="divide-y divide-border">
                  {data.jobSites.map((site) => (
                    <div key={site.id} className="flex min-h-[88px] gap-3 py-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sc bg-surface-secondary text-foreground-secondary">
                        <MapPin aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">
                          {site.name}
                        </p>
                        <p className="mt-1 text-sm text-foreground-secondary">
                          {[
                            site.address1,
                            site.address2,
                            site.city,
                            site.state,
                            site.zipCode,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                        {site.contact ? (
                          <p className="mt-1 text-xs text-foreground-secondary">
                            Site contact: {site.contact.name}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="lg:col-span-2">
              <div className="border-b border-border pb-3">
                <h2 className="text-xl font-bold text-foreground">
                  Follow-Ups
                </h2>
                <p className="mt-1 text-sm text-foreground-secondary">
                  Owned next actions with explicit due dates.
                </p>
              </div>
              {data.followUps.length === 0 ? (
                <EmptyState
                  title="No Follow-Ups"
                  description="Create one when a customer needs a specific next action."
                />
              ) : (
                <div className="divide-y divide-border">
                  {followUpsInOverview.map((followUp) => (
                    <div
                      key={followUp.id}
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">
                            {followUp.nextAction}
                          </p>
                          <StatusLabel tone={statusTone(followUp.status)}>
                            {followUp.status}
                          </StatusLabel>
                        </div>
                        <p className="mt-1 text-xs text-foreground-secondary">
                          {dateTime(followUp.dueAt)} · {followUp.owner}
                        </p>
                      </div>
                      {followUp.status === "OPEN" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCompletingFollowUp({
                              id: followUp.id,
                              nextAction: followUp.nextAction,
                            })
                          }
                        >
                          Complete
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {followUpsInOverview.length === 0 &&
                  openFollowUps.length > 0 ? (
                    <p className="py-5 text-sm text-foreground-secondary">
                      The next Follow-Up is shown above.
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            {data.aliases.length > 0 || data.mergedCustomers.length > 0 ? (
              <section className="lg:col-span-2">
                <div className="border-b border-border pb-3">
                  <h2 className="text-xl font-bold text-foreground">
                    Aliases and merged history
                  </h2>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Former identities remain searchable while original
                    transaction links stay auditable.
                  </p>
                </div>
                <div className="grid gap-6 py-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Search aliases
                    </h3>
                    {data.aliases.length === 0 ? (
                      <p className="mt-2 text-sm text-foreground-secondary">
                        No aliases recorded.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {data.aliases.map((alias) => (
                          <li
                            key={alias.id}
                            className="text-sm text-foreground-secondary"
                          >
                            <span className="font-medium text-foreground">
                              {alias.value}
                            </span>{" "}
                            · {alias.kind.toLowerCase()}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Historical customer records
                    </h3>
                    {data.mergedCustomers.length === 0 ? (
                      <p className="mt-2 text-sm text-foreground-secondary">
                        No customer records have been merged here.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y divide-border">
                        {data.mergedCustomers.map((merged) => (
                          <li key={merged.id} className="py-2">
                            <p className="text-sm font-medium text-foreground">
                              {merged.companyName || merged.name}
                            </p>
                            <p className="mt-1 text-xs text-foreground-secondary">
                              {merged.mergedAt
                                ? dateTime(merged.mergedAt)
                                : "Merge time unavailable"}
                              {merged.mergedBy ? ` · ${merged.mergedBy}` : ""}
                            </p>
                            {merged.mergeReason ? (
                              <p className="mt-1 text-xs text-foreground-muted">
                                {merged.mergeReason}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "ORDERS" ? (
          <section>
            <div className="border-b border-border pb-3">
              <h2 className="text-xl font-bold text-foreground">Orders</h2>
              <p className="mt-1 text-sm text-foreground-secondary">
                Sales, delivery position, and Special Order context.
              </p>
            </div>
            {data.orders.length === 0 ? (
              <EmptyState
                title="No orders"
                description="This customer has no recorded orders."
              />
            ) : (
              <div className="divide-y divide-border">
                {data.orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {order.orderNumber}
                        </p>
                        <StatusLabel tone={statusTone(order.status)}>
                          {order.status}
                        </StatusLabel>
                        {order.isSpecialOrder ? (
                          <StatusLabel tone="warning">
                            Special Order
                          </StatusLabel>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-foreground-secondary">
                        {shortDate(order.createdAt)} · {money(order.total)} ·{" "}
                        {money(order.balance)} balance
                        {order.deliveryRequired
                          ? ` · Delivery ${order.deliveryStatus || "pending"}`
                          : " · Pickup"}
                      </p>
                    </div>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-4 w-4 text-foreground-secondary"
                    />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {tab === "FINANCIAL" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <div className="border-b border-border pb-3">
                <h2 className="text-xl font-bold text-foreground">Invoices</h2>
                <p className="mt-1 text-sm text-foreground-secondary">
                  Issued documents and current balance.
                </p>
              </div>
              {data.invoices.length === 0 ? (
                <EmptyState
                  title="No invoices"
                  description="No invoice has been issued."
                />
              ) : (
                <div className="divide-y divide-border">
                  {data.invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                      className="flex min-h-[72px] items-center gap-3 py-3"
                    >
                      <CircleDollarSign
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0 text-foreground-secondary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {invoice.invoiceNumber}
                          </span>
                          <StatusLabel tone={statusTone(invoice.status)}>
                            {invoice.status}
                          </StatusLabel>
                        </span>
                        <span className="mt-1 block text-xs text-foreground-secondary">
                          {shortDate(invoice.issueDate)} ·{" "}
                          {money(invoice.total)} total ·{" "}
                          {money(invoice.balance)} due
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="h-4 w-4 text-foreground-secondary"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section>
              <div className="border-b border-border pb-3">
                <h2 className="text-xl font-bold text-foreground">Payments</h2>
                <p className="mt-1 text-sm text-foreground-secondary">
                  Posted money events, including linked refunds.
                </p>
              </div>
              {data.payments.length === 0 ? (
                <EmptyState
                  title="No payments"
                  description="No money event is recorded."
                />
              ) : (
                <div className="divide-y divide-border">
                  {data.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex min-h-[72px] items-center gap-3 py-3"
                    >
                      <ClipboardList
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0 text-foreground-secondary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">
                            {money(payment.amount)}
                          </p>
                          <StatusLabel tone={statusTone(payment.status)}>
                            {payment.paymentType} · {payment.status}
                          </StatusLabel>
                        </div>
                        <p className="mt-1 text-xs text-foreground-secondary">
                          {dateTime(payment.receivedAt)} · {payment.method} ·{" "}
                          {payment.invoiceNumber || payment.orderNumber}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {tab === "ACTIVITY" ? (
          <section className="max-w-4xl">
            <div className="border-b border-border pb-3">
              <h2 className="text-xl font-bold text-foreground">Activity</h2>
              <p className="mt-1 text-sm text-foreground-secondary">
                Operational notes, Follow-Ups, orders, invoices, payments, and
                returns.
              </p>
            </div>
            {data.activity.length === 0 ? (
              <EmptyState
                title="No activity"
                description="Activity appears as customer work is recorded."
              />
            ) : (
              <ol className="divide-y divide-border">
                {data.activity.map((item) => (
                  <li key={item.id} className="flex gap-3 py-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sc bg-surface-secondary text-foreground-secondary">
                      {item.kind === "FOLLOW_UP" ? (
                        <CalendarClock aria-hidden="true" className="h-4 w-4" />
                      ) : item.kind === "NOTE" ? (
                        <MessageSquareText
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                      ) : (
                        <ClipboardList aria-hidden="true" className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <p className="font-semibold text-foreground">
                          {item.title}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-foreground-secondary">
                        {item.detail}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {dateTime(item.occurredAt)}
                        {item.actor ? ` · ${item.actor}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}
      </div>

      <AddContactDialog
        customerId={id}
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onSaved={loadWorkspace}
      />
      <AddJobSiteDialog
        customerId={id}
        contacts={data.contacts}
        open={addSiteOpen}
        onOpenChange={setAddSiteOpen}
        onSaved={loadWorkspace}
      />
      <AddFollowUpDialog
        customerId={id}
        defaultOwner={sessionName}
        open={addFollowUpOpen}
        onOpenChange={setAddFollowUpOpen}
        onSaved={loadWorkspace}
      />
      <AddNoteDialog
        customerId={id}
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        onSaved={loadWorkspace}
      />
      <CompleteFollowUpDialog
        customerId={id}
        followUp={completingFollowUp}
        open={Boolean(completingFollowUp)}
        onOpenChange={(open) => {
          if (!open) setCompletingFollowUp(null);
        }}
        onSaved={loadWorkspace}
      />
      <ArchiveCustomerDialog
        customerId={id}
        customerName={customerName}
        archived={Boolean(profile.archivedAt)}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onSaved={loadWorkspace}
      />
      <MergeCustomerDialog
        customerId={id}
        customerName={customerName}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        onMerged={(targetCustomerId) =>
          router.replace(`/customers/${targetCustomerId}`)
        }
      />
    </main>
  );
}
