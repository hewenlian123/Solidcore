"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/components/layout/role-provider";
import { getSalesOrderStatusBadge, getSalesOrderStatusLabel } from "@/lib/sales-order-ui";
import { PDFPreviewModal } from "@/components/pdf/PDFPreviewModal";
import { buildProductDisplayName } from "@/lib/product-display-format";
import { formatLineItemTitle } from "@/lib/display";
import { getEffectiveSpecs, getInternalSpecLine } from "@/lib/specs/glass";
import { formatFlooringSubtitle } from "@/lib/specs/effective";
import { formatBoxesSqftSummary, formatSellingUnitLabel, resolveSellingUnit } from "@/lib/selling-unit";

// ---------------------------------------------------------------------------
// Module-level caches for reference data that rarely changes during a session.
// This prevents duplicate fetches from React StrictMode double-invoke and from
// multiple useEffect calls that all request the same static data.
// ---------------------------------------------------------------------------
type _SalesProduct = {
  id: string; productId: string; name: string; title: string | null; sku: string;
  generatedDescription?: string | null; variantDescription?: string | null; defaultDescription?: string | null;
  brand: string | null; collection: string | null; onHandStock?: string; availableStock: string;
  price: string; unit?: string | null; sellingUnit?: "BOX" | "PIECE" | "SQFT";
  category?: string | null; flooringBoxCoverageSqft?: number | null;
};
type _SupplierOption = { id: string; name: string; contactName: string; phone: string };
type _SalesCustomerOption = { id: string; name: string; phone: string | null; email: string | null; address: string | null; taxExempt: boolean; taxRate: number | null };
type _SalespersonOption = { id: string; name: string };

const _soDetailCache: {
  products: _SalesProduct[] | null;
  productsP: Promise<_SalesProduct[]> | null;
  suppliers: _SupplierOption[] | null;
  suppliersP: Promise<_SupplierOption[]> | null;
  salespeople: _SalespersonOption[] | null;
  salespeopleP: Promise<_SalespersonOption[]> | null;
  customers: _SalesCustomerOption[] | null;
  customersP: Promise<_SalesCustomerOption[]> | null;
} = {
  products: null, productsP: null,
  suppliers: null, suppliersP: null,
  salespeople: null, salespeopleP: null,
  customers: null, customersP: null,
};

function _fetchRefData<T>(
  key: "products" | "suppliers" | "salespeople" | "customers",
  url: string,
  role: string,
): Promise<T[]> {
  const promiseKey = `${key}P` as keyof typeof _soDetailCache;
  if (_soDetailCache[key]) return Promise.resolve(_soDetailCache[key] as T[]);
  if (_soDetailCache[promiseKey]) return _soDetailCache[promiseKey] as Promise<T[]>;

  const p: Promise<T[]> = fetch(url, { cache: "no-store", headers: { "x-user-role": role } })
    .then((res) => res.json())
    .then((payload) => {
      const data = (payload?.data ?? []) as T[];
      _soDetailCache[key] = data as never;
      return data;
    })
    .catch(() => [] as T[])
    .finally(() => { (_soDetailCache as Record<string, unknown>)[promiseKey] = null; });

  (_soDetailCache as Record<string, unknown>)[promiseKey] = p;
  return p;
}

type SalesOrderDetail = {
  id: string;
  orderNumber: string;
  docType: "QUOTE" | "SALES_ORDER";
  projectName: string | null;
  status: string;
  specialOrder: boolean;
  supplierId: string | null;
  etaDate: string | null;
  specialOrderStatus: string | null;
  supplierNotes: string | null;
  depositRequired: string;
  subtotal: string;
  discount: string;
  taxRate: string | null;
  tax: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  salespersonName: string | null;
  fulfillmentMethod: "PICKUP" | "DELIVERY";
  deliveryName: string | null;
  deliveryPhone: string | null;
  deliveryAddress1: string | null;
  deliveryAddress2: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryZip: string | null;
  deliveryNotes: string | null;
  pickupNotes: string | null;
  requestedDeliveryAt: string | null;
  notes: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    taxExempt: boolean;
    taxRate: number | null;
  };
  supplier: { id: string; name: string; contactName: string; phone: string } | null;
  items: Array<{
    id: string;
    productId: string | null;
    variantId: string | null;
    productSku: string | null;
    productTitle: string | null;
    description?: string | null;
    lineDescription: string;
    quantity: string;
    unitPrice: string;
    lineDiscount: string;
    lineTotal: string;
    fulfillQty: string;
    product?:
      | {
          name: string | null;
          unit?: string | null;
          frameMaterialDefault?: string | null;
          slidingConfigDefault?: string | null;
          glassTypeDefault?: string | null;
          glassCoatingDefault?: string | null;
          glassThicknessMmDefault?: number | null;
          glassFinishDefault?: string | null;
          screenDefault?: string | null;
          openingTypeDefault?: string | null;
          flooringMaterial?: string | null;
          flooringWearLayer?: string | null;
          flooringThicknessMm?: number | null;
          flooringPlankLengthIn?: number | null;
          flooringPlankWidthIn?: number | null;
          flooringCoreThicknessMm?: number | null;
          flooringInstallation?: string | null;
          flooringUnderlayment?: string | null;
          flooringUnderlaymentType?: string | null;
          flooringUnderlaymentMm?: number | null;
          flooringBoxCoverageSqft?: number | null;
        }
      | null;
    variant?:
      | {
          sku?: string | null;
          displayName?: string | null;
          width?: number | null;
          height?: number | null;
          color?: string | null;
          glassTypeOverride?: string | null;
          slidingConfigOverride?: string | null;
          glassCoatingOverride?: string | null;
          glassThicknessMmOverride?: number | null;
          glassFinishOverride?: string | null;
          screenOverride?: string | null;
          openingTypeOverride?: string | null;
        }
      | null;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    status: "POSTED" | "VOIDED";
    referenceNumber: string | null;
    receivedAt: string;
    notes: string | null;
  }>;
  fulfillments: Array<{
    id: string;
    type: "PICKUP" | "DELIVERY";
    scheduledDate: string;
    status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    address: string | null;
    notes: string | null;
  }>;
  outboundQueue: {
    id: string;
    status: string;
    scheduledDate: string;
  } | null;
};

type FulfillmentDetailPreview = {
  id: string;
  type: "PICKUP" | "DELIVERY";
  status: string;
  scheduledAt: string | null;
  scheduledDate: string | null;
  timeWindow: string | null;
  driverName: string | null;
  pickupContact: string | null;
  items: Array<{
    orderedQty: string;
    fulfilledQty: string;
  }>;
};

type SalesProduct = {
  id: string;
  productId: string;
  name: string;
  title: string | null;
  sku: string;
  generatedDescription?: string | null;
  variantDescription?: string | null;
  defaultDescription?: string | null;
  brand: string | null;
  collection: string | null;
  onHandStock?: string;
  availableStock: string;
  price: string;
  unit?: string | null;
  sellingUnit?: "BOX" | "PIECE" | "SQFT";
  category?: string | null;
  flooringBoxCoverageSqft?: number | null;
};

type SupplierOption = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
};

type SalesCustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxExempt: boolean;
  taxRate: number | null;
};

type SalespersonOption = {
  id: string;
  name: string;
};

type SalesOrderTicket = {
  id: string;
  salesOrderId: string;
  fulfillmentId: string | null;
  ticketType: "PICK" | "DELIVERY" | "RETURN";
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
};

type ItemRowDraft = {
  quantity: string;
  unitPrice: string;
  lineDiscount: string;
  lineTax: string;
  lineDescription: string;
  fulfillQty: string;
};

function paymentStatusFromTotals(paidAmount: number, balanceDue: number) {
  if (balanceDue <= 0) return "Paid";
  if (paidAmount > 0) return "Partial";
  return "Unpaid";
}

