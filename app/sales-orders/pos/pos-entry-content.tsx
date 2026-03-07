"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Package, Printer, History, Save, Check, X, ShoppingCart } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import styles from "./pos-entry.module.css";

type SalesCustomer = { id: string; name: string; phone: string | null; email: string | null; address: string | null };
type Salesperson = { id: string; name: string };
type ProductVariant = {
  id: string;
  productId: string;
  name: string;
  title: string | null;
  sku: string;
  price: string;
  availableStock: string;
};
type CartItem = {
  id: string;
  variantId: string;
  productId: string;
  productSku: string;
  productTitle: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
};

const CATEGORIES = [
  { id: "all", label: "All Products" },
  { id: "flooring", label: "Flooring" },
  { id: "doors", label: "Doors" },
  { id: "windows", label: "Windows" },
  { id: "mirrors", label: "Mirrors" },
  { id: "other", label: "Other" },
] as const;
type CategoryId = (typeof CATEGORIES)[number]["id"];

function inferCategory(raw: string | null | undefined): CategoryId {
  const t = String(raw ?? "").toLowerCase();
  if (t.includes("floor")) return "flooring";
  if (t.includes("door")) return "doors";
  if (t.includes("window")) return "windows";
  if (t.includes("mirror")) return "mirrors";
  return "other";
}

let cartIdCounter = 0;
function nextCartId() {
  return `pos-cart-${++cartIdCounter}`;
}

