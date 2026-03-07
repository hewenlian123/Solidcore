# Phase 1 — Navigation Cleanup and Module Connection

**Status:** Complete  
**Build:** ✅ `npm run build` succeeded (Next.js 16.1.6)

---

## 1. Routes connected

All sidebar and AppShell nav entries now point to the canonical routes below. Existing pages and APIs were reused; no new routes were added.

| Module | Sidebar label | Canonical route | Notes |
|--------|----------------|-----------------|--------|
| **Sales** | Sales Orders | `/orders` | List/detail remain; detail deep links still use `/sales-orders/[id]` where implemented. |
| | Quotes | `/orders?docType=QUOTE` | Reuses orders list with QUOTE filter. |
| | Invoices | `/invoices` | Unchanged. |
| | Payments | `/finance/payments` | Unchanged. |
| | Returns | `/after-sales/returns` | Unchanged. |
| | Customers | `/customers` | Unchanged. |
| **Fulfillment** | Fulfillment Queue | `/fulfillment/outbound` | Unchanged. |
| | Pickup | `/fulfillment` | Unchanged. |
| | Delivery | `/delivery` | Unchanged. |
| | Picking | `/warehouse/picking` | Unchanged. |
| | Packing | `/warehouse/packing` | Unchanged. |
| **Inventory** | Overview | `/inventory` | Unchanged. |
| | Products | `/products` | Unchanged. |
| | Stock Levels | `/inventory/stock` | Unchanged. |
| | Reorder List | `/inventory/reorder` | Unchanged. |
| | Movements | `/inventory/movements` | Unchanged. |
| | Warehouses | `/warehouses` | Unchanged. |
| **Purchasing** | Purchase Orders | `/purchasing/orders` | Unchanged. |
| | Suppliers | `/suppliers` | Unchanged. |
| | Receiving | `/purchasing/receiving` | Unchanged. |
| | Vendor Bills | `/purchasing/bills` | Unchanged. |
| **Price Management** | Price List | `/price-list` | Unchanged. |
| | Margin Control | `/price-management/margin` | Unchanged. |
| | Promotions | `/price-management/promotions` | Unchanged. |
| **After-Sales** | Tickets | `/after-sales` | Ticket board. |
| | Store Credit | `/after-sales/store-credit` | Unchanged. |
| **Finance** | Revenue | `/finance/revenue` | Unchanged. |
| | Expenses | `/finance/expenses` | Unchanged. |
| | Profit | `/finance/profit` | Unchanged. |
| | Reports | `/reports` | Unchanged. |
| **Analytics** | Sales Analytics | `/analytics/sales` | Unchanged. |
| | Inventory Analytics | `/analytics/inventory` | Unchanged. |
| | Customer Analytics | `/analytics/customers` | Unchanged. |
| **Settings** | Settings | `/settings` | Unchanged. |

---

## 2. Duplicate modules removed from navigation

Sidebar and AppShell no longer link to these as primary entries (canonical route used instead):

| Removed from nav | Replaced by |
|------------------|-------------|
| `/sales-orders` (list) | `/orders` |
| `/sales-orders?docType=QUOTE` | `/orders?docType=QUOTE` |
| `/returns` | `/after-sales/returns` |
| `/store-credit` | `/after-sales/store-credit` (AppShell: “Customer Credit” → “Store Credit” → canonical route) |
| Standalone `/tickets` | `/after-sales` (ticket board) |
| `/outbound` | `/fulfillment/outbound` (Fulfillment Queue) |

**Note:** Routes such as `/sales-orders`, `/returns`, `/store-credit`, `/tickets`, `/outbound` still exist in the app and in RBAC for deep links and backward compatibility. Only the **sidebar/AppShell links** were changed so users are directed to the canonical URLs above.

---

## 3. Sidebar changes

### File: `components/layout/sidebar.tsx`

- **Overview:** Dashboard → `/dashboard` (unchanged).
- **Sales:**  
  - Sales Orders → `/orders` (was `/orders` with `matchStartsWith` including `/sales-orders`; now only `/orders`).  
  - Quotes → `/orders?docType=QUOTE` (was `/sales-orders?docType=QUOTE`).  
  - Removed “Price List” from Sales (moved to Price Management).  
  - Removed nested “After-Sales” group from Sales (Tickets, Returns, Store Credit moved to dedicated sections).  
  - Returns → `/after-sales/returns`.  
  - Invoices, Payments, Customers unchanged.
- **Fulfillment:**  
  - Order set to: Fulfillment Queue → Pickup → Delivery → Picking → Packing.  
  - All links canonical (`/fulfillment/outbound`, `/fulfillment`, `/delivery`, `/warehouse/picking`, `/warehouse/packing`).  
  - Removed any nav to `/outbound`.
- **Inventory:** Unchanged (Overview, Products, Stock Levels, Reorder List, Movements, Warehouses).
- **Purchasing:** Unchanged.
- **Price Management (new group):** Price List, Margin Control, Promotions (all canonical).
- **After-Sales (new group):** Tickets → `/after-sales`, Store Credit → `/after-sales/store-credit`.
- **Finance:** Replaced previous “Finance” + “Payments” + “Reports” with: Revenue, Expenses, Profit, Reports (all canonical).
- **Analytics (new group):** Sales Analytics, Inventory Analytics, Customer Analytics (all canonical).
- **Settings:** Single entry “Settings” → `/settings` (label was “System Settings”).
- **Prefetch:** `fastPrefetchRoutes` updated to use `/orders` instead of `/sales-orders`.
- **Types:** `NavGroup` key extended with `priceManagement`, `afterSales`, `analytics`.  
- **Icons:** Added `Tag`, `Ticket` for Price Management and After-Sales.

### File: `components/layout/AppShell.tsx`

- **Sales:** Parent href and all child links switched to canonical routes: Sales Orders `/orders`, Quotes `/orders?docType=QUOTE`, Returns `/after-sales/returns`; `matchStartsWith` updated accordingly. Removed `/sales-orders` and `/returns` from nav.
- **Customers:** “Customer Credit” renamed to “Store Credit” and link changed from `/store-credit` to `/after-sales/store-credit`; `matchStartsWith` updated.
- **Warehouse:** Added “Fulfillment Queue” → `/fulfillment/outbound` and “Pickup” → `/fulfillment`; parent href set to `/fulfillment/outbound`. Removed `/outbound` from `matchStartsWith`.
- **Prefetch:** `fastPrefetchRoutes` updated to use `/orders` instead of `/sales-orders`.

---

## 4. Build status

- **Command:** `npm run build` (Next.js 16.1.6, webpack).
- **Result:** ✅ Compiled successfully; static/dynamic routes generated (116 pages).
- **Lint:** No linter errors on `components/layout/sidebar.tsx` or `components/layout/AppShell.tsx`.

No new features or pages were added; only navigation and link targets were updated to the canonical routes above.