function roundTo2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseSpecPairs(description: string | null | undefined) {
  const lines = String(description ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return null;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((row): row is { label: string; value: string } => Boolean(row));
}

function pickSpecValue(
  pairs: Array<{ label: string; value: string }>,
  aliases: string[],
) {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  const row = pairs.find((pair) =>
    normalizedAliases.includes(pair.label.toLowerCase()),
  );
  return row?.value ?? "";
}

function cleanSpecSizePart(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/['"″”“]/g, "")
    .replace(/\s+/g, "");
}

function compactSizeText(pairs: Array<{ label: string; value: string }>) {
  const width = pickSpecValue(pairs, ["width", "w"]);
  const height = pickSpecValue(pairs, ["height", "h"]);
  if (width && height) {
    const w = cleanSpecSizePart(width);
    const h = cleanSpecSizePart(height);
    if (w && h) return `${w}"x${h}"`;
  }
  const size = pickSpecValue(pairs, ["size", "dimension", "dimensions"]);
  if (!size) return "";
  const compact = size.replace(/\s+/g, "");
  const parts = compact.split(/x|×/i);
  if (parts.length >= 2) {
    const w = cleanSpecSizePart(parts[0]);
    const h = cleanSpecSizePart(parts[1]);
    if (w && h) return `${w}"x${h}"`;
  }
  return "";
}

function compactPrimaryName(baseName: string | null | undefined, specText: string | null | undefined) {
  const name = String(baseName ?? "").trim() || "-";
  const pairs = parseSpecPairs(specText);
  const size = compactSizeText(pairs);
  const color = pickSpecValue(pairs, ["color", "colour", "finish", "finish/color"]);
  if (size && color) return `${name}-${size}(${color})`;
  if (size) return `${name}-${size}`;
  if (color) return `${name} (${color})`;
  return name;
}

function compactSecondarySpecs(specText: string | null | undefined) {
  const pairs = parseSpecPairs(specText);
  const glass = pickSpecValue(pairs, ["glass"]);
  const frame = pickSpecValue(pairs, ["material", "frame", "frame material"]);
  const type = pickSpecValue(pairs, ["type", "variant type", "style"]);
  return [glass, frame, type].filter((value) => Boolean(value)).join(" · ");
}

function getWindowSpecs(specText: string | null | undefined) {
  const pairs = parseSpecPairs(specText);
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const excludedSummaryKeys = new Set(
    [
      "material",
      "frame",
      "framematerial",
      "glass",
      "glasstype",
      "glazing",
      "screen",
      "screentype",
      "slidingconfiguration",
      "slidingdirection",
      "sliding",
      "slidedirection",
      "openingdirection",
      "handing",
      "hand",
    ].map(normalize),
  );

  const pickByAliases = (aliases: readonly string[]) => {
    const normalizedAliases = aliases.map(normalize);
    return (
      pairs.find((pair) => normalizedAliases.includes(normalize(pair.label))) ?? null
    );
  };

  const preferredSpecs = [
    { label: "Opening Type", aliases: ["opening type", "type", "swing", "window type"] },
    { label: "Rating", aliases: ["rating", "fire rating"] },
    { label: "Finish", aliases: ["finish", "finish/color", "finish color"] },
    { label: "Notes", aliases: ["notes", "note"] },
  ] as const;

  const usedKeys = new Set<string>();
  const rows: Array<{ label: string; value: string }> = [];

  for (const spec of preferredSpecs) {
    const matched = pickByAliases(spec.aliases);
    if (!matched) continue;
    const normalizedKey = normalize(matched.label);
    if (excludedSummaryKeys.has(normalizedKey) || usedKeys.has(normalizedKey)) continue;
    const value = String(matched.value ?? "").trim();
    if (!value) continue;
    rows.push({ label: spec.label, value });
    usedKeys.add(normalizedKey);
  }

  for (const pair of pairs) {
    const normalizedKey = normalize(pair.label);
    const value = String(pair.value ?? "").trim();
    if (!value) continue;
    if (excludedSummaryKeys.has(normalizedKey)) continue;
    if (usedKeys.has(normalizedKey)) continue;
    rows.push({ label: pair.label, value });
    usedKeys.add(normalizedKey);
  }

  return rows;
}

function getProductDetailPreview(specText: string | null | undefined) {
  const pairs = parseSpecPairs(specText);
  const width = pickSpecValue(pairs, ["width", "w"]);
  const height = pickSpecValue(pairs, ["height", "h"]);
  const color = pickSpecValue(pairs, ["color", "colour", "finish", "finish/color"]);
  const glass = pickSpecValue(pairs, ["glass", "glass type", "glazing"]);
  const screen = pickSpecValue(pairs, ["screen", "screen type"]);
  const sliding = pickSpecValue(pairs, ["slide direction", "sliding way", "handing", "hand"]);

  const size =
    width && height
      ? `${cleanSpecSizePart(width)}"x${cleanSpecSizePart(height)}"`
      : pickSpecValue(pairs, ["size", "dimension", "dimensions"]);

  return [
    { label: "Size", value: size },
    { label: "Color", value: color },
    { label: "Glass", value: glass },
    { label: "Screen", value: screen },
    { label: "Sliding", value: sliding },
  ].filter((row) => Boolean(String(row.value ?? "").trim()));
}

function toItemRowDraft(item: SalesOrderDetail["items"][number], existing?: ItemRowDraft | null): ItemRowDraft {
  return {
    quantity: existing?.quantity ?? String(item.quantity ?? ""),
    unitPrice: existing?.unitPrice ?? String(item.unitPrice ?? ""),
    lineDiscount: existing?.lineDiscount ?? String(item.lineDiscount ?? ""),
    lineTax: existing?.lineTax ?? "",
    lineDescription: existing?.lineDescription ?? String(item.lineDescription ?? ""),
    fulfillQty: existing?.fulfillQty ?? String(item.fulfillQty ?? ""),
  };
}

function formatFlooringMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function getFlooringShipmentPlan(quantityBoxes: number, sqftPerBox: number) {
  if (!Number.isFinite(quantityBoxes)) return null;
  if (!Number.isFinite(sqftPerBox) || sqftPerBox <= 0) return null;
  const requiredBoxes = Math.max(0, quantityBoxes);
  const coversSqft = requiredBoxes * sqftPerBox;
  const summary = formatBoxesSqftSummary(requiredBoxes, sqftPerBox);
  return {
    requiredBoxes,
    coversSqft,
    label: summary ?? `${formatFlooringMetric(requiredBoxes)} boxes`,
  };
}

function formatUnitLabel(unit: string | null | undefined) {
  const normalized = String(unit ?? "").trim().toUpperCase();
  if (!normalized) return "-";
  if (normalized === "BOX") return "boxes";
  if (normalized === "SQFT" || normalized === "SQM") return "sqft";
  if (normalized === "PIECE") return "qty";
  return normalized.toLowerCase();
}

function getReservedFlooringBoxesFromItems(items: SalesOrderDetail["items"]) {
  return items.reduce((sum, item) => {
    const plan = getFlooringShipmentPlan(
      Number(item.quantity ?? 0),
      Number(item.product?.flooringBoxCoverageSqft ?? 0),
    );
    return sum + Number(plan?.requiredBoxes ?? 0);
  }, 0);
}

export default function SalesOrderDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<SalesOrderDetail | null>(null);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [customers, setCustomers] = useState<SalesCustomerOption[]>([]);
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);
  const [tickets, setTickets] = useState<SalesOrderTicket[]>([]);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<"PAYMENTS" | "FULFILLMENT" | "TICKETS" | "ACTIVITY">("PAYMENTS");
  const [expandedSpecsByItem, setExpandedSpecsByItem] = useState<Record<string, boolean>>({});
  const [ticketStatusFilter, setTicketStatusFilter] = useState<
    "ALL" | "open" | "in_progress" | "done" | "voided"
  >("ALL");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editSnapshot, setEditSnapshot] = useState<SalesOrderDetail | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [openFulfillment, setOpenFulfillment] = useState(false);
  const [openStartFulfillmentDialog, setOpenStartFulfillmentDialog] = useState(false);
  const [startingFulfillmentType, setStartingFulfillmentType] = useState<"DELIVERY" | "PICKUP" | null>(null);
  const [creatingReturn, setCreatingReturn] = useState(false);
  const [hasRelatedReturns, setHasRelatedReturns] = useState(false);
  const [openTicket, setOpenTicket] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; src: string } | null>(null);
  const [activeFulfillmentDetail, setActiveFulfillmentDetail] = useState<FulfillmentDetailPreview | null>(null);
  const quickAddSearchRef = useRef<HTMLInputElement | null>(null);
  // Tracks the last "id:role" combination we loaded data for, preventing duplicate
  // fetches when role initializes from its default and then updates to the real value.
  const loadedForRef = useRef("");
  const [paymentQuickHint, setPaymentQuickHint] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "CASH",
    referenceNumber: "",
    receivedAt: "",
    notes: "",
  });
  const [fulfillmentForm, setFulfillmentForm] = useState({
    type: "DELIVERY",
    scheduledDate: "",
    address: "",
    notes: "",
    autoCreateTicket: true,
  });
  const [ticketForm, setTicketForm] = useState({
    ticketType: "PICK",
    status: "open",
    fulfillmentId: "",
    scheduledAt: "",
    notes: "",
  });
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [quickAddQuery, setQuickAddQuery] = useState("");
  const [quickAddQty, setQuickAddQty] = useState("1");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddActiveIndex, setQuickAddActiveIndex] = useState(0);
  const [activeDrawerItemId, setActiveDrawerItemId] = useState<string | null>(null);
  const [savingDrawerItem, setSavingDrawerItem] = useState(false);
  const [drawerInitialDraft, setDrawerInitialDraft] = useState<ItemRowDraft | null>(null);
  const [openDetailsDrawer, setOpenDetailsDrawer] = useState(false);
  const [rowDraftsByItemId, setRowDraftsByItemId] = useState<Record<string, ItemRowDraft>>({});

  const loadCustomers = async (q = "") => {
    // When query is empty, serve from cache (already loaded during initial load())
    if (!q.trim()) {
      if (_soDetailCache.customers) {
        setCustomers(_soDetailCache.customers as SalesCustomerOption[]);
        return;
      }
    }
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const query = params.toString();
    const res = await fetch(query ? `/api/sales-orders/customers?${query}` : "/api/sales-orders/customers", {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch customers");
    // Only update cache for unfiltered results
    if (!q.trim()) _soDetailCache.customers = payload.data ?? [];
    setCustomers(payload.data ?? []);
  };

  const load = async () => {
    try {
      // Fetch order-specific data fresh every time (these change); use cache for static reference data
      const [detailRes, ticketRes, invoiceRes, returnRes, products, suppliers, customers, salespeople] =
        await Promise.all([
          fetch(`/api/sales-orders/${id}`, { cache: "no-store", headers: { "x-user-role": role } }),
          fetch(`/api/sales-orders/${id}/tickets`, { cache: "no-store", headers: { "x-user-role": role } }),
          fetch(`/api/invoices?salesOrderId=${id}`, { cache: "no-store", headers: { "x-user-role": role } }),
          fetch(`/api/after-sales/returns?salesOrderId=${id}`, { cache: "no-store", headers: { "x-user-role": role } }),
          // Static reference data — served from module-level cache after first fetch
          _fetchRefData<SalesProduct>("products", "/api/sales-orders/products", role),
          _fetchRefData<SupplierOption>("suppliers", "/api/suppliers", role),
          _fetchRefData<SalesCustomerOption>("customers", "/api/sales-orders/customers", role),
          _fetchRefData<SalespersonOption>("salespeople", "/api/sales-orders/salespeople", role),
        ]);

      const detailPayload = await detailRes.json();
      const ticketPayload = await ticketRes.json();
      const invoicePayload = await invoiceRes.json();
      const returnPayload = await returnRes.json();

      if (!detailRes.ok) throw new Error(detailPayload.error ?? "Failed to fetch order");
      if (!ticketRes.ok) throw new Error(ticketPayload.error ?? "Failed to fetch tickets");
      if (!invoiceRes.ok) throw new Error(invoicePayload.error ?? "Failed to fetch invoice");
      if (!returnRes.ok) throw new Error(returnPayload.error ?? "Failed to fetch returns");

      setData(detailPayload.data);
      setProducts(products);
      setSuppliers(suppliers);
      setCustomers(customers);
      setSalespeople(salespeople);
      setTickets(ticketPayload.data ?? []);
      setInvoiceId(invoicePayload.data?.[0]?.id ?? null);
      setHasRelatedReturns(Array.isArray(returnPayload.data) && returnPayload.data.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  };

  const createInvoiceFromSalesOrder = async () => {
    try {
      setError(null);
      if (invoiceId) {
        router.push(`/invoices/${invoiceId}`);
        return;
      }
      const res = await fetch(`/api/invoices/from-sales-order/${id}`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create invoice");
      const nextInvoiceId = payload.data?.invoice?.id ?? null;
      setInvoiceId(nextInvoiceId);
      setSuccessMessage(payload.data?.existed ? "Invoice already exists." : "Invoice created.");
      if (nextInvoiceId) router.push(`/invoices/${nextInvoiceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    }
  };

  const ensureFulfillment = async (type: "DELIVERY" | "PICKUP") => {
    try {
      setError(null);
      setStartingFulfillmentType(type);
      const res = await fetch(`/api/sales-orders/${id}/fulfillments/ensure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ type }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to start fulfillment");
      const fulfillmentId = String(payload.data?.fulfillmentId ?? "").trim();
      if (!fulfillmentId) throw new Error("Failed to start fulfillment");
      setOpenStartFulfillmentDialog(false);
      router.push(`/fulfillment/${fulfillmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start fulfillment");
    } finally {
      setStartingFulfillmentType(null);
    }
  };

  const createReturnFromSalesOrder = async () => {
    try {
      if (!data) return;
      setError(null);
      setCreatingReturn(true);
      const params = new URLSearchParams();
      params.set("openCreate", "1");
      params.set("customerId", data.customer.id);
      params.set("salesOrderId", data.id);
      if (invoiceId) params.set("invoiceId", invoiceId);
      router.push(`/after-sales/returns?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create return");
    } finally {
      setCreatingReturn(false);
    }
  };

  const searchProducts = async (query: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const queryString = params.toString();
    const res = await fetch(queryString ? `/api/sales-orders/products?${queryString}` : "/api/sales-orders/products", {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch products");
    setProducts(payload.data ?? []);
  };

  useEffect(() => {
    if (!id) return;
    // Guard against double-firing when `role` transitions from its default value
    // ("ADMIN") to the session-loaded value on cold start. Without this, every
    // order-specific API call would fire twice in production.
    // Using `id:role` as the key so a genuine role switch still re-fetches.
    const key = `${id}:${role}`;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);
  useEffect(() => {
    // Skip the initial empty-query fire — load() already fetches the full customer list.
    // Only re-fetch when the user types a real search query.
    if (!customerQuery.trim()) return;
    const timer = window.setTimeout(() => {
      void loadCustomers(customerQuery).catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to fetch customers"),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [customerQuery]);
  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);
  useEffect(() => {
    const created = searchParams.get("created");
    if (created !== "1") return;
    const status = searchParams.get("status");
    setSuccessMessage(status === "confirmed" ? "Sales Order created and confirmed." : "Sales Order created");
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("created");
    nextParams.delete("status");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/sales-orders/${id}?${nextQuery}` : `/sales-orders/${id}`);
  }, [searchParams, router, id]);
  useEffect(() => {
    if (!data?.items) return;
    setRowDraftsByItemId((prev) => {
      const next = { ...prev };
      for (const item of data.items) {
        next[item.id] = {
          quantity: String(item.quantity ?? ""),
          unitPrice: String(item.unitPrice ?? ""),
          lineDiscount: String(item.lineDiscount ?? ""),
          lineTax: next[item.id]?.lineTax ?? "",
          lineDescription: String(item.lineDescription ?? ""),
          fulfillQty: String(item.fulfillQty ?? ""),
        };
      }
      return next;
    });
  }, [data?.items]);

  const paymentStatus = useMemo(() => {
    if (!data) return "Unpaid";
    if (data.paymentStatus === "paid") return "Paid";
    if (data.paymentStatus === "partial") return "Partial";
    return paymentStatusFromTotals(Number(data.paidAmount), Number(data.balanceDue));
  }, [data]);
  const hasValidTotal = useMemo(
    () => (data ? Number.isFinite(Number(data.total)) : false),
    [data],
  );
  const liveTotal = useMemo(() => {
    if (!data) return 0;
    return roundTo2(Number(data.subtotal || 0) - Number(data.discount || 0) + Number(data.tax || 0));
  }, [data]);
  const liveBalanceDue = useMemo(() => {
    if (!data) return 0;
    return roundTo2(liveTotal - Number(data.paidAmount || 0));
  }, [data, liveTotal]);
  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(q) ||
        supplier.contactName.toLowerCase().includes(q) ||
        supplier.phone.toLowerCase().includes(q),
    );
  }, [supplierQuery, suppliers]);
  const walkInCustomerId = useMemo(() => {
    const row = customers.find((customer) => /walk[\s-]?in/i.test(String(customer.name ?? "")));
    return row?.id ?? "";
  }, [customers]);
  const customerOptions = useMemo(() => {
    if (!data?.customer) return customers;
    const exists = customers.some((customer) => customer.id === data.customer.id);
    if (exists) return customers;
    return [
      {
        id: data.customer.id,
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email,
        address: data.customer.address,
        taxExempt: data.customer.taxExempt,
        taxRate: data.customer.taxRate,
      },
      ...customers,
    ];
  }, [customers, data?.customer]);
  const filteredTickets = useMemo(() => {
    if (ticketStatusFilter === "ALL") return tickets;
    return tickets.filter((ticket) => ticket.status === ticketStatusFilter);
  }, [ticketStatusFilter, tickets]);
  const availableByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      map.set(product.id, Number(product.availableStock || 0));
    }
    return map;
  }, [products]);
  const variantSkuById = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) {
      map.set(product.id, String(product.sku || "").trim());
    }
    return map;
  }, [products]);
  const filteredItems = useMemo(() => {
    if (!data) return [];
    const q = itemSearchTerm.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((item) => {
      const title = String(item.productTitle ?? "").toLowerCase();
      const sku = String(item.productSku ?? "").toLowerCase();
      const desc = String(item.lineDescription ?? "").toLowerCase();
      return title.includes(q) || sku.includes(q) || desc.includes(q);
    });
  }, [data, itemSearchTerm]);
  const quickAddCandidates = useMemo(() => {
    const q = quickAddQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((product) => {
      const displayName = buildProductDisplayName(
        product.name,
        product.generatedDescription ?? product.variantDescription ?? product.defaultDescription ?? "",
      ).toLowerCase();
      const searchBlob = [
        displayName,
        product.sku,
        product.name,
        product.title,
        product.brand,
        product.collection,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return searchBlob.includes(q);
    });
  }, [products, quickAddQuery]);
  const activeQuickAddProduct = quickAddCandidates[quickAddActiveIndex] ?? null;
  const quickAddFlooringPlan = getFlooringShipmentPlan(
    Math.max(0, Number(quickAddQty || 0)),
    Number(activeQuickAddProduct?.flooringBoxCoverageSqft ?? 0),
  );
  const activeQuickAddDetails = useMemo(
    () => getProductDetailPreview(activeQuickAddProduct?.generatedDescription ?? activeQuickAddProduct?.variantDescription ?? ""),
    [activeQuickAddProduct],
  );
  const activeDrawerItem = useMemo(
    () => data?.items.find((item) => item.id === activeDrawerItemId) ?? null,
    [data, activeDrawerItemId],
  );
  useEffect(() => {
    if (!quickAddQuery.trim()) {
      setQuickAddOpen(false);
      setQuickAddActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchProducts(quickAddQuery).catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to search products"),
      );
      setQuickAddOpen(true);
      setQuickAddActiveIndex(0);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [quickAddQuery]);
  const activeDrawerDraft = useMemo(() => {
    if (!activeDrawerItem) return null;
    return toItemRowDraft(activeDrawerItem, rowDraftsByItemId[activeDrawerItem.id] ?? null);
  }, [activeDrawerItem, rowDraftsByItemId]);
  const isDrawerDirty = useMemo(() => {
    if (!activeDrawerDraft || !drawerInitialDraft) return false;
    return (
      activeDrawerDraft.lineDescription !== drawerInitialDraft.lineDescription ||
      activeDrawerDraft.lineTax !== drawerInitialDraft.lineTax ||
      activeDrawerDraft.fulfillQty !== drawerInitialDraft.fulfillQty
    );
  }, [activeDrawerDraft, drawerInitialDraft]);
  const activeDrawerDetails = useMemo(
    () => getProductDetailPreview(activeDrawerDraft?.lineDescription ?? activeDrawerItem?.lineDescription ?? ""),
    [activeDrawerDraft?.lineDescription, activeDrawerItem?.lineDescription],
  );
  useEffect(() => {
    if (!activeDrawerItem || !activeDrawerItemId) {
      setDrawerInitialDraft(null);
      return;
    }
    const current = toItemRowDraft(activeDrawerItem, rowDraftsByItemId[activeDrawerItem.id] ?? null);
    setDrawerInitialDraft(current);
    setRowDraftsByItemId((prev) => ({
      ...prev,
      [activeDrawerItem.id]: current,
    }));
  }, [activeDrawerItemId]);
  const showGlobalError = useMemo(
    () => Boolean(error) && !String(error).toLowerCase().includes("variant is required"),
    [error],
  );
  const hasUnsavedItemDrafts = useMemo(() => {
    if (mode !== "edit" || !data) return false;
    return data.items.some((item) => {
      const row = rowDraftsByItemId[item.id];
      if (!row) return false;
      return (
        row.quantity !== String(item.quantity ?? "") ||
        row.unitPrice !== String(item.unitPrice ?? "") ||
        row.lineDiscount !== String(item.lineDiscount ?? "") ||
        row.lineDescription !== String(item.lineDescription ?? "") ||
        row.fulfillQty !== String(item.fulfillQty ?? "")
      );
    });
  }, [mode, data, rowDraftsByItemId]);
  const calcTaxAmount = (subtotalValue: number, discountValue: number, taxRateValue: number) => {
    const taxableBase = Math.max(0, subtotalValue - discountValue);
    const rate = Number.isFinite(taxRateValue) ? Math.max(0, taxRateValue) : 0;
    return roundTo2((taxableBase * rate) / 100);
  };
  const applyCustomerToOrder = (
    prev: SalesOrderDetail,
    nextCustomer: SalesCustomerOption,
    forceAddressForDelivery = false,
  ): SalesOrderDetail => {
    const taxRateNumber = nextCustomer.taxExempt ? 0 : Number(nextCustomer.taxRate ?? 0);
    const nextTaxRate = String(Number.isFinite(taxRateNumber) ? taxRateNumber : 0);
    const nextTax = String(
      calcTaxAmount(Number(prev.subtotal || 0), Number(prev.discount || 0), Number(nextTaxRate || 0)),
    );
    const nextAddress = String(nextCustomer.address ?? "").trim();
    const shouldFillAddress =
      prev.fulfillmentMethod === "DELIVERY" &&
      (forceAddressForDelivery || !String(prev.deliveryAddress1 ?? "").trim());
    const parsedAddress = nextAddress
      ? nextAddress
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
    return {
      ...prev,
      customer: {
        ...prev.customer,
        id: nextCustomer.id,
        name: nextCustomer.name,
        phone: nextCustomer.phone,
        email: nextCustomer.email,
        address: nextCustomer.address,
        taxExempt: nextCustomer.taxExempt,
        taxRate: nextCustomer.taxRate,
      },
      taxRate: nextTaxRate,
      tax: nextTax,
      deliveryName: prev.deliveryName || nextCustomer.name || null,
      deliveryPhone: prev.deliveryPhone || nextCustomer.phone || null,
      deliveryAddress1: shouldFillAddress ? (parsedAddress[0] ?? nextAddress ?? null) : prev.deliveryAddress1,
      deliveryAddress2: shouldFillAddress ? parsedAddress[1] ?? null : prev.deliveryAddress2,
    };
  };
  const hasHeaderUnsavedChanges = useMemo(() => {
    if (mode !== "edit" || !data || !editSnapshot) return false;
    return (
      data.customer.id !== editSnapshot.customer.id ||
      data.projectName !== editSnapshot.projectName ||
      data.salespersonName !== editSnapshot.salespersonName ||
      String(data.discount) !== String(editSnapshot.discount) ||
      String(data.taxRate ?? "0") !== String(editSnapshot.taxRate ?? "0") ||
      String(data.tax) !== String(editSnapshot.tax) ||
      data.specialOrder !== editSnapshot.specialOrder ||
      data.supplierId !== editSnapshot.supplierId ||
      data.etaDate !== editSnapshot.etaDate ||
      data.specialOrderStatus !== editSnapshot.specialOrderStatus ||
      data.supplierNotes !== editSnapshot.supplierNotes ||
      data.fulfillmentMethod !== editSnapshot.fulfillmentMethod ||
      data.deliveryName !== editSnapshot.deliveryName ||
      data.deliveryPhone !== editSnapshot.deliveryPhone ||
      data.deliveryAddress1 !== editSnapshot.deliveryAddress1 ||
      data.deliveryAddress2 !== editSnapshot.deliveryAddress2 ||
      data.deliveryCity !== editSnapshot.deliveryCity ||
      data.deliveryState !== editSnapshot.deliveryState ||
      data.deliveryZip !== editSnapshot.deliveryZip ||
      data.deliveryNotes !== editSnapshot.deliveryNotes ||
      data.pickupNotes !== editSnapshot.pickupNotes ||
      data.requestedDeliveryAt !== editSnapshot.requestedDeliveryAt ||
      data.notes !== editSnapshot.notes ||
      String(data.depositRequired) !== String(editSnapshot.depositRequired)
    );
  }, [mode, data, editSnapshot]);
  const hasUnsavedChanges = hasUnsavedItemDrafts || hasHeaderUnsavedChanges;
  const isInvoiceCreateEligible = useMemo(() => {
    const status = String(data?.status ?? "").toUpperCase();
    return ["CONFIRMED", "READY", "PARTIALLY_FULFILLED", "FULFILLED"].includes(status);
  }, [data?.status]);
  const activeFulfillment = useMemo(
    () => data?.fulfillments.find((item) => item.status !== "CANCELLED") ?? null,
    [data?.fulfillments],
  );

  useEffect(() => {
    const fulfillmentId = activeFulfillment?.id;
    if (!fulfillmentId) {
      setActiveFulfillmentDetail(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/fulfillments/${fulfillmentId}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load fulfillment detail");
        if (cancelled) return;
        setActiveFulfillmentDetail(payload.data as FulfillmentDetailPreview);
      } catch {
        if (!cancelled) setActiveFulfillmentDetail(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeFulfillment?.id, role]);

  const activeFulfillmentProgress = useMemo(() => {
    const rows = activeFulfillmentDetail?.items ?? [];
    const total = rows.length;
    if (total === 0) return { total: 0, completed: 0, percent: 0, anyFulfilled: false, partial: false };
    let completed = 0;
    let anyFulfilled = false;
    for (const row of rows) {
      const ordered = Number(row.orderedQty ?? 0);
      const fulfilled = Number(row.fulfilledQty ?? 0);
      if (fulfilled > 0) anyFulfilled = true;
      if (fulfilled >= ordered) completed += 1;
    }
    const percent = Math.round((completed / total) * 100);
    const partial = anyFulfilled && completed < total;
    return { total, completed, percent, anyFulfilled, partial };
  }, [activeFulfillmentDetail]);

  const canStartFulfillment = useMemo(() => {
    const status = String(data?.status ?? "").toUpperCase();
    return ["CONFIRMED", "READY", "PARTIALLY_FULFILLED"].includes(status);
  }, [data?.status]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const updateHeader = async () => {
    if (!data) return;
    if (data.fulfillmentMethod === "DELIVERY") {
      const required = [
        String(data.deliveryAddress1 ?? "").trim(),
        String(data.deliveryCity ?? "").trim(),
        String(data.deliveryState ?? "").trim(),
        String(data.deliveryZip ?? "").trim(),
      ];
      if (required.some((value) => !value)) {
        setError("Delivery requires address line1/city/state/zip.");
        return false;
      }
    }
    setSavingHeader(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          customerId: data.customer.id,
          projectName: data.projectName,
          specialOrder: data.specialOrder,
          supplierId: data.specialOrder ? data.supplierId : null,
          etaDate: data.specialOrder ? data.etaDate : null,
          specialOrderStatus: data.specialOrder ? data.specialOrderStatus : null,
          supplierNotes: data.specialOrder ? data.supplierNotes : null,
          fulfillmentMethod: data.fulfillmentMethod || "PICKUP",
          deliveryName: data.deliveryName,
          deliveryPhone: data.deliveryPhone,
          deliveryAddress1: data.deliveryAddress1,
          deliveryAddress2: data.deliveryAddress2,
          deliveryCity: data.deliveryCity,
          deliveryState: data.deliveryState,
          deliveryZip: data.deliveryZip,
          deliveryNotes: data.deliveryNotes,
          pickupNotes: data.pickupNotes,
          requestedDeliveryAt: data.requestedDeliveryAt,
          discount: Number(data.discount),
          taxRate: Number(data.taxRate ?? 0),
          tax: Number(data.tax),
          salespersonName: data.salespersonName,
          notes: data.notes,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update order");
      setData(payload.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
      return false;
    } finally {
      setSavingHeader(false);
    }
  };

  const updateDepositRequired = async () => {
    if (!data) return;
    setSavingDeposit(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ depositRequired: Number(data.depositRequired || 0) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update deposit");
      setData(payload.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update deposit");
      return false;
    } finally {
      setSavingDeposit(false);
    }
  };

  const addItem = async () => {
    try {
      const res = await fetch(`/api/sales-orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          productId: null,
          variantId: null,
          productSku: null,
          productTitle: null,
          description: null,
          lineDescription: "",
          quantity: 1,
          unitPrice: 0,
          lineDiscount: 0,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add item");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  };

  const quickAddVariant = async (product: SalesProduct, keepFocus: boolean) => {
    const qty = Math.max(1, Number(quickAddQty || 1));
    if (!Number.isFinite(qty)) return;
    const sellingUnit = product.sellingUnit ?? resolveSellingUnit(product.category, product.unit);
    const roundedQty = qty;
    try {
      setError(null);
      const existingItem = data?.items.find((item) => item.variantId === product.id) ?? null;
      if (existingItem) {
        const nextQty = Number(existingItem.quantity || 0) + roundedQty;
        const res = await fetch(`/api/sales-orders/${id}/items/${existingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({ quantity: nextQty }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to update item");
        setData(payload.data);
      } else {
        const res = await fetch(`/api/sales-orders/${id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({
            productId: product.productId,
            variantId: product.id,
            productSku: product.sku,
            productTitle: product.name,
            uomSnapshot: sellingUnit,
            description: product.generatedDescription ?? null,
            lineDescription: product.generatedDescription ?? "",
            quantity: roundedQty,
            unitPrice: Number(product.price || 0),
            lineDiscount: 0,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to add item");
        setData(payload.data);
      }

      setQuickAddQuery("");
      setQuickAddOpen(false);
      setQuickAddActiveIndex(0);
      if (keepFocus) {
        quickAddSearchRef.current?.focus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to quick add item");
    }
  };

  const patchItem = async (itemId: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/sales-orders/${id}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update item");
      setData(payload.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
      return false;
    }
  };

  const updateRowDraft = (
    itemId: string,
    key: "quantity" | "unitPrice" | "lineDiscount" | "lineTax" | "lineDescription" | "fulfillQty",
    value: string,
  ) => {
    setRowDraftsByItemId((prev) => ({
      ...prev,
      [itemId]: {
        quantity: prev[itemId]?.quantity ?? "",
        unitPrice: prev[itemId]?.unitPrice ?? "",
        lineDiscount: prev[itemId]?.lineDiscount ?? "",
        lineTax: prev[itemId]?.lineTax ?? "",
        lineDescription: prev[itemId]?.lineDescription ?? "",
        fulfillQty: prev[itemId]?.fulfillQty ?? "",
        [key]: value,
      },
    }));
  };


  const resetItemDescriptionToTemplate = (itemId: string, variantId: string | null) => {
    if (!variantId) return;
    const product = products.find((row) => row.id === variantId);
    if (!product) return;
    updateRowDraft(itemId, "lineDescription", product.generatedDescription ?? "");
  };

  const removeItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/sales-orders/${id}/items/${itemId}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete item");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  const submitPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    if (!Number.isFinite(Number(data.total))) {
      setError("Order total is missing.");
      return;
    }
    try {
      const amount = Number(paymentForm.amount || 0);
      if (amount <= 0) {
        throw new Error("Payment amount must be greater than 0.");
      }
      const res = await fetch(`/api/sales-orders/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          amount,
          method: paymentForm.method,
          referenceNumber: paymentForm.referenceNumber || null,
          receivedAt: paymentForm.receivedAt || null,
          notes: paymentForm.notes || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add payment");
      setData(payload.data);
      setOpenPayment(false);
      setPaymentQuickHint(null);
      setPaymentForm({ amount: "", method: "CASH", referenceNumber: "", receivedAt: "", notes: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment");
    }
  };

  const applyDepositQuickFill = () => {
    if (!data || !hasValidTotal) {
      setPaymentQuickHint("Order total is missing.");
      return;
    }
    const depositRequired = Number(data.depositRequired || 0);
    const paidAmount = Number(data.paidAmount || 0);
    if (!Number.isFinite(depositRequired) || !Number.isFinite(paidAmount)) {
      setPaymentQuickHint("Unable to calculate deposit due.");
      return;
    }
    const depositDue = roundTo2(Math.max(depositRequired - paidAmount, 0));
    if (depositRequired <= 0 || depositDue <= 0) {
      setPaymentQuickHint("No deposit due.");
      setPaymentForm((prev) => ({ ...prev, amount: "0.00" }));
      return;
    }
    setPaymentQuickHint(null);
    setPaymentForm((prev) => ({ ...prev, amount: depositDue.toFixed(2) }));
  };

  const applyBalanceQuickFill = () => {
    if (!data || !hasValidTotal) {
      setPaymentQuickHint("Order total is missing.");
      return;
    }
    const balanceDue = Number(data.balanceDue || 0);
    if (!Number.isFinite(balanceDue)) {
      setPaymentQuickHint("Unable to calculate balance due.");
      return;
    }
    const collectBalance = roundTo2(Math.max(balanceDue, 0));
    if (collectBalance <= 0) {
      setPaymentQuickHint("No balance due.");
      setPaymentForm((prev) => ({ ...prev, amount: "0.00" }));
      return;
    }
    setPaymentQuickHint(null);
    setPaymentForm((prev) => ({ ...prev, amount: collectBalance.toFixed(2) }));
  };

  const voidPayment = async (paymentId: string) => {
    const ok = window.confirm("Void this payment? This action cannot be undone.");
    if (!ok) return;
    try {
      const res = await fetch(`/api/sales-order-payments/${paymentId}/void`, {
        method: "POST",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to void payment");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void payment");
    }
  };

  const updateStatus = async (status: "DRAFT" | "QUOTED" | "CONFIRMED" | "CANCELLED") => {
    setSavingStatus(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update status");
      setData(payload.data);
      if (status === "CONFIRMED") {
        const reservedBoxes = getReservedFlooringBoxesFromItems(payload.data?.items ?? []);
        if (reservedBoxes > 0) {
          setSuccessMessage(`Reserved: ${reservedBoxes} boxes`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  };

  const convertQuote = async () => {
    const ok = window.confirm("Convert Quote to Sales Order?");
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${id}/convert`, {
        method: "PATCH",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to convert quote");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert quote");
    }
  };

  const addFulfillment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const res = await fetch(`/api/sales-orders/${id}/fulfillments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          type: fulfillmentForm.type,
          scheduledDate: fulfillmentForm.scheduledDate || null,
          status: "PENDING",
          address: fulfillmentForm.address || null,
          notes: fulfillmentForm.notes || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add fulfillment");
      setData(payload.data);
      setError(null);
      let createdTicket = false;
      if (fulfillmentForm.autoCreateTicket) {
        const ticketType = fulfillmentForm.type === "PICKUP" ? "PICK" : "DELIVERY";
        const ticketRes = await fetch(`/api/sales-orders/${id}/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({
            ticketType,
            status: "open",
            fulfillmentId: payload.meta?.createdFulfillmentId || null,
            scheduledAt: fulfillmentForm.scheduledDate || null,
            notes: fulfillmentForm.notes || null,
          }),
        });
        const ticketPayload = await ticketRes.json();
        if (!ticketRes.ok) throw new Error(ticketPayload.error ?? "Failed to auto-create ticket");
        setTickets((prev) => [ticketPayload.data, ...prev]);
        createdTicket = true;
      }
      setSuccessMessage(createdTicket ? "Fulfillment and ticket created." : "Fulfillment created.");
      setOpenFulfillment(false);
      setFulfillmentForm({
        type: "DELIVERY",
        scheduledDate: "",
        address: "",
        notes: "",
        autoCreateTicket: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add fulfillment");
    }
  };

  const updateFulfillmentStatus = async (
    fulfillmentId: string,
    status: "PENDING" | "READY" | "COMPLETED" | "VOIDED",
  ) => {
    try {
      const res = await fetch(`/api/sales-orders/${id}/fulfillments/${fulfillmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update fulfillment");
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fulfillment");
    }
  };

  const addTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const res = await fetch(`/api/sales-orders/${id}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          ticketType: ticketForm.ticketType,
          status: ticketForm.status,
          fulfillmentId: ticketForm.fulfillmentId || null,
          scheduledAt: ticketForm.scheduledAt || null,
          notes: ticketForm.notes || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create ticket");
      setTickets((prev) => [payload.data, ...prev]);
      setError(null);
      setSuccessMessage("Ticket created.");
      setOpenTicket(false);
      setTicketForm({
        ticketType: "PICK",
        status: "open",
        fulfillmentId: "",
        scheduledAt: "",
        notes: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const payload: Record<string, unknown> = { status };
      if (status === "done") payload.completedAt = new Date().toISOString();
      const res = await fetch(`/api/sales-orders/${id}/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update ticket");
      setTickets((prev) => prev.map((ticket) => (ticket.id === ticketId ? body.data : ticket)));
      setError(null);
      setSuccessMessage("Ticket status updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  };

  const setAllFulfillQty = async (mode: "ALL" | "RESET") => {
    if (!data || data.items.length === 0) return;
    try {
      await Promise.all(
        data.items.map((item) =>
          fetch(`/api/sales-orders/${id}/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-user-role": role },
            body: JSON.stringify({
              fulfillQty: mode === "ALL" ? Number(item.quantity) : 0,
            }),
          }),
        ),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fulfillment quantity");
    }
  };
  const enterEditMode = () => {
    if (!data) return;
    setEditSnapshot(JSON.parse(JSON.stringify(data)));
    setMode("edit");
  };
  const cancelEditMode = async () => {
    if (hasUnsavedChanges) {
      const ok = window.confirm("You have unsaved changes. Discard and leave edit mode?");
      if (!ok) return;
    }
    await load();
    setMode("view");
    setEditSnapshot(null);
    setActiveDrawerItemId(null);
  };
  const saveEditMode = async () => {
    if (!data) return;
    let ok = true;
    for (const item of data.items) {
      const row = rowDraftsByItemId[item.id];
      if (!row) continue;
      const patch: Record<string, unknown> = {};
      if (row.quantity !== String(item.quantity ?? "")) patch.quantity = Number(row.quantity || 0);
      if (row.unitPrice !== String(item.unitPrice ?? "")) patch.unitPrice = Number(row.unitPrice || 0);
      if (row.lineDiscount !== String(item.lineDiscount ?? "")) patch.lineDiscount = Number(row.lineDiscount || 0);
      if (row.lineDescription !== String(item.lineDescription ?? "")) {
        patch.lineDescription = row.lineDescription;
        patch.description = row.lineDescription || null;
      }
      if (row.fulfillQty !== String(item.fulfillQty ?? "")) patch.fulfillQty = Number(row.fulfillQty || 0);
      if (Object.keys(patch).length === 0) continue;
      const success = await patchItem(item.id, patch);
      if (!success) {
        ok = false;
        break;
      }
    }
    if (ok && hasHeaderUnsavedChanges) {
      const headerOk = await updateHeader();
      if (!headerOk) ok = false;
      const depositOk = ok ? await updateDepositRequired() : false;
      if (!depositOk) ok = false;
    }
    if (!ok) return;
    setMode("view");
    setEditSnapshot(null);
    setActiveDrawerItemId(null);
  };

  const closeLineItemDrawer = () => {
    if (mode === "edit" && isDrawerDirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    setActiveDrawerItemId(null);
    setDrawerInitialDraft(null);
  };

  const saveActiveDrawerItem = async () => {
    if (!activeDrawerItem || !activeDrawerDraft || mode !== "edit" || !isDrawerDirty) return;
    const patch: Record<string, unknown> = {};
    if (activeDrawerDraft.lineDescription !== String(activeDrawerItem.lineDescription ?? "")) {
      patch.lineDescription = activeDrawerDraft.lineDescription;
      patch.description = activeDrawerDraft.lineDescription || null;
    }
    if (activeDrawerDraft.fulfillQty !== String(activeDrawerItem.fulfillQty ?? "")) {
      patch.fulfillQty = Number(activeDrawerDraft.fulfillQty || 0);
    }
    if (activeDrawerDraft.lineTax !== (drawerInitialDraft?.lineTax ?? "")) {
      const tax = Number(activeDrawerDraft.lineTax || 0);
      if (Number.isFinite(tax)) {
        patch.tax = tax;
        patch.lineTax = tax;
      }
    }
    if (Object.keys(patch).length === 0) return;
    setSavingDrawerItem(true);
    setError(null);
    const ok = await patchItem(activeDrawerItem.id, patch);
    setSavingDrawerItem(false);
    if (!ok) return;
    setSuccessMessage("Line item updated");
    setActiveDrawerItemId(null);
    setDrawerInitialDraft(null);
  };

  useEffect(() => {
    if (!activeDrawerItemId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        void saveActiveDrawerItem();
        return;
      }
      if (key === "escape") {
        event.preventDefault();
        closeLineItemDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeDrawerItemId, mode, isDrawerDirty, activeDrawerItem, activeDrawerDraft, rowDraftsByItemId]);

  return (
    <section className="so-glass-page mx-auto max-w-[1400px] space-y-6 px-4 py-6 text-white">
      {successMessage ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          {successMessage}
        </div>
      ) : null}
      {showGlobalError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="glass-card p-8 text-sm text-slate-400">
          <div className="glass-card-content">Loading order...</div>
        </div>
      ) : (
        <>
          {/* 1) Header Summary */}
          <header className="glass-card px-6 py-4">
            <div className="glass-card-content flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-white">{data.orderNumber}</h1>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${mode === "edit" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-white/20 bg-white/5 text-slate-300"}`}>
                  {mode === "edit" ? "EDIT" : "VIEW"}
                </span>
                <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                  {getSalesOrderStatusLabel(data.status)}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${paymentStatus === "Paid" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : paymentStatus === "Partial" ? "border-sky-500/40 bg-sky-500/10 text-sky-200" : "border-white/20 bg-white/5 text-slate-300"}`}>
                  {paymentStatus}
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-sm text-slate-300">{data.customer.name || "-"}</span>
                <span className="text-slate-500">·</span>
                <span className="text-sm text-slate-400">{data.fulfillmentMethod === "DELIVERY" ? "Delivery" : "Pickup"}</span>
                <span className="text-slate-500">·</span>
                <span className="text-sm text-slate-500">{new Date(data.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => router.push(`/sales-orders/edit/${data.id}`)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10">
                  Edit Order
                </button>
                {data.docType === "SALES_ORDER" ? (
                  <button type="button" onClick={createInvoiceFromSalesOrder} disabled={!isInvoiceCreateEligible} title={!isInvoiceCreateEligible ? "Confirm the sales order to create an invoice." : undefined} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50">
                    {invoiceId ? "View Invoice" : "Create Invoice"}
                  </button>
                ) : null}
                {data.docType === "SALES_ORDER" ? (
                  <button type="button" onClick={() => { if (activeFulfillment?.id) { router.push(`/fulfillment/${activeFulfillment.id}`); return; } setOpenStartFulfillmentDialog(true); }} disabled={!activeFulfillment && !canStartFulfillment} title={!activeFulfillment && !canStartFulfillment ? "Confirm the sales order before starting fulfillment." : undefined} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50">
                    {activeFulfillment ? "View Fulfillment" : "Start Fulfillment"}
                  </button>
                ) : null}
                {data.docType === "SALES_ORDER" ? (
                  <button type="button" onClick={createReturnFromSalesOrder} disabled={creatingReturn} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50">
                    {creatingReturn ? "Creating..." : "Create Return"}
                  </button>
                ) : null}
                <Link href={`/orders/${data.id}/print`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10">
                  Print
                </Link>
                <button type="button" onClick={() => setPdfPreview({ title: `${data.docType === "QUOTE" ? "Quote" : "Sales Order"} ${data.orderNumber}`, src: `/api/pdf/sales-order/${data.id}` })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10">
                  PDF
                </button>
              </div>
            </div>
          </header>

          {/* 2) Main 2-column workspace: 70% left, 30% right */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            {/* Left: Order Info, Fulfillment Summary, then Items table below */}
            <div className="space-y-6">
              {/* A. Order Info */}
              <div className="glass-card p-4">
                <div className="glass-card-content">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Order Info</h2>
                  <div className="mt-4 grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                    <span className="text-slate-500">Customer</span>
                    <span className="text-white/90">{data.customer.name || "-"}{data.customer.phone ? ` · ${data.customer.phone}` : ""}</span>
                    <span className="text-slate-500">Project</span>
                    <span className="text-white/90">{data.projectName || "-"}</span>
                    <span className="text-slate-500">Salesperson</span>
                    <span className="text-white/90">{data.salespersonName || "-"}</span>
                    <span className="text-slate-500">Tax Rate</span>
                    <span className="text-white/90">{data.customer.taxExempt ? "Tax Exempt (0%)" : `${Number(data.taxRate ?? 0).toFixed(2)}%`}</span>
                    <span className="text-slate-500">Warehouse</span>
                    <span className="text-white/90">—</span>
                    <span className="text-slate-500">Order Date</span>
                    <span className="text-white/90">{new Date(data.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</span>
                    <span className="text-slate-500">Pickup / Delivery</span>
                    <span className="text-white/90">{data.fulfillmentMethod === "PICKUP" ? (String(data.pickupNotes ?? "").trim() || "Pickup") : [data.deliveryAddress1, data.deliveryAddress2, data.deliveryCity, data.deliveryState, data.deliveryZip].filter(Boolean).join(", ") || "Delivery"}</span>
                  </div>
                </div>
              </div>

              {/* B. Fulfillment Summary */}
              <div className="glass-card p-4">
                <div className="glass-card-content">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fulfillment Summary</h2>
                  <div className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                    <span className="text-slate-500">Fulfillment Type</span>
                    <span className="text-white/90">{data.fulfillmentMethod === "DELIVERY" ? "Delivery" : "Pickup"}</span>
                    <span className="text-slate-500">Fulfillment Status</span>
                    <span className="text-white/90">{activeFulfillmentDetail ? (<span className="inline-flex items-center gap-2"><span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{activeFulfillmentDetail.status}</span>{activeFulfillmentProgress.partial ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">Partial</span> : null}</span>) : activeFulfillment ? activeFulfillment.status : "-"}</span>
                    <span className="text-slate-500">Progress</span>
                    <span className="text-white/90">{activeFulfillmentDetail ? (<span className="inline-flex items-center gap-2"><span>{activeFulfillmentProgress.completed}/{activeFulfillmentProgress.total} items · {activeFulfillmentProgress.percent}%</span><span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><span className="block h-1.5 rounded-full bg-white/30" style={{ width: `${Math.min(Math.max(activeFulfillmentProgress.percent, 0), 100)}%` }} /></span></span>) : "-"}</span>
                    <span className="text-slate-500">Pickup / Delivery</span>
                    <span className="text-white/90">{data.fulfillmentMethod === "PICKUP" ? (String(data.pickupNotes ?? "").trim() || "Pickup") : [data.deliveryAddress1, data.deliveryCity, data.deliveryState, data.deliveryZip].filter(Boolean).join(", ") || "-"}</span>
                    <span className="text-slate-500">Documents</span>
                    <span className="flex flex-wrap gap-2">{activeFulfillment ? (<><button type="button" onClick={() => setPdfPreview({ title: `Pick List ${activeFulfillment.id.slice(0, 8)}`, src: `/api/fulfillments/${activeFulfillment.id}/pdf?type=pick` })} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 transition hover:bg-white/10">Pick List</button><button type="button" onClick={() => setPdfPreview({ title: `${data.fulfillmentMethod === "DELIVERY" ? "Delivery" : "Pickup"} Slip ${activeFulfillment.id.slice(0, 8)}`, src: `/api/fulfillments/${activeFulfillment.id}/pdf?type=slip` })} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 transition hover:bg-white/10">{data.fulfillmentMethod === "DELIVERY" ? "Delivery Slip" : "Pickup Slip"}</button></>) : "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Summary rail */}
            <div className="space-y-6">
              {/* A. Financial Summary */}
              <div className="glass-card p-5">
                <div className="glass-card-content">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Financial Summary</h2>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-semibold text-white">${Number(liveTotal).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="text-white/90">${Number(data.paidAmount).toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-slate-400">Balance</span><span className="font-semibold text-white">${Number(liveBalanceDue).toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
              {/* B. Quick Actions */}
              <div className="glass-card p-5">
                <div className="glass-card-content">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quick Actions</h2>
                  <div className="mt-3 flex flex-col gap-2">
                    <Link href="/orders" className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-left text-xs font-medium text-white/90 transition hover:bg-white/10">
                      Back to Orders
                    </Link>
                    <button type="button" onClick={() => router.push(`/sales-orders/edit/${data.id}`)} className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-left text-xs font-medium text-white/90 transition hover:bg-white/10">Edit Order</button>
                    {data.docType === "SALES_ORDER" ? <button type="button" onClick={createInvoiceFromSalesOrder} disabled={!isInvoiceCreateEligible} className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-left text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50">{invoiceId ? "View Invoice" : "Create Invoice"}</button> : null}
                    {data.docType === "SALES_ORDER" ? <button type="button" onClick={() => { if (activeFulfillment?.id) router.push(`/fulfillment/${activeFulfillment.id}`); else setOpenStartFulfillmentDialog(true); }} disabled={!activeFulfillment && !canStartFulfillment} className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-left text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50">{activeFulfillment ? "View Fulfillment" : "Start Fulfillment"}</button> : null}
                    {data.docType === "SALES_ORDER" ? <button type="button" onClick={createReturnFromSalesOrder} disabled={creatingReturn} className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-left text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50">Create Return</button> : null}
                    <Link href={`/orders/${data.id}/print`} className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-center text-xs font-medium text-white/90 transition hover:bg-white/10">Print PDF</Link>
                  </div>
                </div>
              </div>
              {/* C. Fulfillment Snapshot */}
              <div className="glass-card p-5">
                <div className="glass-card-content">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fulfillment Snapshot</h2>
                  <div className="mt-3 space-y-2 text-xs text-slate-400">
                    <p><span className="text-slate-500">Type:</span> {data.fulfillmentMethod === "DELIVERY" ? "Delivery" : "Pickup"}</p>
                    <p><span className="text-slate-500">Status:</span> {activeFulfillment ? activeFulfillment.status : "—"}</p>
                    {activeFulfillmentDetail ? <p><span className="text-slate-500">Progress:</span> {activeFulfillmentProgress.completed}/{activeFulfillmentProgress.total} · {activeFulfillmentProgress.percent}%</p> : null}
                    {activeFulfillment ? <div className="pt-1 flex gap-2"><button type="button" onClick={() => setPdfPreview({ title: "Pick List", src: `/api/fulfillments/${activeFulfillment.id}/pdf?type=pick` })} className="text-white/70 hover:text-white">Pick List</button><button type="button" onClick={() => setPdfPreview({ title: "Slip", src: `/api/fulfillments/${activeFulfillment.id}/pdf?type=slip` })} className="text-white/70 hover:text-white">Slip</button></div> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {openDetailsDrawer ? (
            <div className="fixed inset-0 z-40 flex">
              <button
                type="button"
                aria-label="Close details drawer"
                className="h-full flex-1 bg-slate-900/20"
                onClick={() => setOpenDetailsDrawer(false)}
              />
              <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#0F172A] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                  <h3 className="text-sm font-semibold text-white">Edit Details</h3>
                  <button
                    type="button"
                    onClick={() => setOpenDetailsDrawer(false)}
                    className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block space-y-1 md:col-span-2">
                      <span className="text-xs text-slate-400">Search Customer</span>
                      <input
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                        placeholder="Name / phone / email"
                        className="ios-input h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Customer</span>
                      <select
                        value={data.customer.id}
                        onChange={(e) => {
                          const customerId = e.target.value;
                          const selectedCustomer = customers.find((customer) => customer.id === customerId);
                          if (!selectedCustomer) return;
                          setData((prev) => (prev ? applyCustomerToOrder(prev, selectedCustomer, true) : prev));
                        }}
                        className="ios-input h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:ring-1 focus:ring-white/20"
                      >
                        {walkInCustomerId ? <option value={walkInCustomerId}>Walk-in Customer</option> : null}
                        {customerOptions.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                            {customer.phone ? ` (${customer.phone})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Project</span>
                      <input
                        value={data.projectName ?? ""}
                        placeholder="Kitchen Renovation"
                        onChange={(e) => setData((prev) => (prev ? { ...prev, projectName: e.target.value } : prev))}
                        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Salesperson</span>
                      <select
                        value={data.salespersonName ?? ""}
                        onChange={(e) => setData((prev) => (prev ? { ...prev, salespersonName: e.target.value } : prev))}
                        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                      >
                        <option value="">Select salesperson</option>
                        {data.salespersonName &&
                        !salespeople.some((user) => user.name === data.salespersonName) ? (
                          <option value={data.salespersonName}>{data.salespersonName}</option>
                        ) : null}
                        {salespeople.map((user) => (
                          <option key={user.id} value={user.name}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Discount</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={data.discount}
                        onChange={(e) =>
                          setData((prev) => {
                            if (!prev) return prev;
                            const nextDiscount = e.target.value;
                            const nextTax = calcTaxAmount(
                              Number(prev.subtotal || 0),
                              Number(nextDiscount || 0),
                              Number(prev.taxRate ?? 0),
                            );
                            return { ...prev, discount: nextDiscount, tax: String(nextTax) };
                          })
                        }
                        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-right text-sm outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">
                        Tax Rate{" "}
                        {data.customer.taxExempt ? <span className="font-medium text-emerald-700">(Tax Exempt)</span> : null}
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={data.customer.taxExempt ? "0" : String(data.taxRate ?? "0")}
                          disabled={data.customer.taxExempt}
                          onChange={(e) =>
                            setData((prev) => {
                              if (!prev) return prev;
                              const nextRate = e.target.value;
                              const nextTax = calcTaxAmount(
                                Number(prev.subtotal || 0),
                                Number(prev.discount || 0),
                                Number(nextRate || 0),
                              );
                              return { ...prev, taxRate: nextRate, tax: String(nextTax) };
                            })
                          }
                          className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white pr-6 text-right text-sm outline-none focus:ring-1 focus:ring-white/20 disabled:bg-slate-100"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          %
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">Tax Amount: ${Number(data.tax || 0).toFixed(2)}</p>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Tax Amount</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={data.tax}
                        readOnly
                        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-right text-sm text-white outline-none focus:ring-1 focus:ring-white/20"
                      />
                    </label>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-[#374151]">
                    <input
                      type="checkbox"
                      checked={data.specialOrder}
                      onChange={(e) =>
                        setData((prev) =>
                          prev
                            ? {
                                ...prev,
                                specialOrder: e.target.checked,
                                supplierId: e.target.checked ? prev.supplierId : null,
                                etaDate: e.target.checked ? prev.etaDate : null,
                                specialOrderStatus: e.target.checked ? prev.specialOrderStatus : null,
                                supplierNotes: e.target.checked ? prev.supplierNotes : null,
                              }
                            : prev,
                        )
                      }
                    />
                    Special Order
                  </label>

                  {data.specialOrder ? (
                    <div className="space-y-3 rounded-md border border-white/10 bg-[#F3F4F6] p-3">
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Search Supplier</span>
                        <input
                          value={supplierQuery}
                          onChange={(e) => setSupplierQuery(e.target.value)}
                          placeholder="Name / contact / phone"
                          className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Supplier</span>
                        <select
                          value={data.supplierId ?? ""}
                          onChange={(e) =>
                            setData((prev) => (prev ? { ...prev, supplierId: e.target.value || null } : prev))
                          }
                          className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                        >
                          <option value="">Select supplier</option>
                          {filteredSuppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-400">ETA Date</span>
                          <input
                            type="date"
                            value={data.etaDate ? new Date(data.etaDate).toISOString().slice(0, 10) : ""}
                            onChange={(e) =>
                              setData((prev) => (prev ? { ...prev, etaDate: e.target.value || null } : prev))
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-400">Special Order Status</span>
                          <select
                            value={data.specialOrderStatus ?? ""}
                            onChange={(e) =>
                              setData((prev) => (prev ? { ...prev, specialOrderStatus: e.target.value || null } : prev))
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                          >
                            <option value="">Select status</option>
                            <option value="REQUESTED">Requested</option>
                            <option value="ORDERED">Ordered</option>
                            <option value="IN_TRANSIT">In Transit</option>
                            <option value="ARRIVED">Arrived</option>
                            <option value="DELIVERED">Delivered</option>
                          </select>
                        </label>
                      </div>
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Supplier Communication Notes</span>
                        <textarea
                          value={data.supplierNotes ?? ""}
                          onChange={(e) =>
                            setData((prev) => (prev ? { ...prev, supplierNotes: e.target.value } : prev))
                          }
                          className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:ring-1 focus:ring-white/20"
                          rows={2}
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded-md border border-white/10 bg-[#F8FAFC] p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fulfillment</h4>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Delivery Method</span>
                      <select
                        value={data.fulfillmentMethod ?? "PICKUP"}
                        onChange={(e) =>
                          setData((prev) =>
                            prev
                              ? (() => {
                                  const nextMethod = e.target.value === "DELIVERY" ? "DELIVERY" : "PICKUP";
                                  if (nextMethod !== "DELIVERY") {
                                    return { ...prev, fulfillmentMethod: "PICKUP" };
                                  }
                                  const customerAddress = String(prev.customer.address ?? "").trim();
                                  const parsed = customerAddress
                                    .split(",")
                                    .map((part) => part.trim())
                                    .filter(Boolean);
                                  return {
                                    ...prev,
                                    fulfillmentMethod: "DELIVERY",
                                    deliveryName: prev.deliveryName || prev.customer.name || null,
                                    deliveryPhone: prev.deliveryPhone || prev.customer.phone || null,
                                    deliveryAddress1: prev.deliveryAddress1 || parsed[0] || customerAddress || null,
                                    deliveryAddress2: prev.deliveryAddress2 || parsed[1] || null,
                                  };
                                })()
                              : prev,
                          )
                        }
                        className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                      >
                        <option value="PICKUP">Pickup</option>
                        <option value="DELIVERY">Delivery</option>
                      </select>
                    </label>

                    {data.fulfillmentMethod === "DELIVERY" ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="block space-y-1">
                            <span className="text-xs text-slate-400">Contact name</span>
                            <input
                              value={data.deliveryName ?? ""}
                              onChange={(e) =>
                                setData((prev) => (prev ? { ...prev, deliveryName: e.target.value } : prev))
                              }
                              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-xs text-slate-400">Phone</span>
                            <input
                              value={data.deliveryPhone ?? ""}
                              onChange={(e) =>
                                setData((prev) => (prev ? { ...prev, deliveryPhone: e.target.value } : prev))
                              }
                              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </label>
                        </div>
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-400">Address 1 *</span>
                          <input
                            value={data.deliveryAddress1 ?? ""}
                            onChange={(e) =>
                              setData((prev) => (prev ? { ...prev, deliveryAddress1: e.target.value } : prev))
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-400">Address 2</span>
                          <input
                            value={data.deliveryAddress2 ?? ""}
                            onChange={(e) =>
                              setData((prev) => (prev ? { ...prev, deliveryAddress2: e.target.value } : prev))
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                          />
                        </label>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="block space-y-1">
                            <span className="text-xs text-slate-400">City *</span>
                            <input
                              value={data.deliveryCity ?? ""}
                              onChange={(e) =>
                                setData((prev) => (prev ? { ...prev, deliveryCity: e.target.value } : prev))
                              }
                              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-xs text-slate-400">State *</span>
                            <input
                              value={data.deliveryState ?? ""}
                              onChange={(e) =>
                                setData((prev) => (prev ? { ...prev, deliveryState: e.target.value } : prev))
                              }
                              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-xs text-slate-400">Zip *</span>
                            <input
                              value={data.deliveryZip ?? ""}
                              onChange={(e) =>
                                setData((prev) => (prev ? { ...prev, deliveryZip: e.target.value } : prev))
                              }
                              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                            />
                          </label>
                        </div>
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-400">Requested delivery date/time</span>
                          <input
                            type="datetime-local"
                            value={
                              data.requestedDeliveryAt
                                ? new Date(data.requestedDeliveryAt).toISOString().slice(0, 16)
                                : ""
                            }
                            onChange={(e) =>
                              setData((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      requestedDeliveryAt: e.target.value
                                        ? new Date(e.target.value).toISOString()
                                        : null,
                                    }
                                  : prev,
                              )
                            }
                            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/20"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs text-slate-400">Delivery notes</span>
                          <textarea
                            value={data.deliveryNotes ?? ""}
                            onChange={(e) =>
                              setData((prev) => (prev ? { ...prev, deliveryNotes: e.target.value } : prev))
                            }
                            className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:ring-1 focus:ring-white/20"
                            rows={2}
                          />
                        </label>
                      </>
                    ) : (
                      <label className="block space-y-1">
                        <span className="text-xs text-slate-400">Pickup notes</span>
                        <textarea
                          value={data.pickupNotes ?? ""}
                          onChange={(e) =>
                            setData((prev) => (prev ? { ...prev, pickupNotes: e.target.value } : prev))
                          }
                          className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:ring-1 focus:ring-white/20"
                          rows={2}
                        />
                      </label>
                    )}
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Notes / 备注</span>
                    <textarea
                      value={data.notes ?? ""}
                      onChange={(e) => setData((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                      className="w-full rounded-md border border-white/10 p-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                      rows={3}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-2 text-white py-2">
                    <span className="text-xs text-slate-400">Deposit Required</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={data.depositRequired}
                      onChange={(e) =>
                        setData((prev) => (prev ? { ...prev, depositRequired: e.target.value } : prev))
                      }
                      className="h-8 w-28 rounded-lg border border-white/10 bg-white/5 px-2 text-white text-right text-sm outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={savingHeader}
                      onClick={updateHeader}
                      className="so-action-btn"
                    >
                      {savingHeader ? "Saving..." : "Save Details"}
                    </button>
                    <button
                      type="button"
                      disabled={savingDeposit}
                      onClick={updateDepositRequired}
                      className="so-action-btn"
                    >
                      {savingDeposit ? "Saving..." : "Save Deposit"}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}

          <article className="glass-card overflow-hidden p-0">
            <div className="glass-card-content">
            <div className="border-b border-white/10 px-4 py-3">
              {mode === "edit" ? (
                <>
                <div className="relative grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_86px_120px_92px]">
                <input
                  ref={quickAddSearchRef}
                  value={quickAddQuery}
                  onChange={(e) => setQuickAddQuery(e.target.value)}
                  onFocus={() => setQuickAddOpen(quickAddCandidates.length > 0)}
                  onBlur={() => {
                    window.setTimeout(() => setQuickAddOpen(false), 120);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setQuickAddOpen(false);
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (quickAddCandidates.length === 0) return;
                      setQuickAddOpen(true);
                      setQuickAddActiveIndex((prev) => (prev + 1) % quickAddCandidates.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (quickAddCandidates.length === 0) return;
                      setQuickAddOpen(true);
                      setQuickAddActiveIndex((prev) =>
                        prev <= 0 ? quickAddCandidates.length - 1 : prev - 1,
                      );
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const selected = quickAddCandidates[quickAddActiveIndex];
                      if (!selected) return;
                      void quickAddVariant(selected, true);
                    }
                  }}
                  placeholder="Search SKU / title / size / color..."
                  className="ios-input h-9 rounded-xl px-2 text-xs text-[#111827]"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quickAddQty}
                  onChange={(e) => setQuickAddQty(e.target.value)}
                  className="ios-input h-9 rounded-xl px-2 text-right text-xs text-[#111827]"
                />
                <div className="so-panel flex h-9 items-center rounded-xl px-2 text-right text-xs text-slate-400">
                  {quickAddCandidates[quickAddActiveIndex]
                    ? `$${Number(quickAddCandidates[quickAddActiveIndex].price || 0).toFixed(2)}`
                    : "-"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const selected = quickAddCandidates[quickAddActiveIndex];
                    if (!selected) return;
                    void quickAddVariant(selected, true);
                  }}
                  className="so-action-btn justify-center px-2.5"
                >
                  + Add
                </button>
                {quickAddFlooringPlan ? (
                  <div className="col-span-full text-[10px] text-slate-500">{quickAddFlooringPlan.label}</div>
                ) : null}
                {quickAddOpen ? (
                  <div className="so-panel absolute left-0 right-0 top-10 z-20 max-h-64 overflow-y-auto rounded-xl">
                    {quickAddCandidates.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">No products found.</div>
                    ) : (
                      quickAddCandidates.map((product, index) => {
                        const isActive = index === quickAddActiveIndex;
                        const formattedName = buildProductDisplayName(
                          product.name,
                          product.generatedDescription ??
                            product.variantDescription ??
                            product.defaultDescription ??
                            "",
                        );
                        const onHand = Number(product.onHandStock ?? 0);
                        const available = Number(product.availableStock || 0);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onMouseEnter={() => setQuickAddActiveIndex(index)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              void quickAddVariant(product, true);
                            }}
                            className={`w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${
                              isActive ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                          >
                            <p className="truncate text-sm font-medium text-white">{formattedName}</p>
                            <p className="text-xs text-slate-500">
                              SKU: {product.sku || "-"} · Stock {onHand.toFixed(2)} / {available.toFixed(2)} · $
                              {Number(product.price || 0).toFixed(2)} · Unit{" "}
                              {formatUnitLabel(product.sellingUnit ?? resolveSellingUnit(product.category, product.unit))}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
                </div>
                {activeQuickAddProduct ? (
                  <div className="so-panel mt-2 rounded-xl px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700">Product Detail</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {activeQuickAddProduct.name} · SKU: {activeQuickAddProduct.sku || "-"}
                    </p>
                    {activeQuickAddDetails.length > 0 ? (
                      <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
                        {activeQuickAddDetails.map((row) => (
                          <p key={`${activeQuickAddProduct.id}-${row.label}`}>
                            <span className="text-slate-500">{row.label}:</span> {row.value}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">No detailed specs available.</p>
                    )}
                  </div>
                ) : null}
                </>
              ) : null}

              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[#111827]">Items</h2>
                  <input
                    value={itemSearchTerm}
                    onChange={(e) => setItemSearchTerm(e.target.value)}
                    placeholder="Search item / SKU / note"
                    className="ios-input h-9 w-60 rounded-xl px-2 text-xs text-[#111827]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {mode === "edit" ? (
                  <>
                <button
                  type="button"
                  onClick={() => setAllFulfillQty("ALL")}
                  className="so-action-btn px-2.5"
                >
                  Fulfill All
                </button>
                <button
                  type="button"
                  onClick={() => setAllFulfillQty("RESET")}
                  className="so-action-btn px-2.5"
                >
                  Reset Fulfillment
                </button>
                <button
                  type="button"
                  onClick={addItem}
                  className="so-action-btn px-2.5"
                >
                  <Plus className="mr-1 inline h-4 w-4" />
                  Add Item
                </button>
                  </>
                ) : null}
                </div>
              </div>
            </div>
            {["CONFIRMED", "READY", "PARTIALLY_FULFILLED"].includes(String(data.status)) ? (
              (() => {
                const reservedBoxes = getReservedFlooringBoxesFromItems(data.items);
                return reservedBoxes > 0 ? (
                  <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-200">
                    Reserved: {reservedBoxes} boxes
                  </div>
                ) : null;
              })()
            ) : null}

            <div className="max-h-[calc(100vh-360px)] overflow-auto">
              <div
                className={`sticky top-0 z-10 grid grid-cols-1 border-b border-white/10 bg-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 backdrop-blur-sm ${
                  mode === "edit"
                    ? "md:grid-cols-[minmax(0,4fr)_84px_110px_84px_120px_172px]"
                    : "md:grid-cols-[minmax(0,4fr)_140px_84px_110px_84px_120px]"
                }`}
              >
                <span>Product</span>
                {mode === "view" ? <span>SKU</span> : null}
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Discount</span>
                <span className="text-right">Total</span>
                {mode === "edit" ? <span className="text-right">Actions</span> : null}
              </div>

              {filteredItems.map((item) => {
                const draft = rowDraftsByItemId[item.id] ?? {
                  quantity: String(item.quantity ?? ""),
                  unitPrice: String(item.unitPrice ?? ""),
                  lineDiscount: String(item.lineDiscount ?? ""),
                  lineTax: "",
                  lineDescription: String(item.lineDescription ?? ""),
                  fulfillQty: String(item.fulfillQty ?? ""),
                };
                const renderVariantSku = item.variantId
                  ? variantSkuById.get(item.variantId) || item.productSku || "-"
                  : item.productSku || "-";
                const flooringSummary =
                  formatFlooringSubtitle({
                    flooringMaterial: item.product?.flooringMaterial,
                    flooringWearLayer: item.product?.flooringWearLayer,
                    flooringThicknessMm: item.product?.flooringThicknessMm,
                    flooringPlankLengthIn: item.product?.flooringPlankLengthIn,
                    flooringPlankWidthIn: item.product?.flooringPlankWidthIn,
                    flooringCoreThicknessMm: item.product?.flooringCoreThicknessMm,
                    flooringInstallation: item.product?.flooringInstallation,
                    flooringUnderlayment: item.product?.flooringUnderlayment,
                    flooringUnderlaymentType: item.product?.flooringUnderlaymentType,
                    flooringUnderlaymentMm: item.product?.flooringUnderlaymentMm,
                    flooringBoxCoverageSqft: item.product?.flooringBoxCoverageSqft,
                  }) || "";
                const displayName =
                  flooringSummary
                    ? String(item.variant?.displayName ?? item.productTitle ?? item.product?.name ?? "").trim() || "-"
                    : formatLineItemTitle({
                        productName: item.product?.name ?? null,
                        variant: {
                          title: item.productTitle,
                          sku: renderVariantSku,
                          detailText: item.lineDescription,
                        },
                      });
                const structuredSpecs = getWindowSpecs(item.lineDescription);
                const showFullSpecs = Boolean(expandedSpecsByItem[item.id]);
                const qtyNum = Number(draft.quantity || 0);
                const priceNum = Number(draft.unitPrice || 0);
                const discountNum = Number(draft.lineDiscount || 0);
                const liveLineTotal = qtyNum * priceNum - discountNum;
                const flooringPlan = getFlooringShipmentPlan(
                  qtyNum,
                  Number(item.product?.flooringBoxCoverageSqft ?? 0),
                );
                const itemSellingUnit = flooringSummary
                  ? "BOX"
                  : resolveSellingUnit(null, item.product?.unit ?? null);
                const windowSummary =
                  flooringSummary
                    ? mode === "view"
                      ? flooringPlan?.label ?? ""
                      : flooringSummary
                    : getInternalSpecLine(
                        getEffectiveSpecs(
                          {
                            frameMaterialDefault: item.product?.frameMaterialDefault,
                            slidingConfigDefault: item.product?.slidingConfigDefault,
                            glassTypeDefault: item.product?.glassTypeDefault,
                            glassCoatingDefault: item.product?.glassCoatingDefault,
                            glassThicknessMmDefault: item.product?.glassThicknessMmDefault,
                            glassFinishDefault: item.product?.glassFinishDefault,
                            screenDefault: item.product?.screenDefault,
                            openingTypeDefault: item.product?.openingTypeDefault,
                          },
                          {
                            glassTypeOverride: item.variant?.glassTypeOverride,
                            slidingConfigOverride: item.variant?.slidingConfigOverride,
                            glassCoatingOverride: item.variant?.glassCoatingOverride,
                            glassThicknessMmOverride: item.variant?.glassThicknessMmOverride,
                            glassFinishOverride: item.variant?.glassFinishOverride,
                            screenOverride: item.variant?.screenOverride,
                            openingTypeOverride: item.variant?.openingTypeOverride,
                            detailText: item.lineDescription,
                          },
                        ),
                      ) || "";
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveDrawerItemId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveDrawerItemId(item.id);
                      }
                    }}
                    className={`grid grid-cols-1 items-center border-b border-white/10 px-4 py-3 text-sm transition-colors hover:bg-white/[0.06] ${
                      mode === "edit"
                        ? "md:grid-cols-[minmax(0,4fr)_84px_110px_84px_120px_172px]"
                        : "md:grid-cols-[minmax(0,4fr)_140px_84px_110px_84px_120px]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {!item.variantId ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
                        <p className="truncate font-semibold text-white">{displayName}</p>
                      </div>
                      {windowSummary ? (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{windowSummary}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Unit: {formatUnitLabel(itemSellingUnit)}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSpecsByItem((prev) => ({ ...prev, [item.id]: !showFullSpecs }));
                          }}
                          className="text-[11px] text-slate-500 hover:text-slate-700"
                        >
                          {showFullSpecs ? "Hide Full Specifications" : "View Full Specifications"}
                        </button>
                      </div>
                      {showFullSpecs ? (
                        <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
                          {structuredSpecs.length > 0 ? (
                            structuredSpecs.map((pair) => (
                              <p key={`${item.id}-${pair.label}`}>
                                <span className="text-slate-500">{pair.label}:</span> {pair.value}
                              </p>
                            ))
                          ) : (
                            <p className="text-slate-500">No structured specifications.</p>
                          )}
                        </div>
                      ) : null}
                      {!item.variantId ? (
                        <p className="truncate text-[11px] text-rose-600">Please select a product variant.</p>
                      ) : null}
                    </div>
                    {mode === "view" ? <p className="truncate text-xs text-slate-500">SKU: {renderVariantSku}</p> : null}
                    {mode === "edit" ? (
                      <div className="space-y-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.quantity}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateRowDraft(item.id, "quantity", e.target.value)}
                          className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-right text-sm text-white outline-none hover:bg-white/10 focus:ring-1 focus:ring-white/20"
                        />
                        <p className="truncate text-[10px] text-slate-500">
                          {formatSellingUnitLabel(itemSellingUnit === "BOX" ? "BOX" : itemSellingUnit)}
                        </p>
                        {flooringPlan ? (
                          <p className="truncate text-[10px] text-slate-500">{flooringPlan.label}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="px-2 text-right text-sm text-slate-700">
                        {Number(item.quantity || 0).toFixed(2)}
                      </div>
                    )}
                    {mode === "edit" ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.unitPrice}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateRowDraft(item.id, "unitPrice", e.target.value)}
                        className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-right text-sm text-white outline-none hover:bg-white/10 focus:ring-1 focus:ring-white/20"
                      />
                    ) : (
                      <div className="px-2 text-right text-sm text-slate-700">${Number(item.unitPrice || 0).toFixed(2)}</div>
                    )}
                    {mode === "edit" ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.lineDiscount}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateRowDraft(item.id, "lineDiscount", e.target.value)}
                        className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-right text-sm text-white outline-none hover:bg-white/10 focus:ring-1 focus:ring-white/20"
                      />
                    ) : (
                      <div className="px-2 text-right text-sm text-slate-700">${Number(item.lineDiscount || 0).toFixed(2)}</div>
                    )}
                    <div className="px-2 text-right font-semibold text-white">
                      $
                      {mode === "edit"
                        ? Number.isFinite(liveLineTotal)
                          ? liveLineTotal.toFixed(2)
                          : "0.00"
                        : Number(item.lineTotal || 0).toFixed(2)}
                    </div>
                    {mode === "edit" ? (
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveDrawerItemId(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Open item details"
                        >
                          ⋯
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {filteredItems.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">No matching items.</div>
              ) : null}
            </div>

                <div className="flex justify-end border-t border-white/10 px-4 py-3">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>${Number(data.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Tax</span>
                  <span>${Number(data.tax).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-white">
                  <span>Total</span>
                  <span className="text-sm">${Number(data.total).toFixed(2)}</span>
                </div>
              </div>
            </div>
            </div>
          </article>

          {activeDrawerItem ? (
            <div className="fixed inset-0 z-40 flex">
              <button
                type="button"
                aria-label="Close item drawer"
                className="h-full flex-1 bg-slate-900/20"
                onClick={closeLineItemDrawer}
              />
              <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0F172A] shadow-2xl">
                <div className="mb-1 flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Line Item Detail</h3>
                    {isDrawerDirty ? <span className="text-xs text-amber-400">Unsaved changes</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={closeLineItemDrawer}
                    className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3">

                <section className="space-y-1">
                  {(() => {
                    const drawerFlooringSummary = formatFlooringSubtitle({
                      flooringMaterial: activeDrawerItem.product?.flooringMaterial,
                      flooringWearLayer: activeDrawerItem.product?.flooringWearLayer,
                      flooringThicknessMm: activeDrawerItem.product?.flooringThicknessMm,
                      flooringPlankLengthIn: activeDrawerItem.product?.flooringPlankLengthIn,
                      flooringPlankWidthIn: activeDrawerItem.product?.flooringPlankWidthIn,
                      flooringCoreThicknessMm: activeDrawerItem.product?.flooringCoreThicknessMm,
                      flooringInstallation: activeDrawerItem.product?.flooringInstallation,
                      flooringUnderlayment: activeDrawerItem.product?.flooringUnderlayment,
                      flooringUnderlaymentType: activeDrawerItem.product?.flooringUnderlaymentType,
                      flooringUnderlaymentMm: activeDrawerItem.product?.flooringUnderlaymentMm,
                      flooringBoxCoverageSqft: activeDrawerItem.product?.flooringBoxCoverageSqft,
                    });
                    return (
                      <>
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="text-sm font-semibold text-white">
                        {drawerFlooringSummary
                          ? String(
                              activeDrawerItem.variant?.displayName ??
                                activeDrawerItem.productTitle ??
                                activeDrawerItem.product?.name ??
                                "",
                            ).trim() || "-"
                          : formatLineItemTitle({
                              productName: activeDrawerItem.product?.name ?? null,
                              variant: {
                                title: activeDrawerItem.productTitle,
                                sku: activeDrawerItem.productSku,
                                detailText: activeDrawerItem.lineDescription,
                              },
                            })}
                  </p>
                  <p className="text-xs text-slate-500">SKU: {activeDrawerItem.productSku || "-"}</p>
                      </>
                    );
                  })()}
                </section>

                <section className="mt-4 rounded-lg border border-white/10 p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Product Detail</h4>
                  {activeDrawerDetails.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {activeDrawerDetails.map((row) => (
                        <div key={`${activeDrawerItem.id}-${row.label}`} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                          <p className="text-[11px] text-slate-500">{row.label}</p>
                          <p className="text-slate-200">{row.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No detailed specs available.</p>
                  )}
                </section>

                <section className="mt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Specifications</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {getWindowSpecs(activeDrawerItem.lineDescription).length > 0 ? (
                      getWindowSpecs(activeDrawerItem.lineDescription).map((pair) => (
                        <div key={`${activeDrawerItem.id}-${pair.label}`} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                          <p className="text-[11px] text-slate-500">{pair.label}</p>
                          <p className="text-slate-800">{pair.value}</p>
                        </div>
                      ))
                    ) : (
                      <p className="col-span-2 text-slate-500">No structured specifications.</p>
                    )}
                  </div>
                </section>

                <section className="mt-4 space-y-2">
                  <label className="block text-xs text-slate-500">
                    Line note
                    <textarea
                      value={activeDrawerDraft?.lineDescription ?? ""}
                      onChange={(e) =>
                        updateRowDraft(activeDrawerItem.id, "lineDescription", e.target.value)
                      }
                      readOnly={mode !== "edit"}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:ring-1 focus:ring-white/20 read-only:bg-white/5 read-only:text-slate-500"
                      rows={4}
                      placeholder="Optional line note"
                    />
                  </label>
                  <label className="block text-xs text-slate-500">
                    Tax (optional)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rowDraftsByItemId[activeDrawerItem.id]?.lineTax ?? ""}
                      onChange={(e) => updateRowDraft(activeDrawerItem.id, "lineTax", e.target.value)}
                      readOnly={mode !== "edit"}
                      className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-right text-sm text-white outline-none focus:ring-1 focus:ring-white/20 read-only:bg-white/5 read-only:text-slate-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => resetItemDescriptionToTemplate(activeDrawerItem.id, activeDrawerItem.variantId)}
                    disabled={!activeDrawerItem.variantId || mode !== "edit"}
                    className="ios-secondary-btn h-8 px-3 text-xs disabled:opacity-50"
                  >
                    Reset to Template
                  </button>
                </section>

                <section className="mt-4 rounded-md border border-slate-100 p-2">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Advanced</h4>
                  <label className="block text-xs text-slate-500">
                    Fulfilled Qty
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={activeDrawerDraft?.fulfillQty ?? ""}
                      onChange={(e) => updateRowDraft(activeDrawerItem.id, "fulfillQty", e.target.value)}
                      readOnly={mode !== "edit"}
                      className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-right text-sm text-white outline-none focus:ring-1 focus:ring-white/20 read-only:bg-white/5 read-only:text-slate-500"
                      title="Fulfilled quantity"
                    />
                  </label>
                  {activeDrawerItem.variantId ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Available: {Number(availableByVariant.get(activeDrawerItem.variantId) ?? 0).toFixed(2)}
                    </p>
                  ) : null}
                </section>
                </div>
                <div className="sticky bottom-0 border-t border-white/10 bg-[#0F172A] px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeLineItemDrawer}
                      className="ios-secondary-btn h-9 px-3 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveActiveDrawerItem()}
                      disabled={mode !== "edit" || !isDrawerDirty || savingDrawerItem}
                      className="ios-primary-btn h-9 px-3 text-sm disabled:opacity-60"
                    >
                      {savingDrawerItem ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          ) : null}

          <div className="border-t border-white/10 pt-6">
            <div className="mb-4 flex items-center gap-1 border-b border-white/10 pb-3">
              {[
                { id: "PAYMENTS", label: "Payments" },
                { id: "FULFILLMENT", label: "Fulfillment" },
                { id: "TICKETS", label: "Tickets" },
                { id: "ACTIVITY", label: "Activity" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setActiveBottomTab(tab.id as "PAYMENTS" | "FULFILLMENT" | "TICKETS" | "ACTIVITY")
                  }
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    activeBottomTab === tab.id
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeBottomTab === "PAYMENTS" ? (
              <article className="glass-card p-4">
                <div className="glass-card-content">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Payments</h2>
                  <button
                    type="button"
                    onClick={() => setOpenPayment(true)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10"
                  >
                    Add Payment
                  </button>
                </div>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-slate-400">
                          <th className="py-2 pr-4">Received</th>
                          <th className="py-2 pr-4">Method</th>
                          <th className="py-2 pr-4">Reference</th>
                          <th className="py-2 pr-4">Amount</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((payment) => (
                          <tr
                            key={payment.id}
                            className={`border-b border-white/10 transition hover:bg-white/[0.04] ${
                              payment.status === "VOIDED" ? "text-slate-500" : "text-white/90"
                            }`}
                          >
                            <td className="py-2 pr-4">
                              {new Date(payment.receivedAt).toLocaleDateString("en-US", {
                                timeZone: "UTC",
                              })}
                            </td>
                            <td className="py-2 pr-4">{payment.method}</td>
                            <td className="py-2 pr-4">{payment.referenceNumber || "-"}</td>
                            <td className="py-2 pr-4">${Number(payment.amount).toFixed(2)}</td>
                            <td className="py-2 pr-4">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs ${
                                  payment.status === "VOIDED"
                                    ? "border-white/10 bg-white/5 text-slate-500"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                }`}
                              >
                                {payment.status === "VOIDED" ? "Voided" : "Posted"}
                              </span>
                            </td>
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/sales-orders/${data.id}/payments/${payment.id}/receipt`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ios-secondary-btn h-8 px-2 text-xs"
                                >
                                  Print Receipt
                                </Link>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPdfPreview({
                                      title: `Payment ${payment.id.slice(0, 8)}`,
                                      src: `/api/pdf/payment/${payment.id}`,
                                    })
                                  }
                                  className="ios-secondary-btn h-8 px-2 text-xs"
                                >
                                  Preview Receipt PDF
                                </button>
                                {payment.status === "POSTED" ? (
                                  <button
                                    type="button"
                                    onClick={() => voidPayment(payment.id)}
                                    className="ios-secondary-btn h-8 px-2 text-xs"
                                  >
                                    Void
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400">Voided</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                </div>
              </article>
            ) : null}

            {activeBottomTab === "FULFILLMENT" ? (
              <article className="glass-card p-4">
                <div className="glass-card-content">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Fulfillment</h2>
                  <button
                    type="button"
                    onClick={() => setOpenFulfillment(true)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10"
                  >
                    Create Pickup / Delivery
                  </button>
                </div>
                {data.outboundQueue ? (
                  <p className="mb-2 text-xs text-slate-500">
                    In outbound queue · status {data.outboundQueue.status.toLowerCase()} · scheduled{" "}
                    {new Date(data.outboundQueue.scheduledDate).toLocaleDateString("en-US", {
                      timeZone: "UTC",
                    })}
                  </p>
                ) : null}
                {data.fulfillments.length === 0 ? (
                  <p className="text-sm text-slate-500">No fulfillment schedules yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.fulfillments.map((fulfillment) => (
                      <div
                        key={fulfillment.id}
                        className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{fulfillment.type}</span>
                          <span className="text-xs text-slate-500">
                            {new Date(fulfillment.scheduledDate).toLocaleDateString("en-US", {
                              timeZone: "UTC",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-400">
                          Status:{" "}
                          {fulfillment.status === "SCHEDULED"
                            ? "pending"
                            : fulfillment.status === "IN_PROGRESS"
                              ? "ready"
                              : fulfillment.status === "COMPLETED"
                                ? "completed"
                                : "voided"}
                          {fulfillment.address ? ` · ${fulfillment.address}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateFulfillmentStatus(fulfillment.id, "READY")}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                          >
                            Mark Ready
                          </button>
                          <button
                            type="button"
                            onClick={() => updateFulfillmentStatus(fulfillment.id, "COMPLETED")}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                          >
                            Mark Completed
                          </button>
                          <button
                            type="button"
                            onClick={() => updateFulfillmentStatus(fulfillment.id, "VOIDED")}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                          >
                            Void
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </article>
            ) : null}

            {activeBottomTab === "TICKETS" ? (
              <article className="glass-card p-4">
                <div className="glass-card-content">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Operational Tickets</h2>
                  <div className="flex items-center gap-2">
                    <select
                      value={ticketStatusFilter}
                      onChange={(e) =>
                        setTicketStatusFilter(
                          e.target.value as "ALL" | "open" | "in_progress" | "done" | "voided",
                        )
                      }
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/90 min-w-[140px]"
                    >
                      <option value="ALL">All Status</option>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                      <option value="voided">Voided</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setOpenTicket(true)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10"
                    >
                      Create Ticket
                    </button>
                  </div>
                </div>
                {filteredTickets.length === 0 ? (
                  <p className="text-sm text-slate-500">No tickets yet.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{ticket.ticketType}</span>
                          <span className="text-xs text-slate-500">
                            {ticket.scheduledAt
                              ? new Date(ticket.scheduledAt).toLocaleDateString("en-US", { timeZone: "UTC" })
                              : "-"}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-400">
                          Status: {ticket.status}
                          {ticket.fulfillmentId ? ` · Linked fulfillment` : ""}
                        </p>
                        {ticket.notes ? <p className="mt-1 text-xs text-slate-500">{ticket.notes}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateTicketStatus(ticket.id, "in_progress")}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                          >
                            In Progress
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTicketStatus(ticket.id, "done")}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                          >
                            Mark Done
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTicketStatus(ticket.id, "voided")}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
                          >
                            Void
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </article>
            ) : null}

            {activeBottomTab === "ACTIVITY" ? (
              <article className="glass-card p-4">
                <div className="glass-card-content">
                  <h2 className="text-sm font-semibold text-white">Activity</h2>
                  <p className="mt-3 text-sm text-slate-500">Activity log for this order will appear here.</p>
                </div>
              </article>
            ) : null}

          </div>
        </>
      )}

      {openPayment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
          <div className="so-modal-shell w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-white">Add Payment</h3>
            <form className="mt-3 space-y-3" onSubmit={submitPayment}>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                value={paymentForm.amount}
                onChange={(e) => {
                  setPaymentQuickHint(null);
                  setPaymentForm((p) => ({ ...p, amount: e.target.value }));
                }}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyDepositQuickFill}
                  disabled={!hasValidTotal}
                  className="ios-secondary-btn h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Collect Deposit
                </button>
                <button
                  type="button"
                  onClick={applyBalanceQuickFill}
                  disabled={!hasValidTotal}
                  className="ios-secondary-btn h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Collect Balance
                </button>
              </div>
              {paymentQuickHint ? (
                <p className="text-xs text-slate-500">{paymentQuickHint}</p>
              ) : null}
              {!hasValidTotal ? (
                <p className="text-xs text-rose-600">Order total is missing.</p>
              ) : null}
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              >
                <option value="CASH">Cash</option>
                <option value="CHECK">Check</option>
                <option value="CARD">Card</option>
                <option value="BANK">Bank</option>
                <option value="OTHER">Other</option>
              </select>
              <input
                placeholder="Reference Number"
                value={paymentForm.referenceNumber}
                onChange={(e) => setPaymentForm((p) => ({ ...p, referenceNumber: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <input
                type="datetime-local"
                value={paymentForm.receivedAt}
                onChange={(e) => setPaymentForm((p) => ({ ...p, receivedAt: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <textarea
                placeholder="Notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                className="ios-input h-auto min-h-[84px] rounded-xl p-3 text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenPayment(false);
                    setPaymentQuickHint(null);
                  }}
                  className="ios-secondary-btn h-11 flex-1 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-11 flex-1 text-sm">
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {openFulfillment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
          <div className="so-modal-shell w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-white">Create Fulfillment</h3>
            <form className="mt-3 space-y-3" onSubmit={addFulfillment}>
              <select
                value={fulfillmentForm.type}
                onChange={(e) => setFulfillmentForm((p) => ({ ...p, type: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              >
                <option value="DELIVERY">Delivery</option>
                <option value="PICKUP">Pickup</option>
              </select>
              <input
                type="date"
                value={fulfillmentForm.scheduledDate}
                onChange={(e) => setFulfillmentForm((p) => ({ ...p, scheduledDate: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <input
                placeholder="Address (for delivery)"
                value={fulfillmentForm.address}
                onChange={(e) => setFulfillmentForm((p) => ({ ...p, address: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <textarea
                placeholder="Notes"
                value={fulfillmentForm.notes}
                onChange={(e) => setFulfillmentForm((p) => ({ ...p, notes: e.target.value }))}
                className="ios-input h-auto min-h-[84px] rounded-xl p-3 text-sm"
                rows={3}
              />
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={fulfillmentForm.autoCreateTicket}
                  onChange={(e) =>
                    setFulfillmentForm((p) => ({ ...p, autoCreateTicket: e.target.checked }))
                  }
                />
                Auto-create operational ticket
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenFulfillment(false)}
                  className="ios-secondary-btn h-11 flex-1 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-11 flex-1 text-sm">
                  Send to Outbound Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {openStartFulfillmentDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
          <div className="so-modal-shell w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-white">Start Fulfillment</h3>
            <p className="mt-2 text-sm text-slate-500">
              Choose fulfillment type for this sales order.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void ensureFulfillment("DELIVERY")}
                disabled={Boolean(startingFulfillmentType)}
                className="ios-primary-btn h-11 text-sm disabled:opacity-60"
              >
                {startingFulfillmentType === "DELIVERY" ? "Creating..." : "Delivery"}
              </button>
              <button
                type="button"
                onClick={() => void ensureFulfillment("PICKUP")}
                disabled={Boolean(startingFulfillmentType)}
                className="ios-primary-btn h-11 text-sm disabled:opacity-60"
              >
                {startingFulfillmentType === "PICKUP" ? "Creating..." : "Pickup"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpenStartFulfillmentDialog(false)}
              disabled={Boolean(startingFulfillmentType)}
              className="ios-secondary-btn mt-2 h-11 w-full text-sm disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {openTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
          <div className="so-modal-shell w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-white">Create Operational Ticket</h3>
            <form className="mt-3 space-y-3" onSubmit={addTicket}>
              <select
                value={ticketForm.ticketType}
                onChange={(e) => setTicketForm((p) => ({ ...p, ticketType: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              >
                <option value="PICK">Pick</option>
                <option value="DELIVERY">Delivery</option>
                <option value="RETURN">Return</option>
              </select>
              <select
                value={ticketForm.status}
                onChange={(e) => setTicketForm((p) => ({ ...p, status: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="voided">Voided</option>
              </select>
              <select
                value={ticketForm.fulfillmentId}
                onChange={(e) => setTicketForm((p) => ({ ...p, fulfillmentId: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              >
                <option value="">No linked fulfillment</option>
                {data?.fulfillments.map((fulfillment) => (
                  <option key={fulfillment.id} value={fulfillment.id}>
                    {fulfillment.type} · {new Date(fulfillment.scheduledDate).toLocaleDateString("en-US", { timeZone: "UTC" })}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={ticketForm.scheduledAt}
                onChange={(e) => setTicketForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <textarea
                placeholder="Notes"
                value={ticketForm.notes}
                onChange={(e) => setTicketForm((p) => ({ ...p, notes: e.target.value }))}
                className="ios-input h-auto min-h-[84px] rounded-xl p-3 text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenTicket(false)}
                  className="ios-secondary-btn h-11 flex-1 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-11 flex-1 text-sm">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <PDFPreviewModal
        open={Boolean(pdfPreview)}
        title={pdfPreview?.title ?? "PDF Preview"}
        src={pdfPreview?.src ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </section>
  );
}
