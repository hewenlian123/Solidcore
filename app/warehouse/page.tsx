"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, PackageCheck, Search, Truck } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  WAREHOUSE_METHOD_FILTERS,
  WAREHOUSE_SECTION_DEFINITIONS,
  countWarehouseMethodSnapshot,
  countWarehouseSections,
  formatWarehouseStatus,
  getWarehousePrimaryAction,
  isRowInWarehouseSection,
  rowMatchesWarehouseMethod,
  type WarehouseFulfillmentType,
  type WarehouseMethodFilter,
  type WarehouseSectionId,
  normalizeWarehouseStatus,
} from "@/lib/warehouse-queue";

type WarehouseItem = {
  id: string;
  title: string;
  sku: string;
  unit: string;
  orderedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  isSpecialOrder: boolean;
  specialOrderStatus: string | null;
  linkedPoNumber: string | null;
  linkedPoStatus: string | null;
  linkedPoEta: string | null;
  supplierName: string | null;
};

type WarehouseRow = {
  id: string;
  type: WarehouseFulfillmentType;
  status: string;
  scheduledAt: string | null;
  timeWindow: string | null;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  address: string;
  itemCount: number;
  itemsCompleted: number;
  orderedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  items: WarehouseItem[];
  hasSpecialOrder: boolean;
  specialOrderSummary: {
    status: string | null;
    supplierName: string | null;
    eta: string | null;
    lineCount: number;
  } | null;
};

type SpecialFilter = "ALL" | "SPECIAL";

const methodIds = WAREHOUSE_METHOD_FILTERS.map((method) => method.id);
const sectionIds = WAREHOUSE_SECTION_DEFINITIONS.map((section) => section.id);

function visibleSections(method: WarehouseMethodFilter) {
  return WAREHOUSE_SECTION_DEFINITIONS.filter((section) => method === "delivery" || section.id !== "inDelivery");
}

function validMethodFilter(value: string | null): WarehouseMethodFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  return methodIds.includes(normalized as WarehouseMethodFilter) ? (normalized as WarehouseMethodFilter) : "pickup";
}

function validSectionId(value: string | null, method: WarehouseMethodFilter): WarehouseSectionId {
  const normalized = String(value ?? "").trim();
  const fallback: WarehouseSectionId = "needsReady";
  if (!sectionIds.includes(normalized as WarehouseSectionId)) return fallback;
  if (method === "pickup" && normalized === "inDelivery") return fallback;
  return normalized as WarehouseSectionId;
}

function warehousePath(args: { methodFilter: WarehouseMethodFilter; sectionId: WarehouseSectionId; search: string }) {
  const params = new URLSearchParams();
  params.set("method", args.methodFilter);
  params.set("section", args.sectionId);
  const search = args.search.trim();
  if (search) params.set("search", search);
  return `/warehouse?${params.toString()}`;
}

function parseWarehouseParams(searchParams: URLSearchParams) {
  let methodFilter = validMethodFilter(searchParams.get("method"));
  let sectionId = validSectionId(searchParams.get("section"), methodFilter);

  const legacyQueue = searchParams.get("queue");
  const legacyStage = searchParams.get("stage");
  if (legacyQueue === "pickup") {
    methodFilter = "pickup";
    sectionId = "ready";
  } else if (legacyQueue === "delivery") {
    methodFilter = "delivery";
    sectionId = "ready";
  } else if (legacyStage === "ready") {
    sectionId = "ready";
  } else if (legacyStage === "picking" || legacyStage === "toPick") {
    sectionId = "needsReady";
  }

  return {
    methodFilter,
    sectionId: validSectionId(sectionId, methodFilter),
    search: searchParams.get("search") ?? "",
  };
}

