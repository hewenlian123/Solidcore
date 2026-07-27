"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  Minus,
  PackageSearch,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { NewCustomerDialog } from "@/components/sales/new-customer-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchField } from "@/components/ui/search-field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  DeliverySnapshot,
  SaleCustomer,
  SaleDocumentType,
  SaleFulfillmentMethod,
  SaleLine,
  SaleProduct,
} from "./create-sale-types";

type SearchMode = "PRODUCTS" | "CUSTOMERS";

type PersistedDraft = {
  version: 1;
  creationKey: string;
  customer: SaleCustomer | null;
  lines: SaleLine[];
  fulfillmentMethod: SaleFulfillmentMethod;
  delivery: DeliverySnapshot;
  requiredDeposit: string;
};

const emptyDelivery: DeliverySnapshot = {
  contactName: "",
  contactPhone: "",
  jobSiteName: "",
  address1: "",
  address2: "",
  city: "",
  state: "HI",
  zipCode: "",
  notes: "",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function quantityText(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
}

function unitLabel(unit: SaleProduct["sellingUnit"]) {
  if (unit === "BOX") return "boxes";
  if (unit === "SQFT") return "sqft";
  return "pieces";
}

function coverageSummary(line: SaleLine) {
  const quantity = Number(line.quantity || 0);
  const coverage = Number(line.flooringBoxCoverageSqft || 0);
  if (
    line.sellingUnit !== "BOX" ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(coverage) ||
    coverage <= 0
  ) {
    return "";
  }
  return `${quantityText(quantity)} boxes (${quantityText(quantity * coverage)} sqft)`;
}

function customerDisplayName(customer: SaleCustomer) {
  return customer.companyName || customer.name;
}

function storageKey(docType: SaleDocumentType) {
  return `solidcore:create-sale:${docType}`;
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CreateSaleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docType: SaleDocumentType =
    searchParams.get("docType")?.toUpperCase() === "QUOTE"
      ? "QUOTE"
      : "SALES_ORDER";
  const isQuote = docType === "QUOTE";

  const [searchMode, setSearchMode] = useState<SearchMode>("PRODUCTS");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [customers, setCustomers] = useState<SaleCustomer[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState("");
  const [customer, setCustomer] = useState<SaleCustomer | null>(null);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [fulfillmentMethod, setFulfillmentMethod] =
    useState<SaleFulfillmentMethod>("PICKUP");
  const [delivery, setDelivery] = useState<DeliverySnapshot>(emptyDelivery);
  const [requiredDeposit, setRequiredDeposit] = useState("0");
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdDraftId, setCreatedDraftId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const creationKeyRef = useRef("");
  const savingRef = useRef(false);

  const selectCustomer = useCallback(
    (nextCustomer: SaleCustomer, jobSiteName = "") => {
      setCustomer(nextCustomer);
      setDelivery((current) => ({
        ...current,
        contactName: nextCustomer.name || current.contactName,
        contactPhone: nextCustomer.phone || current.contactPhone,
        jobSiteName: jobSiteName || current.jobSiteName,
        address1: nextCustomer.installAddress || current.address1,
        city: nextCustomer.city || current.city,
        state: nextCustomer.state || current.state || "HI",
        zipCode: nextCustomer.zipCode || current.zipCode,
      }));
      setSearchMode("PRODUCTS");
      setQuery("");
      setError("");
    },
    [],
  );

  useEffect(() => {
    const key = storageKey(docType);
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as PersistedDraft;
        if (draft.version === 1 && draft.creationKey) {
          creationKeyRef.current = draft.creationKey;
          setCustomer(draft.customer);
          setLines(Array.isArray(draft.lines) ? draft.lines : []);
          setFulfillmentMethod(draft.fulfillmentMethod ?? "PICKUP");
          setDelivery({ ...emptyDelivery, ...draft.delivery });
          setRequiredDeposit(draft.requiredDeposit ?? "0");
        }
      }
    } catch {
      window.sessionStorage.removeItem(key);
    }
    if (!creationKeyRef.current) creationKeyRef.current = createRequestKey();
    setHydrated(true);
  }, [docType]);

  useEffect(() => {
    if (!hydrated) return;
    const draft: PersistedDraft = {
      version: 1,
      creationKey: creationKeyRef.current,
      customer,
      lines,
      fulfillmentMethod,
      delivery,
      requiredDeposit,
    };
    window.sessionStorage.setItem(storageKey(docType), JSON.stringify(draft));
  }, [
    customer,
    delivery,
    docType,
    fulfillmentMethod,
    hydrated,
    lines,
    requiredDeposit,
  ]);

  useEffect(() => {
    const customerId = searchParams.get("customerId")?.trim();
    if (!hydrated || !customerId || customer) return;
    const controller = new AbortController();
    fetch(`/api/customers/${customerId}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.data) {
          throw new Error(
            payload.error || "Could not load the selected customer.",
          );
        }
        selectCustomer(payload.data as SaleCustomer);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load the selected customer.",
        );
      });
    return () => controller.abort();
  }, [customer, hydrated, searchParams, selectCustomer]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setSearching(true);
        setSearchError("");
        try {
          const endpoint =
            searchMode === "PRODUCTS"
              ? `/api/sales-orders/products?q=${encodeURIComponent(query.trim())}`
              : `/api/customers?q=${encodeURIComponent(query.trim())}`;
          const response = await fetch(endpoint, { signal: controller.signal });
          const payload = (await response.json().catch(() => ({}))) as {
            data?: unknown;
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error || "Search is unavailable.");
          }
          if (searchMode === "PRODUCTS") {
            setProducts(
              Array.isArray(payload.data)
                ? (payload.data as SaleProduct[])
                : [],
            );
          } else {
            setCustomers(
              Array.isArray(payload.data)
                ? (payload.data as SaleCustomer[])
                : [],
            );
          }
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError")
            return;
          setSearchError(
            caught instanceof Error ? caught.message : "Search is unavailable.",
          );
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      },
      query ? 180 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchMode]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings/company", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const rate = Number(payload?.data?.defaultTaxRate ?? 0);
        if (Number.isFinite(rate) && rate >= 0) setDefaultTaxRate(rate);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum + Number(line.price || 0) * Number(line.quantity || 0),
        0,
      ),
    [lines],
  );
  const taxRate = customer?.taxExempt
    ? 0
    : Number(customer?.taxRate ?? defaultTaxRate ?? 0);
  const tax = Math.max(0, subtotal * (taxRate / 100));
  const total = subtotal + tax;
  const depositNumber = Number(requiredDeposit || 0);

  function addProduct(product: SaleProduct) {
    const available = Number(product.availableStock || 0);
    if (available <= 0) return;
    setLines((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (!existing) return [...current, { ...product, quantity: "1" }];
      const nextQuantity = Number(existing.quantity || 0) + 1;
      if (nextQuantity > available) return current;
      return current.map((line) =>
        line.id === product.id
          ? { ...line, quantity: quantityText(nextQuantity) }
          : line,
      );
    });
    setError("");
  }

  function updateLineQuantity(id: string, quantity: string) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, quantity } : line)),
    );
  }

  function stepLineQuantity(line: SaleLine, delta: number) {
    const next = Number(line.quantity || 0) + delta;
    if (next <= 0) {
      setLines((current) => current.filter((item) => item.id !== line.id));
      return;
    }
    if (next > Number(line.availableStock || 0)) return;
    updateLineQuantity(line.id, quantityText(next));
  }

  function validate() {
    if (!customer) return "Choose a customer before confirming this sale.";
    if (lines.length === 0) return "Add at least one line item before saving.";
    const invalidLine = lines.find((line) => {
      const quantity = Number(line.quantity);
      return !Number.isFinite(quantity) || quantity <= 0;
    });
    if (invalidLine)
      return `${invalidLine.name} quantity must be greater than zero.`;
    const overAvailable = lines.find(
      (line) => Number(line.quantity) > Number(line.availableStock || 0),
    );
    if (overAvailable) {
      return `${overAvailable.name} exceeds the available quantity of ${quantityText(
        Number(overAvailable.availableStock || 0),
      )} ${unitLabel(overAvailable.sellingUnit)}.`;
    }
    if (fulfillmentMethod === "DELIVERY") {
      if (!delivery.contactName.trim()) return "Delivery contact is required.";
      if (!delivery.contactPhone.trim()) return "Delivery phone is required.";
      if (!delivery.jobSiteName.trim())
        return "Job site name is required for delivery.";
      if (!delivery.address1.trim())
        return "Delivery street address is required.";
      if (
        !delivery.city.trim() ||
        !delivery.state.trim() ||
        !delivery.zipCode.trim()
      ) {
        return "Delivery city, state, and ZIP are required.";
      }
    }
    if (!Number.isFinite(depositNumber) || depositNumber < 0) {
      return "Required deposit must be zero or greater.";
    }
    if (depositNumber > total) {
      return "Required deposit cannot be greater than the order total.";
    }
    return "";
  }

  async function submit() {
    if (savingRef.current) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    setCreatedDraftId("");

    try {
      const createResponse = await fetch("/api/sales-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": creationKeyRef.current,
        },
        body: JSON.stringify({
          customerId: customer?.id,
          docType,
          projectName:
            fulfillmentMethod === "DELIVERY"
              ? delivery.jobSiteName.trim()
              : null,
          fulfillmentMethod,
          deliveryName:
            fulfillmentMethod === "DELIVERY"
              ? delivery.contactName.trim()
              : null,
          deliveryPhone:
            fulfillmentMethod === "DELIVERY"
              ? delivery.contactPhone.trim()
              : null,
          deliveryAddress1:
            fulfillmentMethod === "DELIVERY" ? delivery.address1.trim() : null,
          deliveryAddress2:
            fulfillmentMethod === "DELIVERY" ? delivery.address2.trim() : null,
          deliveryCity:
            fulfillmentMethod === "DELIVERY" ? delivery.city.trim() : null,
          deliveryState:
            fulfillmentMethod === "DELIVERY" ? delivery.state.trim() : null,
          deliveryZip:
            fulfillmentMethod === "DELIVERY" ? delivery.zipCode.trim() : null,
          deliveryNotes:
            fulfillmentMethod === "DELIVERY" ? delivery.notes.trim() : null,
          depositRequired: depositNumber,
          items: lines.map((line) => ({
            productId: line.productId,
            variantId: line.id,
            productSku: line.sku,
            productTitle: line.title || line.name,
            skuSnapshot: line.sku,
            titleSnapshot: line.title || line.name,
            uomSnapshot: line.sellingUnit,
            lineDescription:
              line.generatedDescription ||
              line.specsLine ||
              line.variantDescription ||
              line.defaultDescription ||
              "",
            quantity: Number(line.quantity),
            unitPrice: Number(line.price || 0),
            lineDiscount: 0,
          })),
        }),
      });
      const createPayload = (await createResponse.json().catch(() => ({}))) as {
        data?: { id?: string };
        error?: string;
        existingOrderId?: string;
      };
      if (!createResponse.ok || !createPayload.data?.id) {
        if (createPayload.existingOrderId)
          setCreatedDraftId(createPayload.existingOrderId);
        throw new Error(createPayload.error || "Could not create this sale.");
      }

      const orderId = createPayload.data.id;
      setCreatedDraftId(orderId);
      const status = isQuote ? "QUOTED" : "CONFIRMED";
      const statusResponse = await fetch(
        `/api/sales-orders/${orderId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const statusPayload = (await statusResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!statusResponse.ok) {
        const prefix = isQuote
          ? "The Quote draft was created, but it could not be marked as quoted."
          : "The Sales Order draft was created, but confirmation failed.";
        throw new Error(
          `${prefix} ${statusPayload.error || "Review the draft and try again."}`,
        );
      }

      window.sessionStorage.removeItem(storageKey(docType));
      if (isQuote) {
        router.push(`/orders/${orderId}`);
      } else {
        router.push(`/orders/${orderId}?created=1&status=confirmed`);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create this sale.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const visibleResults =
    searchMode === "PRODUCTS" ? products.slice(0, 30) : customers;

  return (
    <main className="so-entry-page min-h-screen bg-canvas text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to orders"
            onClick={() => router.push(`/orders?docType=${docType}`)}
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p
              data-testid="new-sale-mode"
              className="truncate text-lg font-bold text-foreground"
            >
              {isQuote ? "New Quote" : "New Sales Order"}
            </p>
            <p className="text-xs text-foreground-secondary">
              Draft · Not yet recorded
            </p>
          </div>
          <div className="hidden items-center gap-2 text-sm text-foreground-secondary sm:flex">
            <Check aria-hidden="true" className="h-4 w-4 text-success" />
            Saved on this device
          </div>
        </div>
      </header>

      <div
        data-testid="new-sale-workspace"
        className="mx-auto flex max-w-[1480px] flex-col lg:min-h-[calc(100vh-65px)] lg:flex-row"
      >
        <section className="min-w-0 flex-1 border-b border-border bg-canvas px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {searchMode === "PRODUCTS"
                    ? "Find products"
                    : "Choose customer"}
                </h1>
                <p className="mt-1 text-sm text-foreground-secondary">
                  {searchMode === "PRODUCTS"
                    ? "Search by product name or SKU."
                    : "Search before creating a new customer record."}
                </p>
              </div>
              <div
                aria-label="Search mode"
                className="grid grid-cols-2 gap-1 rounded-sc border border-border bg-surface-secondary p-1"
              >
                <Button
                  size="sm"
                  variant={searchMode === "PRODUCTS" ? "outline" : "ghost"}
                  aria-pressed={searchMode === "PRODUCTS"}
                  onClick={() => {
                    setSearchMode("PRODUCTS");
                    setQuery("");
                  }}
                >
                  Products
                </Button>
                <Button
                  size="sm"
                  variant={searchMode === "CUSTOMERS" ? "outline" : "ghost"}
                  aria-pressed={searchMode === "CUSTOMERS"}
                  onClick={() => {
                    setSearchMode("CUSTOMERS");
                    setQuery("");
                  }}
                >
                  Customers
                </Button>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <SearchField
                label={
                  searchMode === "PRODUCTS"
                    ? "Product or SKU search"
                    : "Customer search"
                }
                placeholder={
                  searchMode === "PRODUCTS"
                    ? "Search products..."
                    : "Name, company, phone, or email"
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClear={() => setQuery("")}
                autoFocus
              />
              {searchMode === "CUSTOMERS" ? (
                <Button
                  variant="outline"
                  onClick={() => setNewCustomerOpen(true)}
                  className="px-3 sm:px-4"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden sm:inline">New customer</span>
                </Button>
              ) : null}
            </div>

            <div className="mt-4 border-t border-border">
              {searching ? (
                <div className="flex min-h-40 items-center justify-center text-sm text-foreground-secondary">
                  Searching...
                </div>
              ) : searchError ? (
                <div className="py-8 text-center">
                  <p role="alert" className="text-sm font-medium text-critical">
                    {searchError}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => setQuery((current) => `${current} `)}
                  >
                    Try again
                  </Button>
                </div>
              ) : visibleResults.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  {searchMode === "PRODUCTS" ? (
                    <PackageSearch
                      aria-hidden="true"
                      className="h-6 w-6 text-foreground-secondary"
                    />
                  ) : (
                    <UserRound
                      aria-hidden="true"
                      className="h-6 w-6 text-foreground-secondary"
                    />
                  )}
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    No {searchMode === "PRODUCTS" ? "products" : "customers"}{" "}
                    found
                  </p>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    Check the search or try a broader term.
                  </p>
                </div>
              ) : searchMode === "PRODUCTS" ? (
                <div className="divide-y divide-border">
                  {(visibleResults as SaleProduct[]).map((product) => {
                    const available = Number(product.availableStock || 0);
                    const inOrder = lines.find(
                      (line) => line.id === product.id,
                    );
                    return (
                      <div
                        key={product.id}
                        className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                              {product.name}
                            </p>
                            <span className="text-xs font-medium text-foreground-secondary">
                              {product.sku}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs text-foreground-secondary">
                            {product.generatedDescription ||
                              product.specsLine ||
                              product.variantDescription ||
                              product.category ||
                              "Standard item"}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs">
                            <span className="font-semibold text-foreground">
                              {money(Number(product.price || 0))} /{" "}
                              {unitLabel(product.sellingUnit).replace(/s$/, "")}
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                available > 0
                                  ? "text-success"
                                  : "text-critical",
                              )}
                            >
                              Available {quantityText(available)}{" "}
                              {unitLabel(product.sellingUnit)}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant={inOrder ? "secondary" : "outline"}
                          size="icon"
                          aria-label={`Add ${product.name} to cart`}
                          title={`Add ${product.name}`}
                          disabled={available <= 0}
                          onClick={() => addProduct(product)}
                        >
                          {inOrder ? (
                            <Check aria-hidden="true" className="h-4 w-4" />
                          ) : (
                            <Plus aria-hidden="true" className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {(visibleResults as SaleCustomer[]).map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => selectCustomer(result)}
                      className="flex min-h-[72px] w-full items-center gap-3 py-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      aria-label={`Use ${customerDisplayName(result)}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sc bg-surface-secondary text-foreground-secondary">
                        {result.companyName ? (
                          <Building2 aria-hidden="true" className="h-5 w-5" />
                        ) : (
                          <UserRound aria-hidden="true" className="h-5 w-5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {customerDisplayName(result)}
                        </span>
                        <span className="block truncate text-xs text-foreground-secondary">
                          {[result.name, result.phone, result.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="-rotate-90 h-4 w-4 text-foreground-secondary"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 bg-surface lg:w-[470px]">
          <div className="lg:sticky lg:top-0">
            <div className="border-b border-border px-4 py-5 sm:px-6">
              <h2 className="text-lg font-bold text-foreground">
                Current Order
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSearchMode("CUSTOMERS");
                  setQuery("");
                }}
                className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-sc border border-border bg-surface-secondary px-3 text-left hover:border-border-strong hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sc bg-surface text-foreground-secondary">
                  {customer?.companyName ? (
                    <Building2 aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <UserRound aria-hidden="true" className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-foreground-secondary">
                    Customer
                  </span>
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {customer
                      ? customerDisplayName(customer)
                      : "Choose customer"}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 text-foreground-secondary"
                />
              </button>
            </div>

            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Items{" "}
                  <span className="text-foreground-secondary">
                    ({lines.length})
                  </span>
                </h3>
              </div>
              {lines.length === 0 ? (
                <div className="flex min-h-36 flex-col items-center justify-center text-center">
                  <PackageSearch
                    aria-hidden="true"
                    className="h-6 w-6 text-foreground-secondary"
                  />
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    Cart is empty
                  </p>
                  <p className="mt-1 text-xs text-foreground-secondary">
                    Add a product from the search results.
                  </p>
                </div>
              ) : (
                <div className="mt-2 divide-y divide-border">
                  {lines.map((line) => {
                    const quantity = Number(line.quantity || 0);
                    return (
                      <div key={line.id} className="py-3">
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {line.name}
                            </p>
                            <p className="mt-0.5 text-xs text-foreground-secondary">
                              {line.sku} · {money(Number(line.price || 0))} /{" "}
                              {unitLabel(line.sellingUnit).replace(/s$/, "")}
                            </p>
                            <p className="mt-1 text-xs text-success">
                              Available{" "}
                              {quantityText(Number(line.availableStock || 0))}{" "}
                              {unitLabel(line.sellingUnit)}
                            </p>
                            {coverageSummary(line) ? (
                              <p className="mt-1 text-xs font-medium text-foreground-secondary">
                                {coverageSummary(line)}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${line.name}`}
                            onClick={() =>
                              setLines((current) =>
                                current.filter((item) => item.id !== line.id),
                              )
                            }
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="grid grid-cols-[44px_72px_44px]">
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-r-none"
                              aria-label={`Decrease quantity for ${line.name}`}
                              onClick={() => stepLineQuantity(line, -1)}
                            >
                              <Minus aria-hidden="true" className="h-4 w-4" />
                            </Button>
                            <Input
                              aria-label={`Quantity for ${line.name} ${line.sku}`}
                              value={line.quantity}
                              onChange={(event) =>
                                updateLineQuantity(line.id, event.target.value)
                              }
                              inputMode="decimal"
                              className="rounded-none border-x-0 px-2 text-center"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-l-none"
                              aria-label={`Increase quantity for ${line.name}`}
                              onClick={() => stepLineQuantity(line, 1)}
                            >
                              <Plus aria-hidden="true" className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-sm font-bold text-foreground">
                            {money(Number(line.price || 0) * quantity)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-b border-border px-4 py-5 sm:px-6">
              <h3 className="text-sm font-semibold text-foreground">
                Fulfillment
              </h3>
              <div
                aria-label="Fulfillment method"
                className="mt-3 grid grid-cols-2 gap-1 rounded-sc border border-border bg-surface-secondary p-1"
              >
                {(["PICKUP", "DELIVERY"] as const).map((method) => (
                  <Button
                    key={method}
                    variant={fulfillmentMethod === method ? "outline" : "ghost"}
                    aria-pressed={fulfillmentMethod === method}
                    onClick={() => setFulfillmentMethod(method)}
                  >
                    {method === "PICKUP" ? "Pickup" : "Delivery"}
                  </Button>
                ))}
              </div>

              {fulfillmentMethod === "DELIVERY" ? (
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                    <Field
                      label="Delivery contact"
                      htmlFor="delivery-contact"
                      required
                    >
                      <Input
                        id="delivery-contact"
                        value={delivery.contactName}
                        onChange={(event) =>
                          setDelivery((current) => ({
                            ...current,
                            contactName: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Phone" htmlFor="delivery-phone" required>
                      <Input
                        id="delivery-phone"
                        value={delivery.contactPhone}
                        onChange={(event) =>
                          setDelivery((current) => ({
                            ...current,
                            contactPhone: event.target.value,
                          }))
                        }
                        inputMode="tel"
                      />
                    </Field>
                  </div>
                  <Field
                    label="Job site name"
                    htmlFor="delivery-job-site"
                    required
                  >
                    <Input
                      id="delivery-job-site"
                      value={delivery.jobSiteName}
                      onChange={(event) =>
                        setDelivery((current) => ({
                          ...current,
                          jobSiteName: event.target.value,
                        }))
                      }
                      placeholder="Kailua remodel"
                    />
                  </Field>
                  <Field
                    label="Street address"
                    htmlFor="delivery-address"
                    required
                  >
                    <Input
                      id="delivery-address"
                      value={delivery.address1}
                      onChange={(event) =>
                        setDelivery((current) => ({
                          ...current,
                          address1: event.target.value,
                        }))
                      }
                      placeholder="Street address"
                    />
                  </Field>
                  <Field label="Address line 2" htmlFor="delivery-address-2">
                    <Input
                      id="delivery-address-2"
                      value={delivery.address2}
                      onChange={(event) =>
                        setDelivery((current) => ({
                          ...current,
                          address2: event.target.value,
                        }))
                      }
                      placeholder="Unit, suite, or access detail"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" htmlFor="delivery-city" required>
                      <Input
                        id="delivery-city"
                        value={delivery.city}
                        onChange={(event) =>
                          setDelivery((current) => ({
                            ...current,
                            city: event.target.value,
                          }))
                        }
                        placeholder="City"
                      />
                    </Field>
                    <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                      <Field label="State" htmlFor="delivery-state" required>
                        <Input
                          id="delivery-state"
                          value={delivery.state}
                          onChange={(event) =>
                            setDelivery((current) => ({
                              ...current,
                              state: event.target.value,
                            }))
                          }
                          placeholder="State"
                          maxLength={2}
                        />
                      </Field>
                      <Field label="ZIP" htmlFor="delivery-zip" required>
                        <Input
                          id="delivery-zip"
                          value={delivery.zipCode}
                          onChange={(event) =>
                            setDelivery((current) => ({
                              ...current,
                              zipCode: event.target.value,
                            }))
                          }
                          placeholder="Zip"
                          inputMode="numeric"
                        />
                      </Field>
                    </div>
                  </div>
                  <Field label="Delivery notes" htmlFor="delivery-notes">
                    <Textarea
                      id="delivery-notes"
                      value={delivery.notes}
                      onChange={(event) =>
                        setDelivery((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Gate, loading zone, or site instructions"
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="px-4 py-5 sm:px-6">
              <Field
                label="Required deposit"
                htmlFor="required-deposit"
                hint="Not paid. Payment is recorded separately after the order is confirmed."
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-secondary"
                  >
                    $
                  </span>
                  <Input
                    id="required-deposit"
                    value={requiredDeposit}
                    onChange={(event) => setRequiredDeposit(event.target.value)}
                    inputMode="decimal"
                    className="pl-7"
                  />
                </div>
              </Field>

              <dl
                data-testid="totals-summary"
                className="mt-5 grid gap-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <dt className="text-foreground-secondary">Subtotal</dt>
                  <dd className="font-medium text-foreground">
                    {money(subtotal)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-foreground-secondary">
                    Tax {taxRate > 0 ? `(${quantityText(taxRate)}%)` : ""}
                  </dt>
                  <dd className="font-medium text-foreground">{money(tax)}</dd>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
                  <dt className="font-bold text-foreground">Total</dt>
                  <dd className="text-xl font-bold text-foreground">
                    {money(total)}
                  </dd>
                </div>
              </dl>

              {error ? (
                <div className="mt-4 border-l-4 border-critical bg-critical-surface px-3 py-2.5">
                  <p role="alert" className="text-sm font-medium text-critical">
                    {error}
                  </p>
                  {createdDraftId ? (
                    <Link
                      href={`/orders/${createdDraftId}`}
                      className="mt-2 inline-block text-sm font-semibold text-accent underline underline-offset-4"
                    >
                      Open draft
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div data-testid="primary-action-area" className="mt-5">
                <Button
                  data-testid="primary-sale-action"
                  size="lg"
                  className="w-full"
                  loading={saving}
                  onClick={submit}
                >
                  {isQuote ? "Save Quote" : "Confirm Order"}
                </Button>
                <p className="mt-2 text-center text-xs leading-5 text-foreground-secondary">
                  {isQuote
                    ? "This saves a quote. No stock, invoice, or payment is created."
                    : "Invoice and payment are separate records created after confirmation."}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <NewCustomerDialog
        open={newCustomerOpen}
        initialName={query}
        onOpenChange={setNewCustomerOpen}
        onCustomerSelected={selectCustomer}
      />
    </main>
  );
}
