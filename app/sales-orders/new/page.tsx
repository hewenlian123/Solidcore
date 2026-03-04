"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/components/layout/role-provider";
import { formatLineItemTitle, formatOptionalLineNote } from "@/lib/display";
import { formatBoxesSqftSummary, formatSellingUnitLabel } from "@/lib/selling-unit";

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

const emptyItem = () => ({
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

function NewSalesOrderPageContent() {
  const { role } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [openCustomerDropdown, setOpenCustomerDropdown] = useState(false);
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
  const [salespersonName, setSalespersonName] = useState("");
  const [commissionRate, setCommissionRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [taxRateOverridden, setTaxRateOverridden] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [quickSkuInput, setQuickSkuInput] = useState("");
  const [quickSearchResults, setQuickSearchResults] = useState<ProductSearchResult[]>([]);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [discountInputByItemId, setDiscountInputByItemId] = useState<Record<string, string>>({});
  const [activeProductPickerItemId, setActiveProductPickerItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openCustomerModal, setOpenCustomerModal] = useState(false);
  const quickSearchRef = useRef<HTMLDivElement | null>(null);
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
  const selectedCustomer = useMemo(
    () => customers.find((row) => row.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );
  const customerOptions = useMemo(() => {
    if (!selectedCustomerId || selectedCustomer) return customers;
    return [
      {
        id: selectedCustomerId,
        name: "Selected Customer",
        phone: null,
        email: null,
        address: null,
        taxExempt: false,
        taxRate: null,
      },
      ...customers,
    ];
  }, [customers, selectedCustomerId, selectedCustomer]);
  const cleanProductDisplayName = (name: string) => String(name ?? "").replace(/\s*\(SKU[^)]*\)\s*/gi, "").trim();
  const highlightMatch = (text: string, query: string) => {
    const base = String(text ?? "");
    const q = String(query ?? "").trim();
    if (!q) return base;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "ig");
    const parts = base.split(regex);
    const qLower = q.toLowerCase();
    return parts.map((part, index) =>
      part.toLowerCase() === qLower ? (
        <span key={`${part}-${index}`} className="rounded bg-amber-100 px-0.5 text-slate-900">
          {part}
        </span>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  };
  const formatStockBadge = (stock: number) => {
    if (stock <= 5) return { label: "Low Stock", className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" };
    return {
      label: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(stock)} pcs`,
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    };
  };

  const loadCustomers = async (q = "") => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/sales-orders/customers?${params.toString()}`, {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch customers");
    setCustomers(payload.data ?? []);
  };

  const loadProducts = async (q = "") => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const query = params.toString();
    const targetRes = await fetch(
      query ? `/api/sales-orders/products?${query}` : "/api/sales-orders/products",
      {
        cache: "no-store",
        headers: { "x-user-role": role },
      },
    );
    const payload = await targetRes.json();
    if (!targetRes.ok) throw new Error(payload.error ?? "Failed to fetch products");
    setProducts(payload.data ?? []);
  };

  const loadSalespeople = async () => {
    const res = await fetch("/api/sales-orders/salespeople", {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch salespeople");
    setSalespeople(payload.data ?? []);
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
    if (docTypeParam === "QUOTE" || docTypeParam === "SALES_ORDER") {
      setDocType(docTypeParam);
    }
  }, [searchParams]);

  useEffect(() => {
    Promise.all([loadCustomers(), loadProducts(), loadSalespeople()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load form data"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    const loadDefaultTax = async () => {
      try {
        const res = await fetch("/api/settings/company", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load settings");
        const rate = Number(payload.data?.defaultTaxRate ?? 0);
        setDefaultTaxRate(Number.isFinite(rate) ? rate : 0);
        if (!taxRateOverridden) setTaxRate(String(Number.isFinite(rate) ? rate : 0));
      } catch {
        // Keep defaults when settings are unavailable.
      }
    };
    void loadDefaultTax();
  }, [role, taxRateOverridden]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(customerQuery).catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to fetch customers"),
      );
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQuery]);

  useEffect(() => {
    if (!selectedCustomerId || taxRateOverridden) return;
    const customer = customers.find((row) => row.id === selectedCustomerId);
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
    const customer = customers.find((row) => row.id === selectedCustomerId);
    if (!customer) return;
    if (fulfillmentMethod === "DELIVERY") {
      setDeliveryAddress((prev) => prev || String(customer.address ?? ""));
    }
  }, [selectedCustomerId, customers, fulfillmentMethod]);

  useEffect(() => {
    const q = quickSkuInput.trim();
    if (q.length < 1) {
      setQuickSearchResults([]);
      setQuickSearchOpen(false);
      setQuickSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchLineItemsProducts(q);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [quickSkuInput, role]);

  useEffect(() => {
    if (selectedCustomerId) return;
    const walkIn = customers.find((row) => /walk[\s-]?in/i.test(String(row.name ?? "")));
    if (walkIn) {
      setSelectedCustomerId(walkIn.id);
      setCustomerQuery(walkIn.name);
    }
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    if (!quickSearchOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!quickSearchRef.current) return;
      if (quickSearchRef.current.contains(event.target as Node)) return;
      setQuickSearchOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setQuickSearchOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [quickSearchOpen]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const lineDiscount = Number(item.lineDiscount || 0);
        return sum + (qty * price - lineDiscount);
      }, 0),
    [items],
  );
  const taxAmount = useMemo(() => {
    const rate = Number(taxRate || 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return ((subtotal - Number(discount || 0)) * rate) / 100;
  }, [taxRate, subtotal, discount]);
  const total = subtotal - Number(discount || 0) + taxAmount;
  const balance = total;
  const availableByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      map.set(product.id, Number(product.availableStock || 0));
    }
    return map;
  }, [products]);

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.variantId !== undefined) {
          const p = products.find((it) => it.id === patch.variantId);
          if (p) {
            next.productTitle = formatLineItemTitle({
              productName: p.name,
              variant: {
                sku: p.sku,
                detailText: p.generatedDescription ?? "",
              },
            });
            next.productSku = p.sku;
            next.lineDescription = p.generatedDescription ?? "";
            next.unitPrice = Number(p.price).toFixed(2);
          }
        }
        return next;
      }),
    );
  };

  const buildDraftFromProduct = (product: SalesProduct): DraftItem => ({
    ...emptyItem(),
    productId: product.productId,
    variantId: product.id,
    productSku: product.sku,
    productTitle: formatLineItemTitle({
      productName: product.name,
      variant: {
        sku: product.sku,
        detailText: product.generatedDescription ?? "",
      },
    }),
    lineDescription: product.generatedDescription ?? "",
    unitPrice: Number(product.price || 0).toFixed(2),
    productQuery: `${product.name} (${product.sku})`,
  });

  const addLine = (product?: SalesProduct) => {
    const next = product ? buildDraftFromProduct(product) : emptyItem();
    setItems((prev) => [...prev, next]);
    setExpandedItemId(next.id);
  };

  const resolveDiscountAmount = (input: string, qty: number, unitPrice: number) => {
    const normalized = String(input ?? "").trim();
    if (!normalized) return 0;
    const base = Math.max(0, qty) * Math.max(0, unitPrice);
    if (normalized.endsWith("%")) {
      const pct = Number(normalized.slice(0, -1).trim());
      if (!Number.isFinite(pct)) return 0;
      return Math.max(0, (base * pct) / 100);
    }
    const amount = Number(normalized.replace(/\$/g, "").trim());
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  };

  const handleDiscountInputChange = (item: DraftItem, raw: string) => {
    setDiscountInputByItemId((prev) => ({ ...prev, [item.id]: raw }));
    const qty = Number(item.quantity || 0);
    const price = Number(item.unitPrice || 0);
    const amount = resolveDiscountAmount(raw, qty, price);
    updateItem(item.id, { lineDiscount: amount.toFixed(2) });
  };

  const handleQuickSkuAdd = () => {
    const query = quickSkuInput.trim().toLowerCase();
    if (!query) return;
    const exact = quickSearchResults.find((row) => String(row.sku ?? "").trim().toLowerCase() === query);
    const fuzzy =
      exact ??
      quickSearchResults.find((row) =>
        [row.sku, row.name]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ")
          .includes(query),
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
        variant: {
          sku: product.sku,
          detailText: product.generatedDescription ?? "",
        },
      }),
      lineDescription: product.generatedDescription ?? "",
      unitPrice: Number(product.price || 0).toFixed(2),
      productQuery: `${product.name} (${product.sku})`,
    });
    setDiscountInputByItemId((prev) => ({ ...prev, [itemId]: "0" }));
    setActiveProductPickerItemId(null);
  };

  const resetItemDescriptionToTemplate = (itemId: string, variantId: string) => {
    const p = products.find((it) => it.id === variantId);
    if (!p) return;
    updateItem(itemId, { lineDescription: p.generatedDescription ?? "" });
  };

  const createOrder = async (confirmAfterCreate: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (!selectedCustomerId) {
        throw new Error("Please select a customer.");
      }
      if (fulfillmentMethod === "DELIVERY" && !String(deliveryAddress ?? "").trim()) {
        throw new Error("Delivery address is required when Delivery is selected.");
      }
      if (items.some((item) => !item.variantId)) {
        throw new Error("Please select a product variant for each line item.");
      }
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
        items: items.map((item) => {
          const selected = products.find((product) => product.id === item.variantId);
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
      if (!createRes.ok) {
        throw new Error(createPayload.error ?? "Failed to create sales order");
      }
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

  const createCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
          notes: [newCustomer.companyName ? `Company: ${newCustomer.companyName}` : "", `Type: ${newCustomer.customerType}`]
            .filter(Boolean)
            .join(" | "),
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
      if (newCustomer.taxExempt) {
        setTaxRate("0");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    }
  };

  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-20 border-b border-white/70 bg-[rgba(255,255,255,0.85)] backdrop-blur-[14px]">
        <div className="mx-auto flex h-[68px] w-full max-w-[1100px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/orders" className="text-sm text-slate-600 hover:text-slate-900">
              ← Back
            </Link>
            <h1 className="text-lg font-semibold text-slate-900">New Sales Order</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Draft</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/orders")}
              className="px-2 text-sm text-slate-500 hover:text-rose-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => createOrder(false)}
              className="ios-secondary-btn h-9 px-3 text-sm disabled:opacity-60"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => createOrder(true)}
              className="ios-primary-btn h-9 px-3 text-sm disabled:opacity-60"
            >
              {saving ? "Saving..." : "✓ Confirm Order"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto max-w-[1100px] rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mx-auto max-w-[1100px] space-y-4">
        <div className="linear-card space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</span>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setOpenCustomerDropdown(true);
                    }}
                    onFocus={() => setOpenCustomerDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setOpenCustomerDropdown(false), 120);
                    }}
                    className="ios-input h-9 w-full px-3 text-sm"
                    placeholder="Search customer"
                  />
                  {openCustomerDropdown ? (
                    <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md">
                      {customerOptions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">No customers found.</div>
                      ) : (
                        customerOptions.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCustomerId(customer.id);
                              setCustomerQuery(customer.name);
                              if (customer.taxExempt) {
                                setTaxRate("0");
                                setTaxRateOverridden(false);
                              } else {
                                setTaxRate(String(Number(customer.taxRate ?? defaultTaxRate)));
                                setTaxRateOverridden(false);
                              }
                              if (fulfillmentMethod === "DELIVERY") {
                                setDeliveryAddress((prev) => prev || String(customer.address ?? ""));
                              }
                              setOpenCustomerDropdown(false);
                            }}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                              selectedCustomerId === customer.id ? "bg-slate-100" : ""
                            }`}
                          >
                            {customer.name}
                            {customer.phone ? ` (${customer.phone})` : ""}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={() => setOpenCustomerModal(true)} className="ios-secondary-btn h-9 px-3 text-sm">
                  Quick Add +
                </button>
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Salesperson</span>
              <select
                value={salespersonName}
                onChange={(e) => setSalespersonName(e.target.value)}
                className="ios-input h-9 w-full bg-white px-3 text-sm"
              >
                <option value="">Select salesperson</option>
                {salespeople.map((user) => (
                  <option key={user.id} value={user.name}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project Name</span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="ios-input h-9 w-full px-3 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery/Pickup</span>
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setFulfillmentMethod("PICKUP")}
                  className={`h-8 rounded-lg px-4 text-sm ${fulfillmentMethod === "PICKUP" ? "bg-slate-900 text-white" : "text-slate-600"}`}
                >
                  Pickup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFulfillmentMethod("DELIVERY");
                    const selected = customers.find((row) => row.id === selectedCustomerId);
                    if (selected && !String(deliveryAddress ?? "").trim()) {
                      setDeliveryAddress(String(selected.address ?? ""));
                    }
                  }}
                  className={`h-8 rounded-lg px-4 text-sm ${fulfillmentMethod === "DELIVERY" ? "bg-slate-900 text-white" : "text-slate-600"}`}
                >
                  Delivery
                </button>
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deposit Required ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositRequired}
                onChange={(e) => setDepositRequired(e.target.value)}
                className="ios-input h-9 w-full px-3 text-sm"
              />
            </label>
          </div>

          {fulfillmentMethod === "DELIVERY" ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Delivery Address</span>
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Auto-filled from customer address"
                  className="ios-input h-9 w-full px-3 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">City</span>
                <input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} className="ios-input h-9 w-full px-3 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">State</span>
                <input value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} className="ios-input h-9 w-full px-3 text-sm" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">Zip Code</span>
                <input value={deliveryZip} onChange={(e) => setDeliveryZip(e.target.value)} className="ios-input h-9 w-full px-3 text-sm" />
              </label>
            </div>
          ) : null}
        </div>

        <div className="linear-card space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Line Items</h2>
            <button type="button" onClick={() => addLine()} className="ios-secondary-btn h-9 px-3 text-sm">
              <Plus className="h-4 w-4" />
              Add Line
            </button>
          </div>
          <div ref={quickSearchRef} className="relative">
            <input
              value={quickSkuInput}
              onChange={(e) => {
                setQuickSkuInput(e.target.value);
              }}
              onFocus={() => {
                if (quickSkuInput.trim().length >= 1) setQuickSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleQuickSkuAdd();
                }
              }}
              placeholder="Search by SKU, product name..."
              className="ios-input h-9 w-full px-3 text-sm"
            />
            {quickSearchOpen ? (
              <div className="absolute left-0 right-0 top-10 z-30 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Products</p>
                {quickSearchLoading ? (
                  <div className="px-3 py-2 text-xs text-slate-500">Searching...</div>
                ) : quickSearchResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No products found</div>
                ) : (
                  quickSearchResults.slice(0, 6).map((product) => {
                    const available = Number(product.onHand ?? 0);
                    const isLowStock = available <= Number(product.reorderLevel ?? 0);
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
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                      >
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={displayName || "Product"}
                            className="h-9 w-9 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                            IMG
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {highlightMatch(displayName || product.name, quickSkuInput)}
                          </p>
                          <p className="truncate font-mono text-[11px] text-slate-500">{product.sku || "-"}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                            isLowStock
                              ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                              : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          }`}
                        >
                          {isLowStock
                            ? "Low Stock"
                            : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(available)} ${String(product.unit ?? "pcs").trim() || "pcs"}`}
                        </span>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          ${Number(product.salePrice || 0).toFixed(2)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-semibold">Image</th>
                  <th className="px-3 py-2 font-semibold">Product</th>
                  <th className="px-2 py-2 font-semibold">SKU</th>
                  <th className="px-2 py-2 text-right font-semibold">QTY</th>
                  <th className="px-2 py-2 text-right font-semibold">Unit Price</th>
                  <th className="px-2 py-2 text-right font-semibold">Discount</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                  <th className="px-2 py-2 text-right font-semibold">Remove</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const selectedProduct = item.variantId
                    ? products.find((product) => product.id === item.variantId) ?? null
                    : null;
                  const qtyLabel = formatSellingUnitLabel(selectedProduct?.sellingUnit ?? "PIECE");
                  const availableQty = item.variantId ? Number(availableByVariant.get(item.variantId) ?? 0) : null;
                  const lineTotalValue =
                    Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.lineDiscount || 0);
                  const discountInput = discountInputByItemId[item.id] ?? String(item.lineDiscount ?? "0");
                  return (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                          IMG
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative min-w-[260px]">
                          <input
                            value={item.productQuery}
                            onFocus={() => setActiveProductPickerItemId(item.id)}
                            onChange={(e) => {
                              const query = e.target.value;
                              updateItem(item.id, { productQuery: query });
                              setActiveProductPickerItemId(item.id);
                              void searchProducts(query).catch((err) =>
                                setError(err instanceof Error ? err.message : "Failed to search products"),
                              );
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setActiveProductPickerItemId((prev) => (prev === item.id ? null : prev));
                              }, 120);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const query = String(item.productQuery ?? "").trim().toLowerCase();
                                if (!query) return;
                                const match =
                                  products.find((row) => String(row.sku ?? "").toLowerCase() === query) ??
                                  products.find((row) =>
                                    [row.sku, row.name, row.title, row.brand, row.collection]
                                      .map((value) => String(value ?? "").toLowerCase())
                                      .join(" ")
                                      .includes(query),
                                  );
                                if (match) pickProductForItem(item.id, match);
                              }
                            }}
                            placeholder="Search by SKU / title / brand / collection"
                            className="ios-input h-9 w-full px-2 text-sm"
                          />
                          <p className="mt-1 truncate text-xs text-slate-700">{item.productTitle || "No product selected"}</p>
                          <p className="truncate text-[11px] text-slate-500">{item.productSku || "-"}</p>
                          {activeProductPickerItemId === item.id ? (
                            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md">
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  updateItem(item.id, {
                                    productId: "",
                                    variantId: "",
                                    productSku: "",
                                    productTitle: "",
                                  });
                                  setActiveProductPickerItemId(null);
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
                              >
                                Manual item
                              </button>
                              {products.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-500">No products found</div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Products</p>
                                  {products.slice(0, 6).map((product) => {
                                    const available = Number(product.availableStock || 0);
                                    const stockBadge = formatStockBadge(available);
                                    const displayName = cleanProductDisplayName(product.name);
                                    return (
                                      <button
                                        key={product.id}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          pickProductForItem(item.id, product);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                                      >
                                        {product.imageUrl ? (
                                          <img
                                            src={product.imageUrl}
                                            alt={displayName || "Product"}
                                            className="h-9 w-9 shrink-0 rounded object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                                            IMG
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm font-semibold text-slate-900">
                                            {highlightMatch(displayName || product.name, item.productQuery)}
                                          </p>
                                          <p className="truncate font-mono text-[11px] text-slate-500">{product.sku || "-"}</p>
                                        </div>
                                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stockBadge.className}`}>
                                          {stockBadge.label}
                                        </span>
                                        <span className="font-mono text-sm font-bold text-slate-900">
                                          ${Number(product.price || 0).toFixed(2)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-mono text-xs text-slate-700">{item.productSku || "-"}</p>
                        <p className="text-[11px] text-slate-500">{availableQty !== null ? `On-hand ${availableQty.toFixed(2)}` : "-"}</p>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { quantity: String(Math.max(0, Number(item.quantity || 0) - 1)) })}
                            className="h-8 w-8 rounded-md border border-slate-200 text-xs text-slate-600"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                            className="ios-input h-8 w-20 px-2 text-right text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { quantity: String(Number(item.quantity || 0) + 1) })}
                            className="h-8 w-8 rounded-md border border-slate-200 text-xs text-slate-600"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-1 text-right text-[11px] text-slate-500">{qtyLabel}</p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                          className="ios-input h-8 w-28 px-2 text-right text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          value={discountInput}
                          onChange={(e) => handleDiscountInputChange(item, e.target.value)}
                          placeholder="0 or 10%"
                          className="ios-input h-8 w-28 px-2 text-right text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-900">${lineTotalValue.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== item.id) : prev));
                            setDiscountInputByItemId((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                            setExpandedItemId((prev) => (prev === item.id ? null : prev));
                          }}
                          className="ios-secondary-btn h-8 w-8 px-0 text-xs text-rose-600"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-100">
                  <td colSpan={8}>
                    <button
                      type="button"
                      onClick={() => addLine()}
                      className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                    >
                      + Click to add another item
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-1">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add order notes, special instructions..."
                  className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  rows={5}
                />
              </label>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold text-slate-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tax</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={taxRate}
                      onChange={(e) => {
                        setTaxRate(e.target.value);
                        setTaxRateOverridden(true);
                      }}
                      className="ios-input h-8 w-20 px-2 text-right text-sm"
                    />
                    <span className="text-xs text-slate-500">%</span>
                    <span className="font-semibold text-slate-900">${taxAmount.toFixed(2)}</span>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span className="text-slate-900">Total</span>
                    <span className="text-lg text-slate-900">${total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Paid</span>
                  <span>$0.00</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-slate-500">Balance Due</span>
                  <span className={balance > 0 ? "text-rose-600" : "text-slate-900"}>${balance.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {openCustomerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="linear-card w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-slate-900">Quick Add Customer</h3>
            <form className="mt-3 space-y-3" onSubmit={createCustomer}>
              <input
                required
                placeholder="Name"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <input
                placeholder="Phone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <input
                placeholder="Email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <input
                placeholder="Company Name"
                value={newCustomer.companyName}
                onChange={(e) => setNewCustomer((p) => ({ ...p, companyName: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <select
                value={newCustomer.customerType}
                onChange={(e) => setNewCustomer((p) => ({ ...p, customerType: e.target.value }))}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="RESIDENTIAL">Residential</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
              <input
                placeholder="Address"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={newCustomer.taxExempt}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, taxExempt: e.target.checked }))}
                />
                Tax Exempt
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenCustomerModal(false)}
                  className="ios-secondary-btn h-11 flex-1 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-11 flex-1 text-sm">
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function NewSalesOrderPage() {
  return (
    <Suspense fallback={<section className="p-6 text-sm text-slate-500">Loading sales order form...</section>}>
      <NewSalesOrderPageContent />
    </Suspense>
  );
}