function statusBadgeClass(status: string) {
  const key = normalizeWarehouseStatus(status);
  if (key === "OUT_FOR_DELIVERY" || key === "OUT" || key === "IN_PROGRESS") {
    return "border-sky-400/20 bg-sky-500/15 text-sky-200";
  }
  if (key === "READY") return "border-cyan-400/20 bg-cyan-500/15 text-cyan-200";
  if (key === "PARTIAL") return "border-amber-400/20 bg-amber-500/15 text-amber-200";
  return "border-slate-400/20 bg-white/[0.06] text-slate-200";
}

function formatDate(value: string | null) {
  if (!value) return "No scheduled date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No scheduled date";
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatQty(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  });
}

function queueText(row: WarehouseRow) {
  const itemText = row.items
    .map((item) => `${item.sku} ${item.title}`)
    .join(" ")
    .toLowerCase();
  return [
    row.salesOrderNumber,
    row.customerName,
    row.status,
    row.type,
    row.address,
    itemText,
    row.specialOrderSummary?.supplierName ?? "",
    row.specialOrderSummary?.status ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function itemPreview(row: WarehouseRow) {
  if (!row.items.length) return "No item data";
  const [first, second] = row.items;
  const extra = row.items.length > 1 ? ` +${row.items.length - 1} more` : "";
  return `${first.sku || "-"} ${first.title || "Item"}${second ? extra : ""}`;
}

function specialLabel(row: WarehouseRow) {
  const summary = row.specialOrderSummary;
  if (!summary) return null;
  const status = summary.status ? summary.status.replaceAll("_", " ") : "Special Order";
  const supplier = summary.supplierName ? ` - ${summary.supplierName}` : "";
  const eta = summary.eta ? ` - ETA ${formatDate(summary.eta)}` : "";
  return `${status}${supplier}${eta}`;
}

function sectionLabel(sectionId: WarehouseSectionId, method: WarehouseMethodFilter) {
  const section = WAREHOUSE_SECTION_DEFINITIONS.find((item) => item.id === sectionId)!;
  return method === "delivery" ? section.deliveryLabel : section.pickupLabel;
}

function SpecialOrderNotice({ row }: { row: WarehouseRow }) {
  const label = specialLabel(row);
  if (!label) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-200">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export default function WarehouseOperationsPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [selectedSection, setSelectedSection] = useState<WarehouseSectionId>("needsReady");
  const [methodFilter, setMethodFilter] = useState<WarehouseMethodFilter>("pickup");
  const [search, setSearch] = useState("");
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(new Set<string>());

  const loadQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/fulfillments/outbound", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load Warehouse queue.");
      setRows((payload.data ?? []) as WarehouseRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Warehouse queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const applyUrlState = () => {
      const next = parseWarehouseParams(new URLSearchParams(window.location.search));
      setMethodFilter(next.methodFilter);
      setSelectedSection(next.sectionId);
      setSearch(next.search);
      const canonicalPath = warehousePath(next);
      if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
        window.history.replaceState(null, "", canonicalPath);
      }
    };
    applyUrlState();
    window.addEventListener("popstate", applyUrlState);
    return () => window.removeEventListener("popstate", applyUrlState);
  }, []);

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const searchableRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (specialFilter === "SPECIAL" && !row.hasSpecialOrder) return false;
      if (query && !queueText(row).includes(query)) return false;
      return true;
    });
  }, [rows, search, specialFilter]);

  const methodRows = useMemo(
    () => searchableRows.filter((row) => rowMatchesWarehouseMethod(row, methodFilter)),
    [searchableRows, methodFilter],
  );
  const sectionCounts = useMemo(
    () => countWarehouseSections(searchableRows, methodFilter),
    [searchableRows, methodFilter],
  );
  const methodSnapshot = useMemo(() => countWarehouseMethodSnapshot(searchableRows), [searchableRows]);
  const visibleRows = useMemo(
    () => methodRows.filter((row) => isRowInWarehouseSection(row, selectedSection)),
    [methodRows, selectedSection],
  );
  const selectedDefinition = WAREHOUSE_SECTION_DEFINITIONS.find((section) => section.id === selectedSection)!;
  const sectionOptions = visibleSections(methodFilter);

  const pushWarehouseState = (next: {
    methodFilter?: WarehouseMethodFilter;
    sectionId?: WarehouseSectionId;
    search?: string;
  }) => {
    const nextMethodFilter = next.methodFilter ?? methodFilter;
    const nextSectionId = validSectionId(next.sectionId ?? selectedSection, nextMethodFilter);
    const nextSearch = next.search ?? search;
    window.history.pushState(
      null,
      "",
      warehousePath({ methodFilter: nextMethodFilter, sectionId: nextSectionId, search: nextSearch }),
    );
  };

  const replaceWarehouseState = (next: {
    methodFilter?: WarehouseMethodFilter;
    sectionId?: WarehouseSectionId;
    search?: string;
  }) => {
    const nextMethodFilter = next.methodFilter ?? methodFilter;
    const nextSectionId = validSectionId(next.sectionId ?? selectedSection, nextMethodFilter);
    const nextSearch = next.search ?? search;
    window.history.replaceState(
      null,
      "",
      warehousePath({ methodFilter: nextMethodFilter, sectionId: nextSectionId, search: nextSearch }),
    );
  };

  const selectMethod = (nextMethodFilter: WarehouseMethodFilter) => {
    const nextSectionId = validSectionId(selectedSection, nextMethodFilter);
    setMethodFilter(nextMethodFilter);
    setSelectedSection(nextSectionId);
    pushWarehouseState({ methodFilter: nextMethodFilter, sectionId: nextSectionId });
  };

  const selectSection = (sectionId: WarehouseSectionId) => {
    setSelectedSection(sectionId);
    pushWarehouseState({ sectionId });
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    replaceWarehouseState({ search: value });
  };

  const markReady = async (row: WarehouseRow) => {
    if (busyRef.current.has(row.id)) return;
    try {
      busyRef.current.add(row.id);
      setBusyId(row.id);
      setError(null);
      setNotice(null);
      const res = await fetch(`/api/fulfillments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status: "ready" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to mark fulfillment Ready.");
      if (String(payload.data?.status ?? "").toUpperCase() !== "READY") {
        throw new Error("Ready update did not return a READY fulfillment.");
      }
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: payload.data.status,
              }
            : item,
        ),
      );
      await loadQueue();
      setNotice(`${row.salesOrderNumber} marked Ready.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark fulfillment Ready.");
    } finally {
      busyRef.current.delete(row.id);
      setBusyId(null);
    }
  };

  const renderPrimaryAction = (row: WarehouseRow) => {
    const action = getWarehousePrimaryAction({
      id: row.id,
      type: row.type,
      status: row.status,
    });
    if (action.kind === "markReady") {
      return (
        <button
          type="button"
          data-testid={`warehouse-primary-action-${row.id}`}
          onClick={() => markReady(row)}
          disabled={busyId === row.id}
          aria-busy={busyId === row.id}
          className="ios-primary-btn inline-flex min-h-11 items-center justify-center px-3 text-xs disabled:opacity-60"
        >
          {busyId === row.id ? "Marking Ready..." : action.label}
        </button>
      );
    }
    return (
      <Link
        data-testid={`warehouse-primary-action-${row.id}`}
        href={action.href}
        className="ios-primary-btn inline-flex min-h-11 items-center justify-center px-3 text-xs"
      >
        {action.label}
      </Link>
    );
  };

  return (
    <section className="space-y-6" data-testid="warehouse-operations-workspace">
      <header className="glass-card p-5 sm:p-6">
        <div className="glass-card-content flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-400">Warehouse</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Operations Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Pickup and Delivery worklists for orders that need an explicit Ready check before
              customer handoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/fulfillment/outbound" className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-sm">
              Fulfillment Queue
            </Link>
          </div>
        </div>
      </header>

      <section className="linear-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-300">Workflow</p>
            <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="Warehouse workflow">
              {WAREHOUSE_METHOD_FILTERS.map((method) => {
                const active = methodFilter === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="tab"
                    data-testid={`warehouse-method-tab-${method.id}`}
                    aria-selected={active}
                    aria-controls="warehouse-section-panel"
                    onClick={() => selectMethod(method.id)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                      active
                        ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                        : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {method.id === "delivery" ? <Truck className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                    {method.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Warehouse snapshot counts">
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300">
              Pickup Needs Ready <span className="text-white" data-testid="warehouse-summary-pickup-needs-ready">{methodSnapshot.pickupNeedsReady}</span>
            </span>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300">
              Pickup Ready <span className="text-white" data-testid="warehouse-summary-pickup-ready">{methodSnapshot.pickupReady}</span>
            </span>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300">
              Delivery Needs Ready <span className="text-white" data-testid="warehouse-summary-delivery-needs-ready">{methodSnapshot.deliveryNeedsReady}</span>
            </span>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300">
              Delivery Ready <span className="text-white" data-testid="warehouse-summary-delivery-ready">{methodSnapshot.deliveryReady}</span>
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3" role="tablist" aria-label={`${methodFilter} sections`}>
        {sectionOptions.map((section) => {
          const active = selectedSection === section.id;
          const count = sectionCounts[section.id];
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              data-testid={`warehouse-section-tab-${section.id}`}
              aria-selected={active}
              aria-controls="warehouse-section-panel"
              aria-label={`${sectionLabel(section.id, methodFilter)}, ${count} tasks`}
              onClick={() => selectSection(section.id)}
              className={`glass-card min-h-[104px] p-4 text-left transition ${
                active ? "border-cyan-300/40 bg-cyan-500/10" : ""
              }`}
            >
              <span className="glass-card-content flex h-full flex-col justify-between gap-3">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{sectionLabel(section.id, methodFilter)}</span>
                  {section.id === "inDelivery" ? (
                    <Truck className="h-4 w-4 text-slate-300" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-slate-300" />
                  )}
                </span>
                <span className="flex items-end justify-between gap-3">
                  <span className="text-3xl font-semibold text-white">{count}</span>
                  <span className="text-right text-xs text-slate-400">{section.description}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="linear-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-300">
            Search orders, customers, SKU, product
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder="SO number, customer, SKU, product"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
              />
            </span>
          </label>
          <label className="text-sm font-medium text-slate-300">
            Special Order
            <select
              value={specialFilter}
              onChange={(event) => setSpecialFilter(event.target.value as SpecialFilter)}
              className="ios-input mt-2 min-w-[170px] text-sm"
              aria-label="Special Order filter"
            >
              <option value="ALL">All</option>
              <option value="SPECIAL">Special only</option>
            </select>
          </label>
        </div>
      </section>

      {notice ? (
        <div
          data-testid="warehouse-action-status"
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          data-testid="warehouse-error"
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <section className="glass-card overflow-hidden p-0" id="warehouse-section-panel">
        <div className="glass-card-content">
          <div className="flex flex-col gap-1 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">
                {sectionLabel(selectedDefinition.id, methodFilter)}
              </h2>
              <p className="text-sm text-slate-400" data-testid="warehouse-visible-count">
                {visibleRows.length} visible
              </p>
            </div>
            <p className="text-sm text-slate-400">{selectedDefinition.description}</p>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                  <TableHead className="min-w-[120px] text-slate-400">Scheduled</TableHead>
                  <TableHead className="min-w-[120px] text-slate-400">Order</TableHead>
                  <TableHead className="min-w-[180px] text-slate-400">Customer</TableHead>
                  <TableHead className="min-w-[120px] text-slate-400">Type</TableHead>
                  <TableHead className="min-w-[220px] text-slate-400">Items</TableHead>
                  <TableHead className="min-w-[180px] text-slate-400">Progress</TableHead>
                  <TableHead className="min-w-[140px] text-slate-400">Status</TableHead>
                  <TableHead className="min-w-[220px] text-right text-slate-400">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={8} className="py-10 text-center text-slate-400">
                      Loading Warehouse queue...
                    </TableCell>
                  </TableRow>
                ) : visibleRows.length === 0 ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={8} className="py-10 text-center text-slate-400">
                      {searchableRows.length === 0
                        ? "No Warehouse tasks match the current search or filters."
                        : `No ${sectionLabel(selectedDefinition.id, methodFilter).toLowerCase()} tasks.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
                    <TableRow key={row.id} className="border-white/10 text-slate-300 hover:bg-white/[0.04]">
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium text-white">{formatDate(row.scheduledAt)}</div>
                          <div className="text-xs text-slate-400">{row.timeWindow || "No time window"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/orders/${row.salesOrderId}`} className="font-semibold text-white underline-offset-4 hover:underline">
                          {row.salesOrderNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate font-medium text-white">{row.customerName || "Customer missing"}</div>
                        <div className="truncate text-xs text-slate-400">{row.type === "DELIVERY" ? row.address || "-" : "Counter pickup"}</div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-semibold text-white">
                          {row.type === "DELIVERY" ? "Delivery" : "Pickup"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="truncate font-medium text-white">{itemPreview(row)}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <SpecialOrderNotice row={row} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <div className="text-slate-300">
                            Ordered <span className="font-semibold text-white">{formatQty(row.orderedQty)}</span> /
                            Fulfilled <span className="font-semibold text-white">{formatQty(row.fulfilledQty)}</span>
                          </div>
                          <div className="text-slate-400">
                            Remaining <span className="font-semibold text-white">{formatQty(row.remainingQty)}</span> -{" "}
                            {row.itemsCompleted}/{row.itemCount} lines complete
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                          {formatWarehouseStatus(row.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          {renderPrimaryAction(row)}
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs">
                            Fulfillment
                          </Link>
                          <a
                            data-testid={`warehouse-preparation-list-${row.id}`}
                            href={`/api/fulfillments/${row.id}/pdf?type=pick`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs"
                          >
                            Preparation List
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 p-3 lg:hidden">
            {loading ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-slate-400">
                Loading Warehouse queue...
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-slate-400">
                {searchableRows.length === 0
                  ? "No Warehouse tasks match the current search or filters."
                  : `No ${sectionLabel(selectedDefinition.id, methodFilter).toLowerCase()} tasks.`}
              </div>
            ) : (
              visibleRows.map((row) => (
                <article key={row.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/orders/${row.salesOrderId}`} className="font-semibold text-white underline-offset-4 hover:underline">
                        {row.salesOrderNumber}
                      </Link>
                      <p className="mt-1 truncate text-sm text-slate-300">{row.customerName || "Customer missing"}</p>
                    </div>
                    <span className="shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-semibold text-white">
                      {row.type === "DELIVERY" ? "Delivery" : "Pickup"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-300">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Scheduled</span>
                      <span className="text-right text-white">{formatDate(row.scheduledAt)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Status</span>
                      <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                        {formatWarehouseStatus(row.status)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-400">Items</span>
                      <p className="mt-1 truncate font-medium text-white">{itemPreview(row)}</p>
                    </div>
                    <SpecialOrderNotice row={row} />
                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
                      <div>
                        <p className="text-xs text-slate-400">Ordered</p>
                        <p className="mt-1 font-semibold text-white">{formatQty(row.orderedQty)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Fulfilled</p>
                        <p className="mt-1 font-semibold text-white">{formatQty(row.fulfilledQty)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Remaining</p>
                        <p className="mt-1 font-semibold text-white">{formatQty(row.remainingQty)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {renderPrimaryAction(row)}
                    <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs">
                      Fulfillment
                    </Link>
                    <a
                      data-testid={`warehouse-preparation-list-${row.id}`}
                      href={`/api/fulfillments/${row.id}/pdf?type=pick`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs"
                    >
                      Preparation List
                    </a>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
