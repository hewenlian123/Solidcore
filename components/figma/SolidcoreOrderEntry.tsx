"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";

type SalesCustomer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxExempt: boolean;
  taxRate: number | null;
};

type Salesperson = {
  id: string;
  name: string;
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
};

type DraftItem = {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineDiscount: number;
  onHand: number;
  unit: string | null;
  imageUrl: string | null;
};

function createItemFromProduct(product: ProductSearchResult): DraftItem {
  return {
    id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    variantId: product.id,
    productId: product.productId,
    name: product.name,
    sku: product.sku,
    qty: 1,
    unitPrice: Number(product.salePrice || 0),
    lineDiscount: 0,
    onHand: Number(product.onHand || 0),
    unit: product.unit ?? null,
    imageUrl: product.imageUrl ?? null,
  };
}

export function SolidcoreOrderEntry() {
  const { role } = useRole();
  const router = useRouter();
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [salespersonName, setSalespersonName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    taxExempt: false,
    taxRate: "",
  });

  const selectedCustomer = useMemo(
    () => customers.find((row) => row.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const [customersRes, salespeopleRes] = await Promise.all([
          fetch("/api/sales-orders/customers", { cache: "no-store", headers: { "x-user-role": role } }),
          fetch("/api/sales-orders/salespeople", { cache: "no-store", headers: { "x-user-role": role } }),
        ]);
        const customersPayload = await customersRes.json();
        const salespeoplePayload = await salespeopleRes.json();
        if (!customersRes.ok) throw new Error(customersPayload.error ?? "Failed to load customers");
        if (!salespeopleRes.ok) throw new Error(salespeoplePayload.error ?? "Failed to load salespeople");
        const nextCustomers = Array.isArray(customersPayload.data) ? customersPayload.data : [];
        setCustomers(nextCustomers);
        setSalespeople(Array.isArray(salespeoplePayload.data) ? salespeoplePayload.data : []);
        const walkIn = nextCustomers.find((row: SalesCustomer) => /walk[\s-]?in/i.test(String(row.name ?? "")));
        if (walkIn) setSelectedCustomerId(walkIn.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load form data");
      }
    };
    void load();
  }, [role]);

  useEffect(() => {
    if (!selectedCustomer) return;
    if (selectedCustomer.taxExempt) {
      setTaxRate(0);
      return;
    }
    setTaxRate(Number(selectedCustomer.taxRate ?? 0));
    if (fulfillmentMethod === "DELIVERY" && !deliveryAddress.trim()) {
      setDeliveryAddress(String(selectedCustomer.address ?? ""));
    }
  }, [selectedCustomer, fulfillmentMethod, deliveryAddress]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        const res = await fetch(`/api/products/search?${params.toString()}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to search products");
        setSearchResults(Array.isArray(payload.data) ? payload.data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to search products");
        setSearchResults([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery, role]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, item.qty * item.unitPrice - item.lineDiscount), 0),
    [items],
  );
  const taxAmount = useMemo(() => (subtotal * Math.max(0, Number(taxRate || 0))) / 100, [subtotal, taxRate]);
  const total = subtotal + taxAmount;
  const lowStockItems = useMemo(
    () => items.filter((item) => item.onHand > 0 && item.qty > item.onHand),
    [items],
  );

  const addProduct = (product: ProductSearchResult) => {
    setItems((prev) => {
      const existing = prev.find((row) => row.variantId === product.id);
      if (existing) return prev.map((row) => (row.variantId === product.id ? { ...row, qty: row.qty + 1 } : row));
      return [...prev, createItemFromProduct(product)];
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((row) => row.id !== id));

  const submit = async (confirmAfterCreate: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (!selectedCustomerId) throw new Error("Please select a customer.");
      if (items.length === 0) throw new Error("Please add at least one item.");
      if (fulfillmentMethod === "DELIVERY" && !deliveryAddress.trim()) throw new Error("Delivery address is required.");

      const payload = {
        customerId: selectedCustomerId,
        docType: "SALES_ORDER",
        projectName: projectName || null,
        fulfillmentMethod,
        deliveryAddress1: fulfillmentMethod === "DELIVERY" ? deliveryAddress.trim() : null,
        deliveryCity: null,
        deliveryState: null,
        deliveryZip: null,
        salespersonName: salespersonName || null,
        notes: notes || null,
        discount: 0,
        tax: taxAmount,
        taxRate,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productSku: item.sku,
          productTitle: item.name,
          description: null,
          lineDescription: null,
          quantity: Number(item.qty || 0),
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
      if (!createRes.ok) throw new Error(createPayload.error ?? "Failed to create sales order");
      const orderId = String(createPayload.data?.id ?? "");
      if (!orderId) throw new Error("Sales order ID not returned.");

      if (confirmAfterCreate) {
        await fetch(`/api/sales-orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify({ status: "CONFIRMED" }),
        });
      }
      router.push(`/orders/${orderId}?created=1&status=${confirmAfterCreate ? "confirmed" : "draft"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  const createCustomer = async () => {
    if (!newCustomer.name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setCreatingCustomer(true);
    setError(null);
    try {
      const res = await fetch("/api/sales-orders/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim() || null,
          email: newCustomer.email.trim() || null,
          address: newCustomer.address.trim() || null,
          taxExempt: newCustomer.taxExempt,
          taxRate: newCustomer.taxExempt ? null : (newCustomer.taxRate.trim() || null),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create customer");
      const created = payload.data as SalesCustomer;
      setCustomers((prev) => [created, ...prev]);
      setSelectedCustomerId(created.id);
      setShowQuickAddCustomer(false);
      setNewCustomer({
        name: "",
        phone: "",
        email: "",
        address: "",
        taxExempt: false,
        taxRate: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create customer");
    } finally {
      setCreatingCustomer(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white">
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold">Sales Order V2 (Figma Integration Test)</h1>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Customer</span>
                <button
                  type="button"
                  onClick={() => setShowQuickAddCustomer((prev) => !prev)}
                  className="text-xs text-cyan-300 hover:text-cyan-200"
                >
                  + Quick Add
                </button>
              </div>
              <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="h-10 w-full rounded-xl bg-slate-900/70 px-3">
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
              </select>
            </div>
            <select value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} className="h-10 rounded-xl bg-slate-900/70 px-3">
              <option value="">Select salesperson</option>
              {salespeople.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" className="h-10 rounded-xl bg-slate-900/70 px-3" />
          </div>
          {showQuickAddCustomer ? (
            <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/40 p-3 md:grid-cols-2">
              <input value={newCustomer.name} onChange={(e) => setNewCustomer((prev) => ({ ...prev, name: e.target.value }))} placeholder="Customer name *" className="h-9 rounded bg-slate-900/70 px-2" />
              <input value={newCustomer.phone} onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="h-9 rounded bg-slate-900/70 px-2" />
              <input value={newCustomer.email} onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="h-9 rounded bg-slate-900/70 px-2" />
              <input value={newCustomer.address} onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))} placeholder="Address" className="h-9 rounded bg-slate-900/70 px-2" />
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={newCustomer.taxExempt} onChange={(e) => setNewCustomer((prev) => ({ ...prev, taxExempt: e.target.checked }))} />
                Tax Exempt
              </label>
              <input
                value={newCustomer.taxRate}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, taxRate: e.target.value }))}
                placeholder="Tax rate %"
                disabled={newCustomer.taxExempt}
                className="h-9 rounded bg-slate-900/70 px-2 disabled:opacity-50"
              />
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowQuickAddCustomer(false)} className="h-9 rounded border border-white/20 px-3 text-sm hover:bg-white/10">
                  Cancel
                </button>
                <button type="button" disabled={creatingCustomer} onClick={() => void createCustomer()} className="h-9 rounded bg-cyan-600 px-3 text-sm font-semibold hover:bg-cyan-500 disabled:opacity-50">
                  {creatingCustomer ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <select value={fulfillmentMethod} onChange={(e) => setFulfillmentMethod(e.target.value as "PICKUP" | "DELIVERY")} className="h-10 rounded-xl bg-slate-900/70 px-3">
              <option value="PICKUP">Pickup</option>
              <option value="DELIVERY">Delivery</option>
            </select>
            {fulfillmentMethod === "DELIVERY" ? (
              <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Delivery address" className="h-10 rounded-xl bg-slate-900/70 px-3" />
            ) : null}
          </div>

          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products by SKU / name..." className="h-10 w-full rounded-xl bg-slate-900/70 px-3" />
          {searchResults.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 p-2">
              {searchResults.slice(0, 8).map((p) => (
                <button key={p.id} type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.08]">
                  <span>{p.name} <span className="font-mono text-xs text-slate-300">{p.sku}</span></span>
                  <span className="font-semibold">${Number(p.salePrice || 0).toFixed(2)}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-2 rounded-xl border border-white/10 p-3">
            {items.length === 0 ? <p className="text-sm text-slate-300">No line items yet.</p> : null}
            {items.map((item) => (
              <div
                key={item.id}
                className={`grid grid-cols-[minmax(0,1fr)_110px_120px_120px_40px] items-center gap-2 rounded px-2 py-1 ${
                  item.onHand > 0 && item.qty > item.onHand ? "bg-rose-500/10 ring-1 ring-rose-400/40" : ""
                }`}
              >
                <div className="truncate text-sm">
                  {item.name} <span className="font-mono text-xs text-slate-300">{item.sku}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
                      item.onHand <= 0
                        ? "bg-rose-500/20 text-rose-200"
                        : item.qty > item.onHand
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-emerald-500/20 text-emerald-200"
                    }`}
                  >
                    {item.onHand <= 0
                      ? "Out of stock"
                      : item.qty > item.onHand
                        ? `Over (${item.onHand} ${item.unit ?? "pcs"})`
                        : `${item.onHand} ${item.unit ?? "pcs"}`}
                  </span>
                </div>
                <input type="number" min={0} step={1} value={item.qty} onChange={(e) => updateItem(item.id, { qty: Number(e.target.value || 0) })} className="h-9 rounded bg-slate-900/70 px-2" />
                <input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value || 0) })} className="h-9 rounded bg-slate-900/70 px-2" />
                <input type="number" min={0} step={0.01} value={item.lineDiscount} onChange={(e) => updateItem(item.id, { lineDiscount: Number(e.target.value || 0) })} className="h-9 rounded bg-slate-900/70 px-2" />
                <button type="button" onClick={() => removeItem(item.id)} className="text-rose-300 hover:text-rose-200">x</button>
              </div>
            ))}
          </div>
          {lowStockItems.length > 0 ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p className="font-semibold">Stock warning</p>
              <p>{lowStockItems.length} line item(s) exceed available stock.</p>
            </div>
          ) : null}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order notes" className="min-h-24 w-full rounded-xl bg-slate-900/70 p-3" />
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </section>

        <aside className="h-fit space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl lg:sticky lg:top-4">
          <div className="flex items-center justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="flex items-center justify-between">
            <span>Tax %</span>
            <input type="number" min={0} step={0.01} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value || 0))} className="h-8 w-24 rounded bg-slate-900/70 px-2 text-right" />
          </div>
          <div className="flex items-center justify-between"><span>Tax</span><span>${taxAmount.toFixed(2)}</span></div>
          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-lg font-semibold"><span>Total</span><span>${total.toFixed(2)}</span></div>
          <button type="button" disabled={saving} onClick={() => void submit(true)} className="h-10 w-full rounded-xl bg-cyan-600 font-semibold hover:bg-cyan-500 disabled:opacity-50">Confirm Order</button>
          <button type="button" disabled={saving} onClick={() => void submit(false)} className="h-10 w-full rounded-xl border border-white/20 bg-transparent hover:bg-white/10 disabled:opacity-50">Save Draft</button>
        </aside>
      </div>
    </div>
  );
}
