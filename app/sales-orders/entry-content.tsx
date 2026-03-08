"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Search, Package, User, Truck, Save, Check, X, ShoppingCart, DollarSign, History, Printer, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/components/layout/role-provider";
import { formatLineItemTitle } from "@/lib/display";

type SalesCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxExempt: boolean;
  taxRate: number | null;
};

type Salesperson = {
  id: string;
  name: string;
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
  availableStock: string;
  unit: string;
  sellingUnit?: "BOX" | "PIECE" | "SQFT";
  flooringBoxCoverageSqft?: number | null;
  price: string;
  imageUrl?: string | null;
  category?: string | null;
};

type ProductSearchResult = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  salePrice: number;
  onHand: number;
  unit: string | null;
  reorderLevel: number;
};

type DraftItem = {
  id: string;
  productId: string;
  variantId: string;
  productSku: string;
  productTitle: string;
  productQuery: string;
  lineDescription: string;
  quantity: string;
  unitPrice: string;
  lineDiscount: string;
  internalNotes: string;
  taxable: boolean;
  isSpecialOrderLine: boolean;
  warehouseLocation: string;
};

let draftItemCounter = 0;
const emptyItem = (): DraftItem => ({
  id: `draft-item-${++draftItemCounter}`,
  productId: "",
  variantId: "",
  productSku: "",
  productTitle: "",
  productQuery: "",
  lineDescription: "",
  quantity: "1",
  unitPrice: "",
  lineDiscount: "0",
  internalNotes: "",
  taxable: true,
  isSpecialOrderLine: false,
  warehouseLocation: "",
});

type CategoryId = "all" | "flooring" | "doors" | "windows" | "mirrors" | "other";
function inferCategory(raw: string | null | undefined): CategoryId {
  const t = String(raw ?? "").toLowerCase();
  if (t.includes("floor")) return "flooring";
  if (t.includes("door")) return "doors";
  if (t.includes("window")) return "windows";
  if (t.includes("mirror")) return "mirrors";
  return "other";
}

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flooring", label: "Flooring" },
  { id: "doors", label: "Doors" },
  { id: "windows", label: "Windows" },
  { id: "mirrors", label: "Mirrors" },
  { id: "other", label: "Other" },
];

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}

const TIME_WINDOW_OPTIONS = ["", "8:00-10:00", "10:00-12:00", "1:00-3:00", "3:00-5:00"];

