"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, PackageCheck, Search, Truck } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  WAREHOUSE_METHOD_FILTERS,
  WAREHOUSE_STAGE_DEFINITIONS,
  countWarehouseMethodSnapshot,
  countWarehouseStages,
  formatWarehouseStatus,
  getWarehousePrimaryAction,
  isRowInWarehouseStage,
  rowMatchesWarehouseMethod,
  type WarehouseFulfillmentType,
  type WarehouseMethodFilter,
  type WarehouseStageId,
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

const stageIcons: Record<WarehouseStageId, ComponentType<{ className?: string }>> = {
  toPick: ClipboardList,
  picking: PackageCheck,
  ready: PackageCheck,
};

const stageIds = WAREHOUSE_STAGE_DEFINITIONS.map((stage) => stage.id);
const methodIds = WAREHOUSE_METHOD_FILTERS.map((method) => method.id);

function validStageId(value: string | null): WarehouseStageId {
  return stageIds.includes(value as WarehouseStageId) ? (value as WarehouseStageId) : "toPick";
}

function validMethodFilter(value: string | null): WarehouseMethodFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  return methodIds.includes(normalized as WarehouseMethodFilter) ? (normalized as WarehouseMethodFilter) : "all";
}

function warehousePath(args: { stageId: WarehouseStageId; methodFilter: WarehouseMethodFilter; search: string }) {
  const params = new URLSearchParams();
  params.set("stage", args.stageId);
  params.set("method", args.methodFilter);
  const search = args.search.trim();
  if (search) params.set("search", search);
  return `/warehouse?${params.toString()}`;
}

function parseWarehouseParams(searchParams: URLSearchParams) {
  let stageId = validStageId(searchParams.get("stage"));
  let methodFilter = validMethodFilter(searchParams.get("method"));
  const legacyQueue = searchParams.get("queue");
  if (legacyQueue) {
    if (legacyQueue === "pickup") {
      stageId = "ready";
      methodFilter = "pickup";
    } else if (legacyQueue === "delivery") {
      stageId = "ready";
      methodFilter = "delivery";
    } else {
      stageId = validStageId(legacyQueue);
      methodFilter = "all";
    }
  }
  return {
    stageId,
    methodFilter,
    search: searchParams.get("search") ?? "",
  };
}

