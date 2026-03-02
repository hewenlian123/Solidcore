"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRole } from "@/components/layout/role-provider";
import { formatLineItemTitle, formatOptionalLineNote } from "@/lib/display";

type SalesCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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
  price: string;
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
});

function NewSalesOrderPageContent() {
  const { role } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [docType, setDocType] = useState<"QUOTE" | "SALES_ORDER">("SALES_ORDER");
  const [specialOrder, setSpecialOrder] = useState(false);
  const [hidePrices, setHidePrices] = useState(false);
  const [depositRequired, setDepositRequired] = useState("0");
  const [salespersonName, setSalespersonName] = useState("");
  const [commissionRate, setCommissionRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [activeProductPickerItemId, setActiveProductPickerItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openCustomerModal, setOpenCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

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
    const docTypeParam = searchParams.get("docType");
    if (docTypeParam === "QUOTE" || docTypeParam === "SALES_ORDER") {
      setDocType(docTypeParam);
    }
  }, [searchParams]);

  useEffect(() => {
    Promise.all([loadCustomers(), loadProducts()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load form data"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(customerQuery).catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to fetch customers"),
      );
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQuery]);

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
  const total = subtotal - Number(discount || 0) + Number(tax || 0);
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
      if (items.some((item) => !item.variantId)) {
        throw new Error("Please select a product variant for each line item.");
      }
      const payload = {
        customerId: selectedCustomerId,
        docType,
        projectName,
        specialOrder,
        hidePrices,
        depositRequired: Number(depositRequired || 0),
        salespersonName,
        commissionRate: Number(commissionRate || 0),
        notes,
        discount: Number(discount || 0),
        tax: Number(tax || 0),
        items: items.map((item) => ({
          productId: item.productId || null,
          variantId: item.variantId || null,
          productSku: item.productSku || null,
          productTitle: item.productTitle || null,
          description: item.lineDescription || null,
          lineDescription: item.lineDescription,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          lineDiscount: Number(item.lineDiscount || 0),
        })),
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
      router.push(`/orders/${orderId}`);
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
        body: JSON.stringify(newCustomer),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create customer");
      setOpenCustomerModal(false);
      setNewCustomer({ name: "", phone: "", email: "", address: "", notes: "" });
      await loadCustomers();
      setSelectedCustomerId(payload.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    }
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <Link href="/orders" className="text-xs text-slate-500 hover:text-slate-700">
          ← Back to Orders
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New {docType === "QUOTE" ? "Quote" : "Sales Order"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Create a draft, add line items, and confirm when ready.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="linear-card space-y-4 p-8 xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Search Customer</span>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
                placeholder="Name / phone / email"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Select Customer</span>
              <div className="flex gap-2">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="ios-input h-11 w-full bg-white px-3 text-sm"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} {customer.phone ? `(${customer.phone})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setOpenCustomerModal(true)}
                  className="ios-secondary-btn h-11 px-3 text-sm"
                >
                  Quick Add
                </button>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Document Type</span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as "QUOTE" | "SALES_ORDER")}
                className="ios-input h-11 w-full bg-white px-3 text-sm"
              >
                <option value="QUOTE">Quote</option>
                <option value="SALES_ORDER">Sales Order</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Project Name</span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Salesperson</span>
              <input
                value={salespersonName}
                onChange={(e) => setSalespersonName(e.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Deposit Required</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositRequired}
                onChange={(e) => setDepositRequired(e.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Commission Rate (0-1)</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                className="ios-input h-11 w-full px-3 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={specialOrder}
                onChange={(e) => setSpecialOrder(e.target.checked)}
              />
              Special Order
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={hidePrices}
                onChange={(e) => setHidePrices(e.target.checked)}
              />
              Hide Prices (Customer View)
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-slate-600">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              rows={3}
            />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            {items.map((item, idx) => {
              const selectedQty = Number(item.quantity || 0);
              const availableQty = item.variantId ? Number(availableByVariant.get(item.variantId) ?? 0) : null;
              return (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Line {idx + 1}</p>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== item.id) : prev))}
                    className="ios-secondary-btn inline-flex h-8 items-center gap-1 px-2 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div className="relative space-y-2 md:col-span-2">
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
                      placeholder="Search by SKU / title / brand / collection"
                      className="ios-input h-11 w-full px-3 text-sm"
                    />
                    {activeProductPickerItemId === item.id ? (
                      <div className="absolute z-20 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md">
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
                          <div className="px-3 py-2 text-xs text-slate-500">No products found.</div>
                        ) : (
                          products.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickProductForItem(item.id, product);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                            >
                              <p className="text-sm font-medium text-slate-900">{product.name}</p>
                              <p className="text-xs text-slate-500">
                                {product.sku || "-"} · Stock {Number(product.availableStock || 0).toFixed(2)} · $
                                {Number(product.price || 0).toFixed(2)}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                  <label className="block space-y-1 md:col-span-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Line Description / Notes</span>
                      <button
                        type="button"
                        onClick={() => resetItemDescriptionToTemplate(item.id, item.variantId)}
                        disabled={!item.variantId}
                        className="ios-secondary-btn h-7 px-2 text-[11px] disabled:opacity-50"
                      >
                        Reset to Template
                      </button>
                    </div>
                    <textarea
                      value={item.lineDescription}
                      onChange={(e) => updateItem(item.id, { lineDescription: e.target.value })}
                      placeholder="Description shown on customer PDF"
                      className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                      rows={2}
                    />
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                    placeholder="Qty"
                    className="ios-input h-11 px-3 text-sm"
                  />
                  {availableQty !== null ? (
                    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs md:col-span-2">
                      <span className="text-slate-500">Available: {availableQty.toFixed(2)}</span>
                      {availableQty <= 0 ? (
                        <p className="mt-1 font-semibold text-rose-600">Out of stock.</p>
                      ) : availableQty < selectedQty ? (
                        <p className="mt-1 font-semibold text-amber-600">
                          Selected qty ({selectedQty.toFixed(2)}) exceeds available stock.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                    placeholder="Unit Price"
                    className="ios-input h-11 px-3 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.lineDiscount}
                    onChange={(e) => updateItem(item.id, { lineDiscount: e.target.value })}
                    placeholder="Line Discount"
                    className="ios-input h-11 px-3 text-sm"
                  />
                  <div className="flex h-11 items-center rounded-xl border border-slate-100 px-3 text-sm text-slate-700">
                    ${(Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.lineDiscount || 0)).toFixed(2)}
                  </div>
                  {item.productId ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-5">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatLineItemTitle({
                          variant: {
                            title: item.productTitle,
                            sku: item.productSku,
                            detailText: item.lineDescription,
                          },
                        })}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">SKU: {item.productSku || "-"}</p>
                      {formatOptionalLineNote(item.lineDescription) ? (
                        <p className="mt-1 whitespace-pre-line text-xs text-slate-600">
                          {formatOptionalLineNote(item.lineDescription)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              );
            })}
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
              className="ios-secondary-btn inline-flex h-10 items-center gap-2 px-3 text-sm"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>
        </div>

        <aside className="linear-card space-y-3 p-8">
          <h2 className="text-base font-semibold text-slate-900">Totals</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold text-slate-900">${subtotal.toFixed(2)}</span>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Discount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="ios-input h-10 w-28 px-2 text-right text-sm"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Tax</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="ios-input h-10 w-28 px-2 text-right text-sm"
              />
            </label>
            <div className="border-t border-slate-100 pt-2 text-base font-semibold">
              <div className="flex items-center justify-between">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Paid</span>
              <span>$0.00</span>
            </div>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-slate-500">Balance</span>
              <span>${balance.toFixed(2)}</span>
            </div>
          </div>
          <div className="pt-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => createOrder(false)}
              className="ios-secondary-btn h-11 w-full text-sm disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => createOrder(true)}
              className="ios-primary-btn mt-2 h-11 w-full text-sm disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save + Confirm"}
            </button>
          </div>
        </aside>
      </div>

      {openCustomerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="linear-card w-full max-w-md p-8">
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
                placeholder="Address"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                className="ios-input h-11 w-full px-3 text-sm"
              />
              <textarea
                placeholder="Notes"
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))}
                className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenCustomerModal(false)}
                  className="ios-secondary-btn h-11 flex-1 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-11 flex-1 text-sm">
                  Save
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