function NewSalesOrderPageContent({ editOrderId }: { editOrderId?: string }) {
  const { role } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [openCustomerDropdown, setOpenCustomerDropdown] = useState(false);
  const [customerDropdownHighlight, setCustomerDropdownHighlight] = useState(0);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [projectName, setProjectName] = useState("");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [docType, setDocType] = useState<"QUOTE" | "SALES_ORDER">("SALES_ORDER");
  const [specialOrder, setSpecialOrder] = useState(false);
  const [hidePrices, setHidePrices] = useState(false);
  const [depositRequired, setDepositRequired] = useState("0");
  const [orderDate, setOrderDate] = useState("");
  const [requestedDeliveryAt, setRequestedDeliveryAt] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [salespersonName, setSalespersonName] = useState("");
  const [commissionRate, setCommissionRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [warehouse, setWarehouse] = useState("");
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState("");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState<{ id: string; orderNumber: string; customer?: { name: string }; createdAt: string; total?: number }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [taxRateOverridden, setTaxRateOverridden] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [, startItemsTransition] = useTransition();
  const [quickSkuInput, setQuickSkuInput] = useState("");
  const [quickSearchResults, setQuickSearchResults] = useState<ProductSearchResult[]>([]);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");
  const [discountInputByItemId, setDiscountInputByItemId] = useState<Record<string, string>>({});
  const [activeProductPickerItemId, setActiveProductPickerItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openCustomerModal, setOpenCustomerModal] = useState(false);
  const [orderInfoModalOpen, setOrderInfoModalOpen] = useState(false);
  const [productsPanelCollapsed, setProductsPanelCollapsed] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const quickSearchRef = useRef<HTMLDivElement | null>(null);
  const productListScrollRef = useRef<HTMLDivElement | null>(null);
  const [productListScroll, setProductListScroll] = useState({ scrollTop: 0, clientHeight: 500 });
  const PRODUCT_ROW_HEIGHT_PX = 44;
  const handleProductListScroll = useCallback(() => {
    const el = productListScrollRef.current;
    if (!el) return;
    setProductListScroll({ scrollTop: el.scrollTop, clientHeight: el.clientHeight });
  }, []);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    companyName: "",
    customerType: "RESIDENTIAL",
    address: "",
    taxExempt: false,
  });
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [editOrderLoaded, setEditOrderLoaded] = useState(false);
  const initialOrderItemIdsRef = useRef<string[]>([]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );
  const customerOptions = useMemo(() => {
    if (!selectedCustomerId || selectedCustomer) return customers;
    return [
      { id: selectedCustomerId, name: "Selected Customer", phone: null, email: null, address: null, taxExempt: false, taxRate: null },
      ...customers,
    ];
  }, [customers, selectedCustomerId, selectedCustomer]);

  const filteredCustomerOptions = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customerOptions;
    return customerOptions.filter(
      (c) =>
        String(c.name ?? "").toLowerCase().includes(q) ||
        String(c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
        String(c.email ?? "").toLowerCase().includes(q),
    );
  }, [customerOptions, customerQuery]);
  const customerDropdownList = useMemo(() => {
    const list: { type: "new" } | { type: "customer"; customer: SalesCustomer }[] = [];
    list.push({ type: "new" });
    filteredCustomerOptions.forEach((c) => list.push({ type: "customer", customer: c }));
    return list;
  }, [filteredCustomerOptions]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory !== "all") {
      list = list.filter((p) => inferCategory(p.category ?? p.collection ?? p.brand ?? p.name) === selectedCategory);
    }
    const q = productSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          String(p.name ?? "").toLowerCase().includes(q) ||
          String(p.sku ?? "").toLowerCase().includes(q) ||
          String(p.brand ?? "").toLowerCase().includes(q) ||
          String(p.collection ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, selectedCategory, productSearchQuery]);

  const productListVisibleRange = useMemo(() => {
    const total = filteredProducts.length;
    if (total === 0) return { start: 0, end: 0 };
    const { scrollTop, clientHeight } = productListScroll;
    const overscan = 5;
    const start = Math.max(0, Math.floor(scrollTop / PRODUCT_ROW_HEIGHT_PX) - overscan);
    const visibleCount = Math.ceil(clientHeight / PRODUCT_ROW_HEIGHT_PX) + overscan * 2;
    const end = Math.min(total, start + visibleCount);
    return { start, end };
  }, [filteredProducts.length, productListScroll]);

  useEffect(() => {
    const el = productListScrollRef.current;
    if (!el) return;
    setProductListScroll((prev) => ({ ...prev, clientHeight: el.clientHeight }));
  }, [filteredProducts.length]);

  const loadCustomers = async (q = "") => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const url = params.toString() ? `/api/customers?${params.toString()}` : "/api/customers";
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch customers");
      const raw = payload.data ?? [];
      const mapped: SalesCustomer[] = raw.map(
        (row: { id: string; name: string; phone: string | null; email: string | null; installAddress?: string | null; billingAddress?: string | null; taxExempt?: boolean; taxRate?: number | null }) => ({
          id: row.id,
          name: row.name,
          phone: row.phone ?? null,
          email: row.email ?? null,
          address: row.installAddress ?? row.billingAddress ?? null,
          taxExempt: Boolean(row.taxExempt ?? false),
          taxRate: row.taxRate != null ? Number(row.taxRate) : null,
        }),
      );
      setCustomers(mapped);
    } catch (e) {
      throw e;
    }
  };

  const loadProducts = async (q = "") => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(
      params.toString() ? `/api/sales-orders/products?${params.toString()}` : "/api/sales-orders/products",
      { cache: "no-store", headers: { "x-user-role": role } },
    );
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch products");
    setProducts(payload.data ?? []);
  };

  const searchProducts = async (query: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(
      params.toString() ? `/api/sales-orders/products?${params.toString()}` : "/api/sales-orders/products",
      { cache: "no-store", headers: { "x-user-role": role } },
    );
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch products");
    setProducts(payload.data ?? []);
  };

  const loadSalespeople = async () => {
    const res = await fetch("/api/sales-orders/salespeople", {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load salespeople");
    setSalespeople(payload.data ?? []);
  };

  const searchLineItemsProducts = async (query: string) => {
    const normalized = String(query ?? "").trim();
    if (normalized.length < 1) {
      setQuickSearchResults([]);
      setQuickSearchOpen(false);
      return;
    }
    const params = new URLSearchParams();
    params.set("q", normalized);
    setQuickSearchLoading(true);
    try {
      const res = await fetch(`/api/products/search?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to search products");
      const rows = Array.isArray(payload.data) ? payload.data : [];
      setQuickSearchResults(rows);
      setQuickSearchOpen(true);
    } catch (e) {
      setQuickSearchResults([]);
      setQuickSearchOpen(true);
      setError(e instanceof Error ? e.message : "Failed to search products");
    } finally {
      setQuickSearchLoading(false);
    }
  };

  useEffect(() => {
    const docTypeParam = searchParams.get("docType");
    if (docTypeParam === "QUOTE" || docTypeParam === "SALES_ORDER") setDocType(docTypeParam);
  }, [searchParams]);

  useEffect(() => {
    if (editOrderId) {
      let cancelled = false;
      const load = async () => {
        try {
          const res = await fetch(`/api/sales-orders/${editOrderId}`, {
            cache: "no-store",
            headers: { "x-user-role": role },
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Failed to load order");
          if (cancelled) return;
          const data = body.data;
          if (data?.customer?.id) {
            setSelectedCustomerId(data.customer.id);
            setCustomerQuery(data.customer.name ?? "");
          }
          setProjectName(data?.projectName ?? "");
          setFulfillmentMethod(data?.fulfillmentMethod === "DELIVERY" ? "DELIVERY" : "PICKUP");
          setDeliveryAddress(data?.deliveryAddress1 ?? "");
          setDeliveryCity(data?.deliveryCity ?? "");
          setDeliveryState(data?.deliveryState ?? "");
          setDeliveryZip(data?.deliveryZip ?? "");
          setDocType(data?.docType === "QUOTE" ? "QUOTE" : "SALES_ORDER");
          setDepositRequired(String(data?.depositRequired ?? 0));
          setOrderDate(
            data?.orderDate
              ? new Date(data.orderDate).toISOString().slice(0, 10)
              : data?.createdAt
                ? new Date(data.createdAt).toISOString().slice(0, 10)
                : todayYYYYMMDD(),
          );
          setRequestedDeliveryAt(
            data?.requestedDeliveryAt
              ? new Date(data.requestedDeliveryAt).toISOString().slice(0, 10)
              : "",
          );
          setTimeWindow(
            data?.timeWindow ?? data?.fulfillments?.[0]?.timeWindow ?? "",
          );
          setSalespersonName(data?.salespersonName ?? "");
          setCommissionRate(String(data?.commissionRate ?? 0));
          setNotes(data?.notes ?? "");
          setDiscount(String(data?.discount ?? 0));
          setTaxRate(data?.taxRate != null && data?.taxRate !== "" ? String(data.taxRate) : "0");
          setTaxRateOverridden(true);
          const orderItems = data?.items ?? [];
          const existingIds: string[] = [];
          const newItems: DraftItem[] = orderItems.map((oi: { id: string; productId: string; variantId: string; productSku: string; productTitle: string; lineDescription?: string; quantity: number; unitPrice: number; lineDiscount: number }) => {
            existingIds.push(oi.id);
            return {
              ...emptyItem(),
              id: oi.id,
              productId: oi.productId ?? "",
              variantId: oi.variantId ?? "",
              productSku: oi.productSku ?? "",
              productTitle: oi.productTitle ?? "",
              lineDescription: oi.lineDescription ?? "",
              quantity: String(oi.quantity ?? 0),
              unitPrice: String(oi.unitPrice ?? 0),
              lineDiscount: String(oi.lineDiscount ?? 0),
              productQuery: oi.productTitle ?? "",
            };
          });
          initialOrderItemIdsRef.current = existingIds;
          setItems(newItems.length ? newItems : [emptyItem()]);
          setDiscountInputByItemId({});
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load order");
        } finally {
          if (!cancelled) setEditOrderLoaded(true);
        }
      };
      void load();
      return () => { cancelled = true; };
    } else {
      setEditOrderLoaded(true);
    }
  }, [editOrderId, role]);

  useEffect(() => {
    if (!editOrderId && editOrderLoaded && orderDate === "") {
      setOrderDate(todayYYYYMMDD());
    }
  }, [editOrderId, editOrderLoaded, orderDate]);

  useEffect(() => {
    Promise.all([loadCustomers(), loadProducts(), loadSalespeople()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load form data"),
    );
  }, [role]);

  useEffect(() => {
    const loadDefaultTax = async () => {
      try {
        const res = await fetch("/api/settings/company", { cache: "no-store", headers: { "x-user-role": role } });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load settings");
        const rate = Number(payload.data?.defaultTaxRate ?? 0);
        setDefaultTaxRate(Number.isFinite(rate) ? rate : 0);
        if (!taxRateOverridden) setTaxRate(String(Number.isFinite(rate) ? rate : 0));
      } catch {
        // keep defaults
      }
    };
    void loadDefaultTax();
  }, [role, taxRateOverridden]);

  useEffect(() => {
    const timer = setTimeout(() => void loadCustomers(customerQuery).catch((e) => setError(e instanceof Error ? e.message : "Failed to fetch customers")), 250);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    if (!selectedCustomerId || taxRateOverridden) return;
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    if (customer.taxExempt) {
      setTaxRate("0");
      return;
    }
    const rate = customer.taxRate ?? defaultTaxRate;
    setTaxRate(String(Number(rate || 0)));
  }, [selectedCustomerId, customers, defaultTaxRate, taxRateOverridden]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer || fulfillmentMethod !== "DELIVERY") return;
    setDeliveryAddress((prev) => prev || (String(customer.address ?? "")));
  }, [selectedCustomerId, customers, fulfillmentMethod]);

  useEffect(() => {
    const q = quickSkuInput.trim();
    if (q.length < 1) {
      setQuickSearchResults([]);
      setQuickSearchOpen(false);
      setQuickSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => void searchLineItemsProducts(q), 180);
    return () => window.clearTimeout(timer);
  }, [quickSkuInput, role]);

  useEffect(() => {
    if (openCustomerDropdown) setCustomerDropdownHighlight(0);
  }, [openCustomerDropdown, customerDropdownList.length]);

  useEffect(() => {
    if (!quickSearchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (quickSearchRef.current?.contains(e.target as Node)) return;
      setQuickSearchOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickSearchOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [quickSearchOpen]);

  // When user types in a line's product picker, search products
  useEffect(() => {
    if (!activeProductPickerItemId) return;
    const item = items.find((i) => i.id === activeProductPickerItemId);
    const q = item?.productQuery?.trim();
    if (!q) return;
    const timer = setTimeout(() => {
      searchProducts(q).catch((e) => setError(e instanceof Error ? e.message : "Failed to search products"));
    }, 200);
    return () => clearTimeout(timer);
  }, [activeProductPickerItemId, items, role]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const lineDiscount = Number(item.lineDiscount || 0);
        return sum + qty * price - lineDiscount;
      }, 0),
    [items],
  );
  const taxAmount = useMemo(() => {
    const rate = Number(taxRate || 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return ((subtotal - Number(discount || 0)) * rate) / 100;
  }, [taxRate, subtotal, discount]);
  const total = subtotal - Number(discount || 0) + Number(shipping || 0) + taxAmount;
  const availableByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) map.set(p.id, Number(p.availableStock || 0));
    return map;
  }, [products]);

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    startItemsTransition(() => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...patch };
          if (patch.variantId !== undefined) {
            const p = products.find((it) => it.id === patch.variantId);
            if (p) {
              next.productTitle = formatLineItemTitle({
                productName: p.name,
                variant: { sku: p.sku, detailText: p.generatedDescription ?? "" },
              });
              next.productSku = p.sku;
              next.lineDescription = p.generatedDescription ?? "";
              next.unitPrice = Number(p.price).toFixed(2);
            }
          }
          return next;
        }),
      );
    });
  };

  const buildDraftFromProduct = (product: SalesProduct): DraftItem => ({
    ...emptyItem(),
    productId: product.productId,
    variantId: product.id,
    productSku: product.sku,
    productTitle: formatLineItemTitle({
      productName: product.name,
      variant: { sku: product.sku, detailText: product.generatedDescription ?? "" },
    }),
    lineDescription: product.generatedDescription ?? "",
    unitPrice: Number(product.price || 0).toFixed(2),
    productQuery: `${product.name} (${product.sku})`,
  });

  const addLine = (product?: SalesProduct) => {
    const next = product ? buildDraftFromProduct(product) : emptyItem();
    startItemsTransition(() => {
      setItems((prev) => [...prev, next]);
    });
  };

  const resolveDiscountAmount = (input: string, qty: number, unitPrice: number) => {
    const raw = String(input ?? "").trim();
    if (!raw) return 0;
    const base = Math.max(0, qty) * Math.max(0, unitPrice);
    if (raw.endsWith("%")) {
      const pct = Number(raw.slice(0, -1).trim());
      if (!Number.isFinite(pct)) return 0;
      return Math.max(0, (base * pct) / 100);
    }
    const amount = Number(raw.replace(/\$/g, "").trim());
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  };

  const handleDiscountInputChange = (item: DraftItem, raw: string) => {
    setDiscountInputByItemId((prev) => ({ ...prev, [item.id]: raw }));
    const amount = resolveDiscountAmount(raw, Number(item.quantity || 0), Number(item.unitPrice || 0));
    updateItem(item.id, { lineDiscount: amount.toFixed(2) });
  };

  const applyBulkDiscount = () => {
    const raw = String(bulkDiscountPercent ?? "").trim().replace(/%/g, "");
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct <= 0) return;
    startItemsTransition(() => {
      setItems((prev) =>
        prev.map((item) => {
          if (!item.variantId) return item;
          const qty = Number(item.quantity || 0);
          const price = Number(item.unitPrice || 0);
          const amount = (qty * price * pct) / 100;
          return { ...item, lineDiscount: Math.max(0, amount).toFixed(2) };
        }),
      );
    });
  };

  const handleQuickSkuAdd = () => {
    const query = quickSkuInput.trim().toLowerCase();
    if (!query) return;
    const exact = quickSearchResults.find((r) => String(r.sku ?? "").toLowerCase() === query);
    const fuzzy =
      exact ??
      quickSearchResults.find((r) =>
        [r.sku, r.name].map((v) => String(v ?? "").toLowerCase()).join(" ").includes(query),
      );
    if (!fuzzy) {
      setError("No matching SKU/product found.");
      return;
    }
    addLine({
      id: fuzzy.id,
      productId: fuzzy.productId,
      name: fuzzy.name,
      title: fuzzy.name,
      sku: fuzzy.sku,
      generatedDescription: null,
      variantDescription: null,
      defaultDescription: null,
      brand: null,
      collection: null,
      availableStock: String(fuzzy.onHand),
      unit: fuzzy.unit ?? "pcs",
      sellingUnit: "PIECE",
      price: String(fuzzy.salePrice ?? 0),
      imageUrl: fuzzy.imageUrl,
    });
    setQuickSkuInput("");
    setQuickSearchResults([]);
    setQuickSearchOpen(false);
    setError(null);
  };

  const pickProductForItem = (itemId: string, product: SalesProduct) => {
    updateItem(itemId, {
      productId: product.productId,
      variantId: product.id,
      productSku: product.sku,
      productTitle: formatLineItemTitle({
        productName: product.name,
        variant: { sku: product.sku, detailText: product.generatedDescription ?? "" },
      }),
      lineDescription: product.generatedDescription ?? "",
      unitPrice: Number(product.price || 0).toFixed(2),
      productQuery: `${product.name} (${product.sku})`,
    });
    setDiscountInputByItemId((prev) => ({ ...prev, [itemId]: "0" }));
    setActiveProductPickerItemId(null);
  };

  const createOrder = async (confirmAfterCreate: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (!selectedCustomerId) throw new Error("Please select a customer.");
      if (fulfillmentMethod === "DELIVERY" && !String(deliveryAddress ?? "").trim())
        throw new Error("Delivery address is required when Delivery is selected.");
      if (items.some((item) => !item.variantId)) throw new Error("Please select a product variant for each line item.");
      const payload = {
        customerId: selectedCustomerId,
        docType,
        projectName,
        fulfillmentMethod,
        deliveryAddress1: fulfillmentMethod === "DELIVERY" ? String(deliveryAddress || "").trim() : null,
        deliveryCity: fulfillmentMethod === "DELIVERY" ? String(deliveryCity || "").trim() : null,
        deliveryState: fulfillmentMethod === "DELIVERY" ? String(deliveryState || "").trim() : null,
        deliveryZip: fulfillmentMethod === "DELIVERY" ? String(deliveryZip || "").trim() : null,
        specialOrder,
        hidePrices,
        depositRequired: Number(depositRequired || 0),
        salespersonName,
        commissionRate: Number(commissionRate || 0),
        notes,
        discount: Number(discount || 0),
        tax: Number(taxAmount || 0),
        taxRate: Number(taxRate || 0),
        orderDate: orderDate ? new Date(orderDate).toISOString().slice(0, 10) : todayYYYYMMDD(),
        requestedDeliveryAt: requestedDeliveryAt ? new Date(requestedDeliveryAt).toISOString().slice(0, 10) : null,
        timeWindow: timeWindow.trim() || null,
        items: items.map((item) => {
          const selected = products.find((p) => p.id === item.variantId);
          return {
            productId: item.productId || null,
            variantId: item.variantId || null,
            productSku: item.productSku || null,
            productTitle: item.productTitle || null,
            uomSnapshot: selected?.sellingUnit ?? null,
            description: item.lineDescription || null,
            lineDescription: item.lineDescription,
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            lineDiscount: Number(item.lineDiscount || 0),
          };
        }),
      };
      const createRes = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(payload),
      });
      const createPayload = await createRes.json();
      if (!createRes.ok) throw new Error(createPayload.error ?? "Failed to create sales order");
      const orderId = createPayload.data?.id as string;
      if (confirmAfterCreate) {
        await fetch(`/api/sales-orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({ status: docType === "QUOTE" ? "QUOTED" : "CONFIRMED" }),
        });
      }
      const afterStatus = confirmAfterCreate ? "confirmed" : "draft";
      router.push(`/orders/${orderId}?created=1&status=${afterStatus}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sales order");
    } finally {
      setSaving(false);
    }
  };

  const updateOrder = async (orderId: string) => {
    setSaving(true);
    setError(null);
    try {
      if (!selectedCustomerId) throw new Error("Please select a customer.");
      if (fulfillmentMethod === "DELIVERY" && !String(deliveryAddress ?? "").trim())
        throw new Error("Delivery address is required when Delivery is selected.");
      const validItems = items.filter((item) => item.variantId);
      if (validItems.length === 0) throw new Error("Add at least one line item with a product variant.");
      const headerPayload = {
        customerId: selectedCustomerId,
        docType,
        projectName,
        fulfillmentMethod,
        deliveryAddress1: fulfillmentMethod === "DELIVERY" ? String(deliveryAddress || "").trim() : null,
        deliveryCity: fulfillmentMethod === "DELIVERY" ? String(deliveryCity || "").trim() : null,
        deliveryState: fulfillmentMethod === "DELIVERY" ? String(deliveryState || "").trim() : null,
        deliveryZip: fulfillmentMethod === "DELIVERY" ? String(deliveryZip || "").trim() : null,
        specialOrder,
        hidePrices,
        depositRequired: Number(depositRequired || 0),
        salespersonName,
        commissionRate: Number(commissionRate || 0),
        notes,
        discount: Number(discount || 0),
        tax: Number(taxAmount || 0),
        taxRate: Number(taxRate || 0),
        orderDate: orderDate ? new Date(orderDate).toISOString().slice(0, 10) : null,
        requestedDeliveryAt: requestedDeliveryAt ? new Date(requestedDeliveryAt).toISOString().slice(0, 10) : null,
        timeWindow: timeWindow.trim() || null,
      };
      const patchRes = await fetch(`/api/sales-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(headerPayload),
      });
      const patchPayload = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchPayload.error ?? "Failed to update sales order");

      const existingIds = initialOrderItemIdsRef.current;
      const currentIds = validItems.map((i) => i.id);
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));
      const toUpdate = validItems.filter((i) => existingIds.includes(i.id));
      const toAdd = validItems.filter((i) => !existingIds.includes(i.id));

      for (const id of toDelete) {
        const delRes = await fetch(`/api/sales-orders/${orderId}/items/${id}`, {
          method: "DELETE",
          headers: { "x-user-role": role },
        });
        if (!delRes.ok) {
          const body = await delRes.json();
          throw new Error(body.error ?? "Failed to remove item");
        }
      }
      for (const item of toUpdate) {
        const selected = products.find((p) => p.id === item.variantId);
        const body = {
          productId: item.productId || null,
          variantId: item.variantId || null,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          lineDiscount: Number(item.lineDiscount || 0),
          lineDescription: item.lineDescription || null,
          productSku: item.productSku || null,
          productTitle: item.productTitle || null,
          uomSnapshot: selected?.sellingUnit ?? null,
        };
        const res = await fetch(`/api/sales-orders/${orderId}/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json();
          throw new Error(errBody.error ?? "Failed to update item");
        }
      }
      for (const item of toAdd) {
        const selected = products.find((p) => p.id === item.variantId);
        const body = {
          productId: item.productId || null,
          variantId: item.variantId || null,
          productSku: item.productSku || null,
          productTitle: item.productTitle || null,
          uomSnapshot: selected?.sellingUnit ?? null,
          description: item.lineDescription || null,
          lineDescription: item.lineDescription,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          lineDiscount: Number(item.lineDiscount || 0),
        };
        const res = await fetch(`/api/sales-orders/${orderId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json();
          throw new Error(errBody.error ?? "Failed to add item");
        }
      }

      router.push(`/sales-orders/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sales order");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOrder = (confirmAfterCreate: boolean) => {
    if (editOrderId) void updateOrder(editOrderId);
    else void createOrder(confirmAfterCreate);
  };

  const createCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/sales-orders/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          name: newCustomer.name,
          phone: newCustomer.phone,
          email: newCustomer.email,
          address: newCustomer.address,
          taxExempt: newCustomer.taxExempt,
          notes: [newCustomer.companyName ? `Company: ${newCustomer.companyName}` : "", `Type: ${newCustomer.customerType}`].filter(Boolean).join(" | "),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create customer");
      setOpenCustomerModal(false);
      setNewCustomer({
        name: "",
        phone: "",
        email: "",
        companyName: "",
        customerType: "RESIDENTIAL",
        address: "",
        taxExempt: false,
      });
      await loadCustomers();
      setSelectedCustomerId(payload.data.id);
      setCustomerQuery(payload.data.name ?? "");
      setTaxRateOverridden(false);
      if (newCustomer.taxExempt) setTaxRate("0");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    }
  };

  const removeItem = (id: string) => {
    startItemsTransition(() => {
      setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
    });
    setDiscountInputByItemId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const cleanProductDisplayName = (name: string) => String(name ?? "").replace(/\s*\(SKU[^)]*\)\s*/gi, "").trim();
  const formatStockBadge = (stock: number) => {
    if (stock <= 5) return { label: "Low Stock", className: "bg-rose-500/20 text-rose-300 border-rose-400/30" };
    return { label: `${Number(stock).toFixed(0)} pcs`, className: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" };
  };

  if (editOrderId && !editOrderLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Loading order...
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden so-entry-page" style={{ background: "linear-gradient(180deg, #0B0F19 0%, #0F172A 100%)" }}>
      {error && (
        <div className="shrink-0 px-6 py-2 bg-rose-500/10 border-b border-rose-400/20 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* POS Workspace — fixed top toolbar, scrollable middle, fixed bottom checkout */}
      <div className="glass-card flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="glass-card-content flex flex-col flex-1 min-h-0 overflow-hidden p-6">
          {/* 1) Fixed top toolbar */}
          <header className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 pb-4 border-b border-white/[0.08]">
            <Link href="/orders" className="text-slate-400 hover:text-white text-sm font-medium transition-colors">← Back</Link>
            <span className="text-white/20">·</span>
            <span className="font-semibold text-white">Quick Sale</span>
            <span className="rounded-md bg-amber-500/15 text-amber-400/90 px-1.5 py-0.5 text-[10px] font-medium border border-amber-400/20">Draft</span>
            <span className="text-white/20">·</span>
            <div className="relative" ref={customerDropdownRef}>
              <input
                value={customerQuery}
                onChange={(e) => { setCustomerQuery(e.target.value); setOpenCustomerDropdown(true); }}
                onFocus={() => setOpenCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setOpenCustomerDropdown(false), 150)}
                onKeyDown={(e) => {
                  if (!openCustomerDropdown || customerDropdownList.length === 0) {
                    if (e.key === "ArrowDown") setOpenCustomerDropdown(true);
                    return;
                  }
                  if (e.key === "ArrowDown") { e.preventDefault(); setCustomerDropdownHighlight((i) => (i + 1) % customerDropdownList.length); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setCustomerDropdownHighlight((i) => (i - 1 + customerDropdownList.length) % customerDropdownList.length); return; }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const item = customerDropdownList[customerDropdownHighlight];
                    if (!item) return;
                    if (item.type === "new") { setOpenCustomerModal(true); setOpenCustomerDropdown(false); return; }
                    if (item.type === "customer") {
                      const c = item.customer;
                      setSelectedCustomerId(c.id); setCustomerQuery(c.name ?? "");
                      if (c.taxExempt) setTaxRate("0"); else setTaxRate(String(Number(c.taxRate ?? defaultTaxRate)));
                      if (fulfillmentMethod === "DELIVERY") setDeliveryAddress((prev) => prev || (String(c.address ?? "")));
                      setOpenCustomerDropdown(false);
                    }
                    return;
                  }
                  if (e.key === "Escape") { setOpenCustomerDropdown(false); (e.target as HTMLInputElement).blur(); }
                }}
                placeholder="Search customer"
                className="h-8 w-[180px] px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500 text-xs outline-none focus:ring-1 focus:ring-white/20"
              />
              {openCustomerDropdown && (
                <div className="absolute z-50 left-0 top-full mt-1 w-64 max-h-56 overflow-y-auto rounded-lg border border-white/[0.08] bg-slate-900/98 backdrop-blur py-1 shadow-xl">
                  {customerDropdownList.map((item, idx) => {
                    if (item.type === "new") {
                      return (
                        <button key="new-customer" type="button" onMouseDown={(e) => { e.preventDefault(); setOpenCustomerModal(true); setOpenCustomerDropdown(false); }} onMouseEnter={() => setCustomerDropdownHighlight(idx)} className={`w-full px-3 py-2 text-left text-xs font-medium ${idx === customerDropdownHighlight ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"}`}>
                          + New Customer
                        </button>
                      );
                    }
                    const c = item.customer;
                    return (
                      <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); setSelectedCustomerId(c.id); setCustomerQuery(c.name ?? ""); if (c.taxExempt) setTaxRate("0"); else setTaxRate(String(Number(c.taxRate ?? defaultTaxRate))); if (fulfillmentMethod === "DELIVERY") setDeliveryAddress((prev) => prev || (String(c.address ?? ""))); setOpenCustomerDropdown(false); }} onMouseEnter={() => setCustomerDropdownHighlight(idx)} className={`w-full px-3 py-2 text-left text-xs truncate ${selectedCustomerId === c.id ? "bg-white/10 text-white" : idx === customerDropdownHighlight ? "bg-white/10 text-white" : "text-slate-200"}`} title={c.phone ?? undefined}>
                        <span className="block truncate">{c.name}</span>
                        {c.phone ? <span className="block truncate text-slate-500 text-[11px] mt-0.5">{c.phone}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <span className="text-white/20">·</span>
            <select value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} className="h-8 min-w-[120px] px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white text-xs outline-none focus:ring-1 focus:ring-white/20">
              <option value="">Salesperson</option>
              {salespeople.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <span className="text-white/20">·</span>
            <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="h-8 min-w-[100px] px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white text-xs outline-none focus:ring-1 focus:ring-white/20">
              <option value="">Warehouse</option>
              <option value="central">Central</option>
              <option value="north">North</option>
              <option value="south">South</option>
              <option value="east">East</option>
            </select>
            <span className="text-white/20">·</span>
            <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.04] p-0.5">
              <button type="button" onClick={() => setFulfillmentMethod("PICKUP")} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${fulfillmentMethod === "PICKUP" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>Pickup</button>
              <button type="button" onClick={() => { setFulfillmentMethod("DELIVERY"); if (selectedCustomer?.address && !deliveryAddress) setDeliveryAddress(selectedCustomer.address); }} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${fulfillmentMethod === "DELIVERY" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>Delivery</button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setOrderInfoModalOpen(true)} className="h-8 px-3 rounded-lg text-xs text-slate-400 hover:text-white border border-white/[0.08] hover:bg-white/[0.04]">Details</button>
              <button type="button" disabled={saving} onClick={() => handleSaveOrder(false)} className="h-8 px-3 rounded-lg text-xs font-medium border border-white/[0.12] text-slate-300 hover:bg-white/[0.06] disabled:opacity-50">Save Draft</button>
              <button type="button" disabled={saving} onClick={() => handleSaveOrder(true)} className="btn-primary-emerald h-8 px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-50">{saving ? "…" : "Confirm Order"}</button>
            </div>
          </header>

          {/* 2) Scrollable middle workspace: products panel (left) + cart panel (right) */}
          <div className="flex flex-1 min-h-0 gap-6 mt-4 overflow-hidden">
            {/* Products — 35% or collapsed to narrow strip */}
            {productsPanelCollapsed ? (
              <button
                type="button"
                onClick={() => setProductsPanelCollapsed(false)}
                className="shrink-0 w-14 flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06] transition-colors py-4"
                title="Expand products"
              >
                <ChevronRight className="h-5 w-5 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-400">Products</span>
              </button>
            ) : (
            <aside className="w-[35%] min-w-0 flex flex-col shrink-0 min-h-0">
              {/* ProductsPanel: limited height; Search + Categories + ProductTableHeader (fixed) + ProductTableBody (scrolls, max 420px) */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <input
                      type="text"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      placeholder="Search products..."
                      className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-slate-500 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                  <button type="button" onClick={() => setProductsPanelCollapsed(true)} className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] flex items-center justify-center" title="Collapse products">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
                {/* Collapsible Categories */}
                <div className="border-b border-white/[0.06] shrink-0">
                  <button
                    type="button"
                    onClick={() => setCategoriesExpanded((e) => !e)}
                    className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-400">Categories</span>
                    <span className="text-xs font-medium text-white truncate">
                      {CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? "All"}
                    </span>
                    {categoriesExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                  </button>
                  {categoriesExpanded && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedCategory === cat.id ? "bg-white/[0.08] text-white border border-white/[0.1]" : "text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/[0.04]"}`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col overflow-hidden min-h-0">
                  {filteredProducts.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">No products found</p>
                  ) : (
                    <>
                      {/* ProductTableHeader — sticky, does not scroll */}
                      <div className="sticky top-0 z-10 bg-white/[0.04] border-b border-white/[0.06] shrink-0">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                              <th className="text-left py-2 px-3 h-11">Product Name</th>
                              <th className="text-right py-2 px-3 w-20 h-11">Price</th>
                              <th className="text-right py-2 px-2 w-16 h-11">Stock</th>
                              <th className="text-right py-2 pr-3 w-12 h-11">Add</th>
                            </tr>
                          </thead>
                        </table>
                      </div>
                      {/* ProductTableBody — limited height, rows scroll inside; virtual list renders only visible rows */}
                      <div
                        ref={productListScrollRef}
                        className="max-h-[420px] min-h-0 overflow-y-auto"
                        onScroll={handleProductListScroll}
                      >
                        <div style={{ height: filteredProducts.length * PRODUCT_ROW_HEIGHT_PX }}>
                          <table
                            className="w-full text-sm border-collapse"
                            style={{ transform: `translateY(${productListVisibleRange.start * PRODUCT_ROW_HEIGHT_PX}px)` }}
                          >
                            <tbody>
                              {filteredProducts
                                .slice(productListVisibleRange.start, productListVisibleRange.end)
                                .map((product) => {
                                  const stock = Number(product.availableStock || 0);
                                  const displayName = cleanProductDisplayName(product.name);
                                  const unit = (product.unit || "pcs").toLowerCase();
                                  return (
                                    <tr key={product.id} className="h-11 border-b border-white/[0.04] hover:bg-white/[0.03]">
                                      <td className="py-2 px-3 min-w-0">
                                        <span className="text-slate-200 text-sm leading-tight truncate block" title={displayName}>{displayName}</span>
                                      </td>
                                      <td className="py-2 px-3 text-right text-slate-200 text-sm font-medium tabular-nums">${Number(product.price || 0).toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right">
                                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium leading-tight bg-white/[0.06] border border-white/[0.08] text-slate-400 tabular-nums">{stock} {unit}</span>
                                      </td>
                                      <td className="py-2 pr-3 text-right">
                                        <button type="button" onClick={() => addLine(product)} className="h-6 w-6 rounded-lg border border-white/[0.12] bg-white/[0.04] text-slate-400 hover:bg-emerald-600/80 hover:border-emerald-500/50 hover:text-white inline-flex items-center justify-center transition-colors" title="Add to cart">
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </aside>
            )}

            {/* CartPanel: flex column with CartBody (scrollable) + CheckoutFooter (fixed) */}
            <main className={productsPanelCollapsed ? "flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden" : "w-[65%] min-w-0 flex flex-col flex-1 min-h-0 overflow-hidden"}>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-3 border-b border-white/[0.06] flex flex-wrap items-center gap-3 shrink-0">
                  <div ref={quickSearchRef} className="relative flex-1 min-w-[160px]">
                    <input
                      value={quickSkuInput}
                      onChange={(e) => setQuickSkuInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleQuickSkuAdd())}
                      placeholder="Scan SKU or product name"
                      className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-slate-500 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    />
                      {quickSearchOpen && (
                        <div className="absolute left-0 right-0 mt-1 z-30 max-h-56 overflow-y-auto rounded-lg border border-white/[0.08] bg-slate-900/98 backdrop-blur py-1 shadow-xl">
                          {quickSearchLoading ? (
                            <p className="px-3 py-2 text-slate-500 text-xs">Searching...</p>
                          ) : quickSearchResults.length === 0 ? (
                            <p className="px-3 py-2 text-slate-500 text-xs">No products found</p>
                          ) : (
                            quickSearchResults.slice(0, 6).map((product) => {
                              const displayName = cleanProductDisplayName(product.name);
                              return (
                                <button
                                  key={product.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    addLine({
                                      id: product.id,
                                      productId: product.productId,
                                      name: product.name,
                                      title: product.name,
                                      sku: product.sku,
                                      generatedDescription: null,
                                      variantDescription: null,
                                      defaultDescription: null,
                                      brand: null,
                                      collection: null,
                                      availableStock: String(product.onHand),
                                      unit: product.unit ?? "pcs",
                                      sellingUnit: "PIECE",
                                      price: String(product.salePrice ?? 0),
                                      imageUrl: product.imageUrl,
                                    });
                                    setQuickSkuInput("");
                                    setQuickSearchResults([]);
                                    setQuickSearchOpen(false);
                                    setError(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] rounded-md text-xs"
                                >
                                  {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={displayName} className="h-8 w-8 rounded object-cover shrink-0" />
                                  ) : (
                                    <div className="h-8 w-8 rounded bg-white/[0.06] flex items-center justify-center text-slate-500 text-[10px] shrink-0">—</div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-white font-medium truncate">{displayName}</p>
                                    <p className="text-slate-500 text-[11px] font-mono truncate">{product.sku}</p>
                                  </div>
                                  <span className="text-white font-semibold text-xs tabular-nums shrink-0">${Number(product.salePrice ?? 0).toFixed(2)}</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-slate-500 text-xs whitespace-nowrap">Bulk discount</label>
                      <input type="text" value={bulkDiscountPercent} onChange={(e) => setBulkDiscountPercent(e.target.value)} placeholder="%" className="w-14 h-9 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm text-right outline-none focus:ring-1 focus:ring-white/20" />
                      <button type="button" onClick={applyBulkDiscount} className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] text-xs font-medium">Apply</button>
                    </div>
                  </div>

                {/* CartBody: only this scrolls; order notes live here */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                {items.filter((i) => i.variantId).length === 0 ? (
                  <div className="flex flex-col min-h-full">
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center flex-1">
                      <ShoppingCart className="h-9 w-9 text-slate-500 mb-3" />
                      <p className="text-white font-medium text-sm mb-1">Cart is empty</p>
                      <p className="text-slate-500 text-xs">Scan SKU or add products from the list</p>
                    </div>
                    <div className="shrink-0 p-3 border-t border-white/[0.06]">
                      <label className="block text-slate-400 text-xs font-medium mb-1.5">Order notes</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Order notes..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-slate-500 text-xs outline-none focus:ring-1 focus:ring-white/20 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-white/[0.04] border-b border-white/[0.06] z-10">
                        <tr className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          <th className="text-left py-2 px-3 w-[40%] min-w-0">Product</th>
                          <th className="text-center py-2 px-2 w-20">Qty</th>
                          <th className="text-right py-2 px-3 w-24">Price</th>
                          <th className="text-right py-2 px-3 w-24">Total</th>
                          <th className="w-9 py-2 px-2" />
                        </tr>
                      </thead>
                      <tbody>
                    {items.map((item) => {
                      if (!item.variantId) {
                        const isActive = activeProductPickerItemId === item.id;
                        return (
                          <tr key={item.id} className="border-b border-white/[0.03]">
                            <td colSpan={5} className="p-2">
                              <div className="relative">
                                <input
                                  value={item.productQuery}
                                  onChange={(e) => { updateItem(item.id, { productQuery: e.target.value }); setActiveProductPickerItemId(item.id); }}
                                  onFocus={() => setActiveProductPickerItemId(item.id)}
                                  onBlur={() => setTimeout(() => setActiveProductPickerItemId((p) => (p === item.id ? null : p)), 150)}
                                  placeholder="Search product…"
                                  className="w-full h-7 px-2 rounded-md border border-white/[0.08] bg-white/[0.04] text-white text-xs placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-white/20"
                                />
                                {isActive && products.length > 0 && (
                                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-36 overflow-y-auto rounded-md border border-white/[0.08] bg-slate-900/98 py-1 shadow-xl">
                                    <button type="button" onMouseDown={(e) => { e.preventDefault(); updateItem(item.id, { productId: "", variantId: "", productSku: "", productTitle: "", productQuery: "" }); setActiveProductPickerItemId(null); }} className="w-full px-2 py-1.5 text-left text-[11px] text-slate-500 hover:bg-white/5">Clear</button>
                                    {products.slice(0, 6).map((p) => (
                                      <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickProductForItem(item.id, p); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-white/[0.06]">
                                        <span className="flex-1 truncate text-white">{cleanProductDisplayName(p.name)}</span>
                                        <span className="text-slate-400 text-[11px] tabular-nums">${Number(p.price || 0).toFixed(2)}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[11px] text-slate-500">Select a product</span>
                                <button type="button" onClick={() => removeItem(item.id)} className="text-[11px] text-rose-400/90 hover:underline">Remove</button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.lineDiscount || 0);
                      return (
                        <tr key={item.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-1.5 px-3 min-w-0 w-[40%]">
                            <p className="text-white font-medium text-xs truncate">{item.productTitle || "—"}</p>
                            <p className="text-slate-500 text-[11px] font-mono truncate">{item.productSku}</p>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <button type="button" onClick={() => updateItem(item.id, { quantity: String(Math.max(0, Number(item.quantity || 0) - 1)) })} className="h-6 w-6 rounded-md border border-white/[0.1] text-slate-400 hover:bg-white/[0.06] text-xs">−</button>
                              <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: e.target.value })} className="w-11 h-6 rounded-md border border-white/[0.08] bg-white/[0.04] text-white text-center text-xs outline-none focus:ring-1 focus:ring-white/20" />
                              <button type="button" onClick={() => updateItem(item.id, { quantity: String(Number(item.quantity || 0) + 1) })} className="h-6 w-6 rounded-md border border-white/[0.1] text-slate-400 hover:bg-white/[0.06] text-xs">+</button>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })} className="w-full max-w-[5rem] h-6 rounded-md border border-white/[0.08] bg-white/[0.04] text-white text-right text-xs px-2 outline-none focus:ring-1 focus:ring-white/20 tabular-nums" />
                          </td>
                          <td className="py-1.5 px-3 text-right font-medium text-white tabular-nums">${lineTotal.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-center">
                            <button type="button" onClick={() => removeItem(item.id)} className="h-6 w-6 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 inline-flex items-center justify-center transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                      </tbody>
                    </table>
                    <div className="p-3 border-t border-white/[0.04]">
                      <button type="button" onClick={() => addLine()} className="w-full py-2 text-xs text-slate-500 hover:text-white hover:bg-white/[0.04] rounded-lg font-medium">+ Add line</button>
                    </div>
                  </>
                )}
                </div>
              </div>

              {/* CheckoutFooter: sibling of cart card, never scrolls */}
              <div className="shrink-0 mt-3 pt-4 border-t border-white/[0.08] bg-[#0F172A]/95 rounded-b-xl flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-6 text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-medium text-white tabular-nums">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-6 text-slate-400">
                    <span>Tax</span>
                    <span className="font-medium text-white tabular-nums">${taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-white/[0.08] gap-6">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">Total</span>
                    <span className="text-2xl font-bold text-white tabular-nums">${total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => handleSaveOrder(true)} className="btn-primary-emerald h-10 px-5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                    <Check className="h-4 w-4" /> Confirm Order
                  </button>
                  <button type="button" disabled={saving} onClick={() => handleSaveOrder(false)} className="h-10 px-4 rounded-lg border border-white/[0.12] text-slate-300 hover:bg-white/[0.06] text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                    <Save className="h-4 w-4" /> Save Draft
                  </button>
                  <button type="button" onClick={() => router.push("/orders")} className="h-10 px-4 rounded-lg border border-white/[0.08] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-sm font-medium flex items-center justify-center gap-2">
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
      <Fragment>
      {openCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="so-modal-shell w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-white tracking-tight mb-5">Quick Add Customer</h3>
            <form className="space-y-4" onSubmit={createCustomer}>
              <input
                required
                placeholder="Name"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 transition-all duration-200"
              />
              <input
                placeholder="Phone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 transition-all duration-200"
              />
              <input
                placeholder="Email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 transition-all duration-200"
              />
              <input
                placeholder="Address"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 transition-all duration-200"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={newCustomer.taxExempt}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, taxExempt: e.target.checked }))}
                  className="rounded border-white/20"
                />
                Tax Exempt
              </label>
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setOpenCustomerModal(false)}
                  className="flex-1 h-11 rounded-xl bg-white/[0.08] border border-white/20 text-white text-sm font-medium hover:bg-white/[0.14] transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-sm font-semibold shadow-lg hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Info Modal — Customer, Salesperson, Project, Pickup/Delivery, dates, deposit, notes */}
      {orderInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4" onClick={() => setOrderInfoModalOpen(false)}>
          <div className="so-modal-shell w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-white tracking-tight">Order details</h3>
              <button type="button" onClick={() => setOrderInfoModalOpen(false)} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Customer</label>
                <div className="relative">
                  <input
                    value={customerQuery}
                    onChange={(e) => { setCustomerQuery(e.target.value); setOpenCustomerDropdown(true); }}
                    onFocus={() => setOpenCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setOpenCustomerDropdown(false), 150)}
                    onKeyDown={(e) => {
                      if (!openCustomerDropdown || customerDropdownList.length === 0) {
                        if (e.key === "ArrowDown") setOpenCustomerDropdown(true);
                        return;
                      }
                      if (e.key === "ArrowDown") { e.preventDefault(); setCustomerDropdownHighlight((i) => (i + 1) % customerDropdownList.length); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setCustomerDropdownHighlight((i) => (i - 1 + customerDropdownList.length) % customerDropdownList.length); return; }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const item = customerDropdownList[customerDropdownHighlight];
                        if (!item) return;
                        if (item.type === "new") { setOpenCustomerModal(true); setOrderInfoModalOpen(false); setOpenCustomerDropdown(false); return; }
                        if (item.type === "customer") {
                          const c = item.customer;
                          setSelectedCustomerId(c.id); setCustomerQuery(c.name ?? "");
                          if (c.taxExempt) setTaxRate("0"); else setTaxRate(String(Number(c.taxRate ?? defaultTaxRate)));
                          if (fulfillmentMethod === "DELIVERY") setDeliveryAddress((prev) => prev || (String(c.address ?? "")));
                          setOpenCustomerDropdown(false);
                        }
                        return;
                      }
                      if (e.key === "Escape") { setOpenCustomerDropdown(false); (e.target as HTMLInputElement).blur(); }
                    }}
                    placeholder="Search by name or phone"
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30"
                  />
                  {openCustomerDropdown && (
                    <div className="absolute z-20 mt-1 left-0 right-0 max-h-56 overflow-y-auto rounded-xl border border-white/[0.10] bg-slate-900/98 backdrop-blur-xl py-1 shadow-xl">
                      {customerDropdownList.map((item, idx) => {
                        if (item.type === "new") {
                          return (
                            <button key="new-customer" type="button" onMouseDown={(e) => { e.preventDefault(); setOpenCustomerModal(true); setOrderInfoModalOpen(false); setOpenCustomerDropdown(false); }} onMouseEnter={() => setCustomerDropdownHighlight(idx)} className={`w-full px-3 py-2.5 text-left text-sm font-medium ${idx === customerDropdownHighlight ? "bg-white/[0.10] text-white" : "text-slate-300 hover:bg-white/[0.06]"}`}>
                              + New Customer
                            </button>
                          );
                        }
                        const c = item.customer;
                        return (
                          <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); setSelectedCustomerId(c.id); setCustomerQuery(c.name ?? ""); if (c.taxExempt) setTaxRate("0"); else setTaxRate(String(Number(c.taxRate ?? defaultTaxRate))); if (fulfillmentMethod === "DELIVERY") setDeliveryAddress((prev) => prev || (String(c.address ?? ""))); setOpenCustomerDropdown(false); }} onMouseEnter={() => setCustomerDropdownHighlight(idx)} className={`w-full px-3 py-2.5 text-left text-sm ${selectedCustomerId === c.id ? "bg-white/[0.10] text-slate-100" : idx === customerDropdownHighlight ? "bg-white/[0.10] text-white" : "text-white"}`}>
                            <span className="block font-medium truncate">{c.name}</span>
                            {c.phone ? <span className="block text-slate-400 text-xs mt-0.5 truncate">{c.phone}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Salesperson</label>
                <select value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30">
                  <option value="">Select salesperson</option>
                  {salespeople.map((s) => (<option key={s.id} value={s.name}>{s.name}</option>))}
                </select>
              </div>
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Warehouse</label>
                <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30">
                  <option value="">—</option>
                  <option value="central">Central</option>
                  <option value="north">North</option>
                  <option value="south">South</option>
                  <option value="east">East</option>
                </select>
              </div>
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Project Name</label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Optional" className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
              </div>
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Pickup / Delivery</label>
                <div className="flex rounded-xl border border-white/[0.08] p-1.5 bg-white/[0.04]">
                  <button type="button" onClick={() => setFulfillmentMethod("PICKUP")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${fulfillmentMethod === "PICKUP" ? "bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-lg shadow-slate-500/20" : "text-slate-300 hover:text-white hover:bg-white/[0.06]"}`}><Package className="h-3.5 w-3.5" /> Pickup</button>
                  <button type="button" onClick={() => { setFulfillmentMethod("DELIVERY"); if (selectedCustomer?.address && !deliveryAddress) setDeliveryAddress(selectedCustomer.address); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${fulfillmentMethod === "DELIVERY" ? "bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-lg shadow-slate-500/20" : "text-slate-300 hover:text-white hover:bg-white/[0.06]"}`}><Truck className="h-3.5 w-3.5" /> Delivery</button>
                </div>
              </div>
              {fulfillmentMethod === "DELIVERY" && (
                <div className="space-y-2">
                  <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block">Delivery Address</label>
                  <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street address" className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
                  <div className="grid grid-cols-3 gap-2">
                    <input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} placeholder="City" className="h-9 px-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-xs outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
                    <input value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} placeholder="State" className="h-9 px-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-xs outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
                    <input value={deliveryZip} onChange={(e) => setDeliveryZip(e.target.value)} placeholder="Zip" className="h-9 px-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-xs outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 space-y-3">
                <p className="so-entry-text-secondary text-[11px] font-semibold uppercase tracking-wider">Schedule</p>
                <div>
                  <label className="so-entry-text-secondary text-[11px] uppercase tracking-wider font-medium block mb-1">Order Date</label>
                  <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
                </div>
                <div>
                  <label className="so-entry-text-secondary text-[11px] uppercase tracking-wider font-medium block mb-1">{fulfillmentMethod === "PICKUP" ? "Pickup Date" : "Delivery Date"}</label>
                  <input type="date" value={requestedDeliveryAt} onChange={(e) => setRequestedDeliveryAt(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
                </div>
                <div>
                  <label className="so-entry-text-secondary text-[11px] uppercase tracking-wider font-medium block mb-1">Time Window</label>
                  <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30">
                    {TIME_WINDOW_OPTIONS.map((opt) => (<option key={opt || "none"} value={opt} className="bg-slate-800 text-white">{opt || "—"}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Deposit ($)</label>
                <input type="number" min="0" step="0.01" value={depositRequired} onChange={(e) => setDepositRequired(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30" />
              </div>
              <div>
                <label className="so-entry-text-secondary text-xs uppercase tracking-[0.12em] font-semibold block mb-2">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order notes..." rows={3} className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.10] text-white placeholder:text-white/40 text-sm outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-white/[0.08] shrink-0">
              <button type="button" onClick={() => setOrderInfoModalOpen(false)} className="w-full h-11 rounded-xl bg-white/[0.08] border border-white/20 text-white text-sm font-medium hover:bg-white/[0.14] transition-all duration-200">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Order History Modal */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4" onClick={() => setHistoryModalOpen(false)}>
          <div className="so-modal-shell w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white tracking-tight">Order History</h3>
              <button type="button" onClick={() => setHistoryModalOpen(false)} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 flex-1">
              {loadingHistory ? (
                <p className="text-slate-400 text-sm">Loading...</p>
              ) : recentOrders.length === 0 ? (
                <p className="text-slate-400 text-sm">No recent orders.</p>
              ) : (
                <ul className="space-y-2">
                  {recentOrders.map((order) => (
                    <li key={order.id} className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-white/[0.05] border border-white/[0.08]">
                      <div>
                        <p className="font-medium text-white">{order.orderNumber}</p>
                        <p className="text-xs text-slate-400">{order.customer?.name ?? "—"} · {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/sales-orders/${order.id}`, { cache: "no-store", headers: { "x-user-role": role } });
                            const body = await res.json();
                            if (!res.ok) throw new Error(body.error ?? "Failed to load order");
                            const data = body.data;
                            if (data?.customer?.id) {
                              setSelectedCustomerId(data.customer.id);
                              setCustomerQuery(data.customer.name ?? "");
                            }
                            const orderItems = data?.items ?? [];
                            const newItems: DraftItem[] = orderItems.map((oi: { productId: string; variantId: string; productSku: string; productTitle: string; lineDescription?: string; quantity: number; unitPrice: number; lineDiscount: number }) => ({
                              ...emptyItem(),
                              productId: oi.productId ?? "",
                              variantId: oi.variantId ?? "",
                              productSku: oi.productSku ?? "",
                              productTitle: oi.productTitle ?? "",
                              lineDescription: oi.lineDescription ?? "",
                              quantity: String(oi.quantity ?? 0),
                              unitPrice: String(oi.unitPrice ?? 0),
                              lineDiscount: String(oi.lineDiscount ?? 0),
                              productQuery: oi.productTitle ?? "",
                            }));
                            setItems(newItems);
                            setDiscountInputByItemId({});
                            setHistoryModalOpen(false);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to copy order");
                          }
                        }}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-500/20 text-slate-200 border border-slate-400/30 hover:bg-slate-500/30 transition-all"
                      >
                        Copy to cart
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print Preview Modal */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4" onClick={() => setPrintModalOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-white/[0.1] bg-slate-900/95 backdrop-blur-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white tracking-tight">Print Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("print-preview-content");
                    if (!el) { setPrintModalOpen(false); return; }
                    const styles = "table { width:100%; border-collapse:collapse; } th, td { padding:6px 8px; text-align:left; border-bottom:1px solid #ccc; } th { font-weight:600; } .text-right { text-align:right; }";
                    const html = `<!DOCTYPE html><html><head><title>Sales Order</title><style>${styles}</style></head><body style="font-family:sans-serif;padding:24px;color:#111;">${el.innerHTML.replace(/text-white|text-slate-400|bg-white\/\[0\.03\]|border-white\/\[0\.08\]|rounded-xl|rounded-lg/g, "").replace(/text-slate-200|text-slate-400/g, "").replace(/className="[^"]*"/g, "").replace(/class="[^"]*"/g, "")}` + "</body></html>";
                    const pr = window.open("", "_blank");
                    if (pr) {
                      pr.document.write(html);
                      pr.document.close();
                      pr.print();
                      pr.close();
                    }
                    setPrintModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-slate-600 to-slate-700 text-white hover:from-slate-500 hover:to-slate-600 transition-all"
                >
                  <Printer className="h-4 w-4 inline mr-2" />
                  Print
                </button>
                <button type="button" onClick={() => setPrintModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div id="print-preview-content" className="overflow-y-auto p-6 text-sm text-white bg-white/[0.03] m-4 rounded-xl border border-white/[0.08]">
              <p className="font-bold text-lg mb-2">Sales Order — Draft</p>
              <p><strong>Customer:</strong> {(selectedCustomer?.name ?? customerQuery) || "—"}</p>
              {fulfillmentMethod === "DELIVERY" && deliveryAddress && <p><strong>Delivery:</strong> {[deliveryAddress, deliveryCity, deliveryState, deliveryZip].filter(Boolean).join(", ")}</p>}
              <table className="w-full mt-4 border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-2">Product</th>
                    <th className="text-right py-2">Qty</th>
                    <th className="text-right py-2">Price</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter((i) => i.variantId).map((item) => {
                    const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.lineDiscount || 0);
                    return (
                      <tr key={item.id} className="border-b border-white/10">
                        <td className="py-2">{item.productTitle || item.productSku}</td>
                        <td className="text-right py-2">{item.quantity}</td>
                        <td className="text-right py-2">${Number(item.unitPrice || 0).toFixed(2)}</td>
                        <td className="text-right py-2">${lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4 space-y-1 text-right">
                <p>Subtotal: ${subtotal.toFixed(2)}</p>
                <p>Discount: ${Number(discount || 0).toFixed(2)}</p>
                <p>Shipping: ${Number(shipping || 0).toFixed(2)}</p>
                <p>Tax: ${taxAmount.toFixed(2)}</p>
                <p className="font-bold text-base pt-2">Total: ${total.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      </Fragment>
    </div>
  );
}

export { NewSalesOrderPageContent as SalesOrderEntryContent };