function statusBadgeClass(status: string) {
  const key = normalizeWarehouseStatus(status);
  if (key === "OUT_FOR_DELIVERY" || key === "OUT" || key === "IN_PROGRESS") {
    return "border-sky-400/20 bg-sky-500/15 text-sky-200";
  }
  if (key === "READY") return "border-cyan-400/20 bg-cyan-500/15 text-cyan-200";
  if (key === "PACKING") return "border-violet-400/20 bg-violet-500/15 text-violet-200";
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

function QueuePrimaryAction({ row, stageId }: { row: WarehouseRow; stageId: WarehouseStageId }) {
  const action = getWarehousePrimaryAction({
    id: row.id,
    type: row.type,
    status: row.status,
    stageId,
  });
  return (
    <Link
      data-testid={`warehouse-primary-action-${row.id}`}
      href={action.href}
      className="ios-primary-btn inline-flex min-h-11 items-center justify-center px-3 text-xs"
    >
      {action.label}
    </Link>
  );
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
  const [selectedStage, setSelectedStage] = useState<WarehouseStageId>("toPick");
  const [methodFilter, setMethodFilter] = useState<WarehouseMethodFilter>("all");
  const [search, setSearch] = useState("");
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applyUrlState = () => {
      const next = parseWarehouseParams(new URLSearchParams(window.location.search));
      setSelectedStage(next.stageId);
      setMethodFilter(next.methodFilter);
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
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/fulfillments/outbound", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load Warehouse queue.");
        if (!cancelled) setRows((payload.data ?? []) as WarehouseRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Warehouse queue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const searchableRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (specialFilter === "SPECIAL" && !row.hasSpecialOrder) return false;
      if (query && !queueText(row).includes(query)) return false;
      return true;
    });
  }, [rows, search, specialFilter]);

  const stageCounts = useMemo(() => countWarehouseStages(searchableRows), [searchableRows]);
  const methodSnapshot = useMemo(() => countWarehouseMethodSnapshot(searchableRows), [searchableRows]);
  const selectedStageRows = useMemo(
    () => searchableRows.filter((row) => isRowInWarehouseStage(row, selectedStage)),
    [searchableRows, selectedStage],
  );
  const visibleRows = useMemo(
    () => selectedStageRows.filter((row) => rowMatchesWarehouseMethod(row, methodFilter)),
    [selectedStageRows, methodFilter],
  );
  const selectedDefinition = WAREHOUSE_STAGE_DEFINITIONS.find((stage) => stage.id === selectedStage)!;
  const selectedMethodDefinition = WAREHOUSE_METHOD_FILTERS.find((method) => method.id === methodFilter)!;

  const pushWarehouseState = (next: {
    stageId?: WarehouseStageId;
    methodFilter?: WarehouseMethodFilter;
    search?: string;
  }) => {
    const stageId = next.stageId ?? selectedStage;
    const nextMethodFilter = next.methodFilter ?? methodFilter;
    const nextSearch = next.search ?? search;
    window.history.pushState(null, "", warehousePath({ stageId, methodFilter: nextMethodFilter, search: nextSearch }));
  };

  const replaceWarehouseState = (next: {
    stageId?: WarehouseStageId;
    methodFilter?: WarehouseMethodFilter;
    search?: string;
  }) => {
    const stageId = next.stageId ?? selectedStage;
    const nextMethodFilter = next.methodFilter ?? methodFilter;
    const nextSearch = next.search ?? search;
    window.history.replaceState(null, "", warehousePath({ stageId, methodFilter: nextMethodFilter, search: nextSearch }));
  };

  const selectStage = (stageId: WarehouseStageId) => {
    setSelectedStage(stageId);
    pushWarehouseState({ stageId });
  };

  const selectMethod = (nextMethodFilter: WarehouseMethodFilter) => {
    setMethodFilter(nextMethodFilter);
    pushWarehouseState({ methodFilter: nextMethodFilter });
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    replaceWarehouseState({ search: value });
  };

  return (
    <section className="space-y-6" data-testid="warehouse-operations-workspace">
      <header className="glass-card p-5 sm:p-6">
        <div className="glass-card-content flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-400">Warehouse</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Operations Workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Three exclusive work stages for active fulfillment. Use Pickup or Delivery as a
              method filter, then open the existing picking, packing, delivery, order, or
              fulfillment workflow when action is needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/warehouse/picking" className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-sm">
              Picking
            </Link>
            <Link href="/warehouse/packing" className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-sm">
              Packing
            </Link>
            <Link href="/fulfillment/outbound" className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-sm">
              Legacy Queue
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3" role="tablist" aria-label="Warehouse work stages">
        {WAREHOUSE_STAGE_DEFINITIONS.map((stage) => {
          const Icon = stageIcons[stage.id];
          const active = selectedStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              data-testid={`warehouse-stage-tab-${stage.id}`}
              aria-selected={active}
              aria-controls="warehouse-stage-panel"
              aria-label={`${stage.label} stage, ${stageCounts[stage.id]} tasks`}
              onClick={() => selectStage(stage.id)}
              className={`glass-card min-h-[104px] p-4 text-left transition ${
                active ? "border-cyan-300/40 bg-cyan-500/10" : ""
              }`}
            >
              <span className="glass-card-content flex h-full flex-col justify-between gap-3">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{stage.label}</span>
                  <Icon className="h-4 w-4 text-slate-300" />
                </span>
                <span className="flex items-end justify-between gap-3">
                  <span className="text-3xl font-semibold text-white">{stageCounts[stage.id]}</span>
                  <span className="text-right text-xs text-slate-400">{stage.description}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="linear-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-300">Fulfillment method</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Fulfillment method filter">
              {WAREHOUSE_METHOD_FILTERS.map((method) => {
                const active = methodFilter === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    data-testid={`warehouse-method-filter-${method.id}`}
                    aria-pressed={active}
                    onClick={() => selectMethod(method.id)}
                    className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${
                      active
                        ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                        : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {method.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 max-w-xl text-xs text-slate-500">
              Stage counts are exclusive and ignore the method filter. Method filters only narrow
              the selected stage.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Method snapshot counts">
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300">
              <PackageCheck className="h-4 w-4 text-slate-400" />
              Pickup Ready <span className="text-white" data-testid="warehouse-method-summary-pickup-ready">{methodSnapshot.pickupReady}</span>
            </span>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300">
              <Truck className="h-4 w-4 text-slate-400" />
              Delivery Active <span className="text-white" data-testid="warehouse-method-summary-delivery-active">{methodSnapshot.deliveryActive}</span>
            </span>
          </div>
        </div>
      </section>

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

      {error ? (
        <div
          data-testid="warehouse-error"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      ) : null}

      <section className="glass-card overflow-hidden p-0" id="warehouse-stage-panel">
        <div className="glass-card-content">
          <div className="flex flex-col gap-1 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">
                {selectedDefinition.label} - {selectedMethodDefinition.label}
              </h2>
              <p className="text-sm text-slate-400" data-testid="warehouse-visible-count">
                {visibleRows.length} visible
              </p>
            </div>
            <p className="text-sm text-slate-400">
              {selectedDefinition.description} {selectedMethodDefinition.description}
            </p>
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
                  <TableHead className="min-w-[190px] text-right text-slate-400">Action</TableHead>
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
                        : `No ${selectedMethodDefinition.label.toLowerCase()} tasks in ${selectedDefinition.label}.`}
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
                            Remaining <span className="font-semibold text-white">{formatQty(row.remainingQty)}</span> ·{" "}
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
                          <QueuePrimaryAction row={row} stageId={selectedStage} />
                          <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs">
                            Fulfillment
                          </Link>
                          <a
                            href={`/api/fulfillments/${row.id}/pdf?type=pick`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs"
                          >
                            Pick List
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
                  : `No ${selectedMethodDefinition.label.toLowerCase()} tasks in ${selectedDefinition.label}.`}
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
                    <QueuePrimaryAction row={row} stageId={selectedStage} />
                    <Link href={`/fulfillment/${row.id}`} className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs">
                      Fulfillment
                    </Link>
                    <a
                      href={`/api/fulfillments/${row.id}/pdf?type=pick`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ios-secondary-btn inline-flex min-h-11 items-center px-3 text-xs"
                    >
                      Pick List
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
