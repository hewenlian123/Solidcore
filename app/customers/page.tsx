"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, MapPin, Plus, UserRound } from "lucide-react";
import { NewCustomerDialog } from "@/components/sales/new-customer-dialog";
import { useRole } from "@/components/layout/role-provider";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusLabel } from "@/components/ui/status-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SaleCustomer } from "@/app/sales-orders/create-sale-types";

type CustomerRow = SaleCustomer & {
  createdAt: string;
  primaryContact: {
    id: string;
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  primaryJobSite: {
    id: string;
    name: string;
    address1: string;
    city: string;
    state: string;
    zipCode: string;
  } | null;
  nextFollowUp: {
    id: string;
    owner: string;
    dueAt: string;
    nextAction: string;
  } | null;
  contactCount: number;
  jobSiteCount: number;
  archivedAt: string | null;
};

type CustomerView = "ALL" | "BUSINESS" | "INDIVIDUAL" | "ARCHIVED";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}

function displayName(customer: CustomerRow) {
  return customer.companyName || customer.name;
}

export default function CustomersPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CustomerView>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          const response = await fetch(
            `/api/customers?q=${encodeURIComponent(query.trim())}&status=${
              view === "ARCHIVED" ? "ARCHIVED" : "ACTIVE"
            }`,
            {
              cache: "no-store",
              headers: { "x-user-role": role },
              signal: controller.signal,
            },
          );
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Could not load customers.");
          }
          setRows(Array.isArray(payload.data) ? payload.data : []);
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError")
            return;
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load customers.",
          );
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 180 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, role, view]);

  const visibleRows = useMemo(() => {
    if (view === "BUSINESS") {
      return rows.filter(
        (customer) =>
          customer.customerType === "COMMERCIAL" ||
          customer.customerType === "CONTRACTOR" ||
          Boolean(customer.companyName),
      );
    }
    if (view === "INDIVIDUAL") {
      return rows.filter(
        (customer) =>
          customer.customerType === "RESIDENTIAL" && !customer.companyName,
      );
    }
    if (view === "ARCHIVED") return rows;
    return rows;
  }, [rows, view]);

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-9 text-foreground">
            Customers
          </h1>
          <p className="mt-1 text-sm text-foreground-secondary">
            Businesses, people, Job Sites, and the work connected to them.
          </p>
        </div>
        <Button onClick={() => setNewCustomerOpen(true)}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add customer
        </Button>
      </header>

      <section className="py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SearchField
            label="Search customers"
            placeholder="Business, contact, phone, email, or Job Site"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            className="md:max-w-xl"
          />
          <div
            aria-label="Customer view"
            className="grid grid-cols-4 gap-1 rounded-sc border border-border bg-surface-secondary p-1"
          >
            {(
              [
                ["ALL", "All"],
                ["BUSINESS", "Business"],
                ["INDIVIDUAL", "Individual"],
                ["ARCHIVED", "Archived"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={view === key ? "outline" : "ghost"}
                size="sm"
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <ErrorState
          title="Customers could not be loaded"
          description={error}
          actionLabel="Try again"
          onAction={() => setQuery((current) => `${current} `)}
        />
      ) : loading && rows.length === 0 ? (
        <LoadingState title="Loading customers" description="One moment." />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={query ? "No customers found" : "No customers yet"}
          description={
            query
              ? "Try a broader name, phone, address, or Job Site search."
              : "Create the first customer when the next sale begins."
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden border-y border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Primary contact</TableHead>
                  <TableHead>Job Sites</TableHead>
                  <TableHead>Next Follow-Up</TableHead>
                  <TableHead aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        router.push(`/customers/${customer.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-sc bg-surface-secondary text-foreground-secondary">
                          {customer.companyName ? (
                            <Building2 aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <UserRound aria-hidden="true" className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">
                            {displayName(customer)}
                          </span>
                          {customer.archivedAt ? (
                            <StatusLabel tone="warning">Archived</StatusLabel>
                          ) : null}
                          <span className="block truncate text-xs text-foreground-secondary">
                            {customer.companyName
                              ? customer.name
                              : customer.email || "Individual"}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {customer.primaryContact?.name || customer.name}
                      </p>
                      <p className="text-xs text-foreground-secondary">
                        {customer.primaryContact?.phone ||
                          customer.phone ||
                          customer.primaryContact?.email ||
                          customer.email ||
                          "No contact method"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {customer.jobSiteCount}
                      </p>
                      <p className="max-w-56 truncate text-xs text-foreground-secondary">
                        {customer.primaryJobSite?.name || "No Job Site"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {customer.nextFollowUp ? (
                        <>
                          <p className="font-medium text-foreground">
                            {formatDate(customer.nextFollowUp.dueAt)}
                          </p>
                          <p className="max-w-56 truncate text-xs text-foreground-secondary">
                            {customer.nextFollowUp.nextAction}
                          </p>
                        </>
                      ) : (
                        <span className="text-foreground-muted">None due</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight
                        aria-hidden="true"
                        className="ml-auto h-4 w-4 text-foreground-secondary"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border border-y border-border md:hidden">
            {visibleRows.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => router.push(`/customers/${customer.id}`)}
                className="flex min-h-[88px] w-full items-center gap-3 py-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sc bg-surface-secondary text-foreground-secondary">
                  {customer.companyName ? (
                    <Building2 aria-hidden="true" className="h-5 w-5" />
                  ) : (
                    <UserRound aria-hidden="true" className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {displayName(customer)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 truncate text-xs text-foreground-secondary">
                    <MapPin
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    {customer.primaryJobSite?.name ||
                      `${customer.jobSiteCount} Job Sites`}
                  </span>
                  {customer.nextFollowUp ? (
                    <span className="mt-1 block truncate text-xs font-medium text-warning">
                      Follow-Up {formatDate(customer.nextFollowUp.dueAt)}
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-foreground-secondary"
                />
              </button>
            ))}
          </div>
        </>
      )}

      <NewCustomerDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        onCustomerSelected={(customer) =>
          router.push(`/customers/${customer.id}`)
        }
      />
    </main>
  );
}