export default function POSEntryContent() {
  const { role } = useRole();
  const router = useRouter();
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [products, setProducts] = useState<ProductVariant[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [skuInput, setSkuInput] = useState("");
  const [skuInputError, setSkuInputError] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [timeWindow, setTimeWindow] = useState("");
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState("");
  const [warehouse, setWarehouse] = useState("central");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const skuInputRef = useRef<HTMLInputElement>(null);

  const loadCustomers = useCallback(async () => {
    const res = await fetch("/api/sales-orders/customers", {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch customers");
    setCustomers(payload.data ?? []);
  }, [role]);

  const loadProducts = useCallback(async (q?: string) => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    const res = await fetch(
      params.toString() ? `/api/sales-orders/products?${params.toString()}` : "/api/sales-orders/products",
      { cache: "no-store", headers: { "x-user-role": role } }
    );
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to fetch products");
    setProducts(payload.data ?? []);
  }, [role]);

  const loadSalespeople = useCallback(async () => {
    const res = await fetch("/api/sales-orders/salespeople", {
      cache: "no-store",
      headers: { "x-user-role": role },
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load salespeople");
    setSalespeople(payload.data ?? []);
  }, [role]);

  useEffect(() => {
    Promise.all([loadCustomers(), loadProducts(), loadSalespeople()]).catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load data")
    );
  }, [loadCustomers, loadProducts, loadSalespeople]);

  useEffect(() => {
    if (!orderDate) setOrderDate(new Date().toISOString().slice(0, 10));
  }, [orderDate]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory !== "all") {
      list = list.filter((p) => inferCategory((p as any).category ?? (p as any).collection ?? p.name) === selectedCategory);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          String(p.name ?? "").toLowerCase().includes(q) ||
          String(p.sku ?? "").toLowerCase().includes(q) ||
          String((p as any).brand ?? "").toLowerCase().includes(q) ||
          String((p as any).collection ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const addToCart = useCallback((product: ProductVariant) => {
    const price = Number(product.price) || 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.variantId === product.id);
      if (existing) {
        return prev.map((c) =>
          c.variantId === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          id: nextCartId(),
          variantId: product.id,
          productId: product.productId,
          productSku: product.sku,
          productTitle: product.title ?? product.name,
          quantity: 1,
          unitPrice: price,
          lineDiscount: 0,
        },
      ];
    });
  }, []);

  const addBySku = useCallback(() => {
    const val = skuInput.trim().toLowerCase();
    if (!val) return;
    const p = products.find((x) => x.sku.toLowerCase() === val);
    if (p) {
      addToCart(p);
      setSkuInput("");
      setSkuInputError(false);
    } else {
      setSkuInputError(true);
      setTimeout(() => setSkuInputError(false), 1200);
    }
  }, [skuInput, products, addToCart]);

  const changeQty = useCallback((itemId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((c) => c.id === itemId);
      if (!item) return prev;
      const newQty = Math.max(0, item.quantity + delta);
      if (newQty === 0) return prev.filter((c) => c.id !== itemId);
      return prev.map((c) => (c.id === itemId ? { ...c, quantity: newQty } : c));
    });
  }, []);

  const setQty = useCallback((itemId: string, value: string) => {
    const n = parseInt(value, 10);
    if (n > 0) {
      setCart((prev) =>
        prev.map((c) => (c.id === itemId ? { ...c, quantity: n } : c))
      );
    } else {
      setCart((prev) => prev.filter((c) => c.id !== itemId));
    }
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((c) => c.id !== itemId));
  }, []);

  const subtotal = useMemo(
    () => cart.reduce((s, c) => s + (c.quantity * c.unitPrice - c.lineDiscount), 0),
    [cart]
  );
  const bulkPct = Number(bulkDiscountPercent) || 0;
  const discountAmount = subtotal * (bulkPct / 100);
  const depositNum = Number(deposit) || 0;
  const total = Math.max(0, subtotal - discountAmount - depositNum);

  const selectedSalesperson = salespeople.find((s) => s.id === salespersonId);

  const handleSaveOrder = useCallback(
    async (confirm: boolean) => {
      setError(null);
      setSaving(true);
      try {
        const customerId = selectedCustomerId.trim() || undefined;
        const payload = {
          customerId: customerId || null,
          docType: "SALES_ORDER",
          projectName: projectName.trim() || null,
          fulfillmentMethod,
          deliveryAddress1: fulfillmentMethod === "DELIVERY" ? deliveryAddress.trim() : null,
          deliveryCity: fulfillmentMethod === "DELIVERY" ? (deliveryCity || "").trim() || null : null,
          deliveryState: fulfillmentMethod === "DELIVERY" ? (deliveryState || "").trim() || null : null,
          deliveryZip: fulfillmentMethod === "DELIVERY" ? (deliveryZip || "").trim() || null : null,
          discount: discountAmount,
          depositRequired: depositNum,
          salespersonName: selectedSalesperson?.name ?? null,
          commissionRate: 0,
          notes: notes.trim() || null,
          orderDate: orderDate || new Date().toISOString().slice(0, 10),
          requestedDeliveryAt: pickupDate || null,
          timeWindow: timeWindow.trim() || null,
          items: cart.map((c) => ({
            productId: c.productId,
            variantId: c.variantId,
            productSku: c.productSku,
            productTitle: c.productTitle,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            lineDiscount: c.lineDiscount,
          })),
        };
        const res = await fetch("/api/sales-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-role": role },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create order");
        const orderId = data.data?.id;
        if (confirm && orderId) {
          await fetch(`/api/sales-orders/${orderId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-user-role": role },
            body: JSON.stringify({ status: "CONFIRMED" }),
          });
        }
        router.push(`/orders/${orderId}?created=1&status=${confirm ? "confirmed" : "draft"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save order");
      } finally {
        setSaving(false);
      }
    },
    [
      role,
      selectedCustomerId,
      projectName,
      fulfillmentMethod,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryZip,
      orderDate,
      pickupDate,
      timeWindow,
      notes,
      discountAmount,
      depositNum,
      selectedSalesperson,
      cart,
      router,
    ]
  );

  const quickListProducts = useMemo(() => filteredProducts.slice(0, 4), [filteredProducts]);

  return (
    <div className={styles.posPage}>
      {error && <div className={styles.posError}>{error}</div>}

      <header className={styles.posTopbar}>
        <Link href="/orders" className={styles.posTopbarBack}>
          <ChevronDown style={{ transform: "rotate(90deg)" }} size={14} />
          Back
        </Link>
        <div className={styles.posTopbarIcon}>
          <ShoppingCart size={16} />
        </div>
        <div className={styles.posTopbarTitles}>
          <h1>New Sales Order</h1>
          <p>POS Order Entry</p>
        </div>
        <span className={styles.posBadge}>Draft</span>
        <div className={styles.posTopbarDivider} />
        <span className={styles.posWarehouseLabel}>Warehouse</span>
        <select
          className={styles.posWarehouseSelect}
          value={warehouse}
          onChange={(e) => setWarehouse(e.target.value)}
        >
          <option value="central">Central</option>
          <option value="north">North</option>
          <option value="south">South</option>
          <option value="east">East</option>
        </select>
        <div className={styles.posTopbarSpacer} />
        <div className={styles.posTopbarActions}>
          <button type="button" className={`${styles.posTbBtn} ${styles.ghost}`} onClick={() => router.push("/orders")}>
            <History size={14} />
            History
          </button>
          <button type="button" className={`${styles.posTbBtn} ${styles.ghost}`}>
            <Printer size={14} />
            Print
          </button>
          <div className={styles.posTopbarDivider} />
          <button type="button" className={`${styles.posTbBtn} ${styles.outline}`} onClick={() => router.push("/orders")}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.posTbBtn} ${styles.save}`}
            disabled={saving || cart.length === 0}
            onClick={() => handleSaveOrder(false)}
          >
            <Save size={13} />
            Save Draft
          </button>
          <button
            type="button"
            className={`${styles.posTbBtn} ${styles.confirm}`}
            disabled={saving || cart.length === 0}
            onClick={() => handleSaveOrder(true)}
          >
            <Check size={13} />
            Confirm Order
          </button>
        </div>
      </header>

      <div className={styles.posLayout}>
        {/* LEFT */}
        <aside className={styles.posLeft}>
          <div className={styles.posLeftHead}>
            <div className={styles.posLeftHeadTitle}>Product Search</div>
            <div className={styles.posSearchWrap}>
              <span className={styles.posSearchIcon}>🔍</span>
              <input
                className={styles.posSearchInput}
                placeholder="SKU, name, brand…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.posCategories}>
            <div
              className={styles.posCatHeader}
              onClick={() => setCategoriesCollapsed(!categoriesCollapsed)}
            >
              <span className={styles.posCatHeaderLabel}>Categories</span>
              <span className={styles.posCatActiveChip}>
                {CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? "All"}
              </span>
              <ChevronDown size={13} style={{ transform: categoriesCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }} />
            </div>
            <div className={`${styles.posCatBody} ${categoriesCollapsed ? styles.collapsed : ""}`}>
              {CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  className={`${styles.posCatItem} ${selectedCategory === cat.id ? styles.active : ""}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.label}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.posProductList}>
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className={styles.posProductCard}
                onClick={() => addToCart(p)}
              >
                <div className={styles.posProductCardTop}>
                  <div className={styles.posProductThumb}>IMG</div>
                  <div className={styles.posProductMeta}>
                    <div className={styles.posProductName}>{p.title ?? p.name}</div>
                    <div className={styles.posProductSku}>{p.sku}</div>
                  </div>
                </div>
                <div className={styles.posProductCardBottom}>
                  <span className={styles.posProductPrice}>${Number(p.price || 0).toFixed(2)}</span>
                  <span className={styles.posStockBadge}>{p.availableStock || 0} pcs</span>
                </div>
                <button
                  type="button"
                  className={styles.posAddBtn}
                  onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                >
                  + Add to Order
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER */}
        <main className={styles.posCenter}>
          <div className={styles.posCenterHead}>
            <ShoppingCart size={16} className={styles.posCenterHeadIcon} />
            <span className={styles.posCenterHeadTitle}>Order Cart</span>
            <span className={styles.posLinesBadge}>
              {cart.length} line{cart.length !== 1 ? "s" : ""}
            </span>
            <div className={styles.posCenterHeadSpacer} />
            <span className={styles.posBulkLabel}>Bulk discount</span>
            <input
              className={styles.posBulkInput}
              type="number"
              placeholder="%"
              value={bulkDiscountPercent}
              onChange={(e) => setBulkDiscountPercent(e.target.value)}
            />
            <div className={styles.posBulkPct}>%</div>
            <button type="button" className={styles.posBulkApply}>Apply</button>
          </div>
          <div className={styles.posSkuBar}>
            <input
              ref={skuInputRef}
              className={styles.posSkuInput}
              placeholder="Enter SKU and press Enter…"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBySku()}
              style={skuInputError ? { borderColor: "var(--pos-red)" } : undefined}
            />
            <button type="button" className={styles.posSkuAdd} onClick={addBySku}>Add</button>
          </div>
          <div className={styles.posCartArea}>
            {cart.length === 0 ? (
              <div className={styles.posEmptyState}>
                <div className={styles.posEmptyIcon}>🛒</div>
                <p>Cart is empty</p>
                <small>Enter SKU above or select products from the left</small>
              </div>
            ) : (
              <>
                <div className={styles.posCartTableHead}>
                  <span>Product</span>
                  <span>Qty</span>
                  <span style={{ textAlign: "right" }}>Price</span>
                  <span />
                </div>
                {cart.map((c) => (
                  <div key={c.id} className={styles.posCartRow}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.posRowPname}>{c.productTitle}</div>
                      <div className={styles.posRowPsku}>{c.productSku}</div>
                    </div>
                    <div className={styles.posQtyCtrl}>
                      <button type="button" className={styles.posQtyBtn} onClick={() => changeQty(c.id, -1)}>−</button>
                      <input
                        className={styles.posQtyNum}
                        type="number"
                        value={c.quantity}
                        min={1}
                        onChange={(e) => setQty(c.id, e.target.value)}
                      />
                      <button type="button" className={styles.posQtyBtn} onClick={() => changeQty(c.id, 1)}>+</button>
                    </div>
                    <div className={styles.posRowPrice}>
                      ${(c.quantity * c.unitPrice - c.lineDiscount).toFixed(2)}
                    </div>
                    <button type="button" className={styles.posDelBtn} onClick={() => removeItem(c.id)}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" className={styles.posAddLineBtn} onClick={() => skuInputRef.current?.focus()}>
                  + Add another line
                </button>
              </>
            )}
          </div>
          <div className={styles.posQuickSection}>
            <div className={styles.posQuickLabel}>Quick Add</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {quickListProducts.map((p) => (
                <div key={p.id} className={styles.posQuickItem} onClick={() => addToCart(p)}>
                  <span className={styles.posQuickSku}>{p.sku}</span>
                  <span className={styles.posQuickName}>{p.title ?? p.name}</span>
                  <span className={styles.posQuickPrice}>${Number(p.price || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* RIGHT */}
        <aside className={styles.posRight}>
          <div className={styles.posRightHead}>
            <div className={styles.posRightHeadRow}>
              <div className={styles.posRightHeadIcon}>$</div>
              <span className={styles.posRightHeadTitle}>Order Summary</span>
            </div>
            <div className={styles.posRightHeadSub}>Customer, delivery & totals</div>
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Customer</div>
            <div className={styles.posRField}>
              <select
                className={styles.posRSelect}
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.posQuickAddRow}>
              <span className={styles.posQuickAddHint}>Not in list?</span>
              <span className={styles.posQuickAddLink}>Quick Add +</span>
            </div>
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Salesperson</div>
            <div className={styles.posRField}>
              <select
                className={styles.posRSelect}
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value)}
              >
                <option value="">Select salesperson</option>
                {salespeople.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Project Name</div>
            <div className={styles.posRField}>
              <input
                className={styles.posRInput}
                placeholder="Optional"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Delivery / Pickup</div>
            <div className={styles.posDeliveryToggle}>
              <button
                type="button"
                className={`${styles.posToggleBtn} ${fulfillmentMethod === "PICKUP" ? styles.active : ""}`}
                onClick={() => setFulfillmentMethod("PICKUP")}
              >
                <Package size={13} />
                Pickup
              </button>
              <button
                type="button"
                className={`${styles.posToggleBtn} ${fulfillmentMethod === "DELIVERY" ? styles.active : ""}`}
                onClick={() => setFulfillmentMethod("DELIVERY")}
              >
                Delivery
              </button>
            </div>
            {fulfillmentMethod === "DELIVERY" && (
              <div className={styles.posRField} style={{ marginTop: 8 }}>
                <div className={styles.posRFieldLabel}>Delivery Address</div>
                <input className={styles.posRInput} placeholder="Street" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <input className={styles.posRInput} placeholder="City" value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} />
                  <input className={styles.posRInput} placeholder="State" value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} />
                </div>
                <input className={styles.posRInput} placeholder="ZIP" value={deliveryZip} onChange={(e) => setDeliveryZip(e.target.value)} style={{ marginTop: 8 }} />
              </div>
            )}
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Schedule</div>
            <div className={styles.posDateGrid}>
              <div className={styles.posRField}>
                <div className={styles.posRFieldLabel}>Order Date</div>
                <input className={styles.posRInput} type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className={styles.posRField}>
                <div className={styles.posRFieldLabel}>Pickup Date</div>
                <input className={styles.posRInput} type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
              </div>
            </div>
            <div className={styles.posRField} style={{ marginTop: 8 }}>
              <div className={styles.posRFieldLabel}>Time Window</div>
              <select className={styles.posRSelect} value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)}>
                <option value="">—</option>
                <option value="8:00-10:00">Morning (8am–12pm)</option>
                <option value="12:00-17:00">Afternoon (12pm–5pm)</option>
              </select>
            </div>
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Deposit ($)</div>
            <div className={styles.posRNumberWrap}>
              <div className={styles.posRNumberPrefix}>$</div>
              <input className={styles.posRInput} type="number" value={deposit} min={0} onChange={(e) => setDeposit(e.target.value)} />
            </div>
          </div>
          <div className={styles.posRSection}>
            <div className={styles.posRSectionLabel}>Notes</div>
            <textarea className={`${styles.posRInput} ${styles.posRTextarea}`} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className={styles.posTotalsSection}>
            <div className={styles.posTotalLine}>
              <span className={styles.posTotalLineLabel}>Subtotal</span>
              <span className={styles.posTotalLineVal}>${subtotal.toFixed(2)}</span>
            </div>
            <div className={styles.posTotalLine}>
              <span className={styles.posTotalLineLabel}>Discount</span>
              <span className={styles.posTotalLineVal}>{bulkPct ? `-$${discountAmount.toFixed(2)} (${bulkPct}%)` : "—"}</span>
            </div>
            <div className={styles.posTotalLine}>
              <span className={styles.posTotalLineLabel}>Deposit Paid</span>
              <span className={styles.posTotalLineVal}>{depositNum ? `-$${depositNum.toFixed(2)}` : "—"}</span>
            </div>
            <div className={styles.posTotalsDivider} />
            <div className={`${styles.posTotalLine} ${styles.grand}`}>
              <span className={styles.posTotalLineLabel}>Total</span>
              <span className={styles.posTotalLineVal}>${total.toFixed(2)}</span>
            </div>
            <button
              type="button"
              className={styles.posConfirmBtn}
              disabled={saving || cart.length === 0}
              onClick={() => handleSaveOrder(true)}
            >
              <Check size={15} />
              Confirm Order
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
