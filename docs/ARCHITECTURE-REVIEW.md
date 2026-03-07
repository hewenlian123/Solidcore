# Solidcore Architecture Review — Read-Only

**Date:** 2025-03-05  
**Scope:** Map current system to target module structure, workflow connectivity, and recommended implementation order.

---

## 1. Target workflow (required)

```
Quote → Sales Order → Fulfillment → Invoice → Payment → Return → Store Credit
```

---

## 2. What already exists

### 2.1 Sales

| Area | Status | Implementation |
|------|--------|----------------|
| **Sales Orders** | ✅ Exists | `/orders`, `/sales-orders`, `/sales-orders/new`, `/sales-orders/[id]`, `/sales-orders/edit/[orderId]`. APIs: GET/POST `/api/sales-orders`, GET/PATCH/DELETE `/api/sales-orders/[id]`, items, payments, status, convert, fulfillments. |
| **Quotes** | ✅ Exists | Same doc: `docType: "QUOTE"`. Status QUOTED. Convert quote → sales order via `/api/sales-orders/[id]/convert` (sets docType SALES_ORDER, status CONFIRMED). |
| **Invoices** | ✅ Exists | `/invoices`, `/invoices/[id]`. Create from SO: `POST /api/invoices/from-sales-order/[salesOrderId]`. Invoice linked to `salesOrderId`. Eligible SO statuses: CONFIRMED, READY, PARTIALLY_FULFILLED, FULFILLED. |
| **Payments** | ✅ Exists | Sales order payments: `/api/sales-orders/[id]/payments`. Invoice payments: `/api/invoices/[id]/payments`. Finance: `/finance/payments`. Payments post to SO and recalc order. |

**Sales Order detail:** Read-only preview / admin workspace. Edit / Edit Details / Edit Items → `/sales-orders/edit/[orderId]` (POS-style editor with order prefilled). ✅ Matches requirement.

---

### 2.2 Fulfillment (middle layer)

| Area | Status | Implementation |
|------|--------|----------------|
| **Fulfillment queue / dashboard** | ✅ Exists | `/fulfillment` (dashboard: today’s deliveries/pickups, overdue). `/fulfillment/[id]` (fulfillment detail: items, fulfilled qty, status, link to SO). `/outbound` (outbound queue). APIs: `/api/fulfillment`, `/api/fulfillment/[id]`, `/api/fulfillment/dashboard`, `/api/fulfillment/from-sales-order`, `/api/fulfillments`, `/api/fulfillments/[id]`, `/api/fulfillments/[id]/status`, `/api/fulfillments/outbound`. |
| **Fulfillment as middle layer** | ✅ Exists | SO CONFIRMED → `ensureFulfillmentFromSalesOrder` creates/updates `SalesOrderFulfillment` and `SalesOrderFulfillmentItem` from SO items. Fulfillment has type PICKUP/DELIVERY, status (DRAFT, SCHEDULED, PACKING, READY, IN_PROGRESS, COMPLETED, etc.). Fulfillment detail page shows SO and items; can set `fulfilledQty` per line. |
| **Picking** | ⚠️ Placeholder | `/warehouse/picking` — `PlaceholderPage` only. |
| **Packing** | ⚠️ Placeholder | `/warehouse/packing` — `PlaceholderPage` only. |
| **Pickup / Delivery** | ✅ Exists | Delivery: `/delivery` (schedule by date, uses fulfillment dashboard API). Fulfillment detail supports type PICKUP/DELIVERY; status flow to DELIVERED/PICKED_UP/COMPLETED. Inventory deduction on fulfillment final status (see below). |

---

### 2.3 Inventory logic (current behavior)

| Rule | Status | Implementation |
|------|--------|----------------|
| **Confirm SO → reserved increase** | ✅ Exists | `PATCH /api/sales-orders/[id]/status` with `status: "CONFIRMED"` → `applyReservedForSalesOrder(tx, id)`: sets `reservedAppliedAt`, increments `inventoryStock.reserved` per variant (and creates RESERVE movement). `syncInventoryReservationForSalesOrder` keeps reserved in sync with SO items (quantity − fulfillQty) for CONFIRMED/READY/PARTIALLY_FULFILLED. |
| **Fulfillment complete → onHand decrease, reserved decrease** | ✅ Exists | Two paths: (1) **Fulfillment-level:** When fulfillment reaches a final status (DELIVERED, PICKED_UP, COMPLETED), `deductInventoryForFulfillment` (in `lib/fulfillment-inventory.ts`) is called from `/api/fulfillments/[id]` or `/api/fulfillments/[id]/status`: sets `inventoryDeductedAt`, decrements `onHand`, reduces `reserved` per fulfillment item’s `fulfilledQty`, creates FULFILLMENT_DEDUCT movement. (2) **SO-level (flooring only):** When SO status → FULFILLED, `applyFlooringFulfillmentDeduction` decrements onHand and reserved for flooring boxes only. |
| **Return complete → onHand increase** | ✅ Exists | When return status → COMPLETED, `applyCompletedReturnInventory` in `lib/returns.ts` runs (from `PATCH /api/returns/[id]`): sets `completedAt`, increments `inventoryStock.onHand` per return item qty, creates RETURN_ADD movement. Return items are tied to fulfillment items (see below). |

---

### 2.4 After-Sales

| Area | Status | Implementation |
|------|--------|----------------|
| **Returns** | ✅ Exists | Under After-Sales: `/after-sales/returns`, `/returns`, `/returns/[id]`. APIs: `/api/returns`, `/api/returns/[id]`, `/api/after-sales/returns/[id]` (proxy to returns), `/api/returns/[id]/picker-items`, `/api/returns/[id]/pdf`. Two models: `AfterSalesReturn` (legacy?) and `SalesReturn`. |
| **Return items from fulfillment** | ✅ Exists | `SalesReturn` has `fulfillmentId`. `SalesReturnItem` has `fulfillmentItemId` (FK to `SalesOrderFulfillmentItem`). Picker-items API loads fulfillment items for the return’s SO/fulfillment and exposes `fulfillmentItemId`, `fulfilledQty`, `maxReturnable` (fulfilled − already returned). Return lines are created/updated by `fulfillmentItemId` and qty. ✅ Returns stay under After-Sales and items come from fulfillment items. |
| **Store Credit** | ✅ Exists | `/after-sales/store-credit`, `/store-credit`. APIs: `/api/store-credits`, `/api/store-credits/[id]`. `ensureStoreCreditForCompletedReturn` creates store credit when return is COMPLETED and `issueStoreCredit` is true. Invoice apply store credit: `/api/invoices/[id]/apply-store-credit`. |

**Tickets** | ✅ Exists | Under After-Sales: `/after-sales` (Tickets), `/tickets`. APIs: `/api/sales-orders/[id]/tickets`, etc.

---

### 2.5 Inventory

| Area | Status | Implementation |
|------|--------|----------------|
| **Overview** | ✅ Exists | `/inventory` (summary). API: `/api/inventory/summary`. |
| **Products** | ✅ Exists | `/products`, `/products/[id]`. Full CRUD, variants, gallery, inventory, stock. |
| **Stock levels** | ✅ Exists | `/inventory/stock`, `/warehouses`. APIs: product/variant stock, warehouses. |
| **Reorder list** | ✅ Exists | `/inventory/reorder`. API: `/api/inventory/reorder`, batches. |
| **Movements** | ✅ Exists | `/inventory/movements`. API: `/api/inventory/movements`, export. |
| **Warehouses** | ✅ Exists | `/warehouses`, `/warehouses/[id]`. APIs: `/api/warehouses`. |

---

### 2.6 Purchasing

| Area | Status | Implementation |
|------|--------|----------------|
| **Purchase Orders** | ✅ Exists | `/purchasing/orders`. API: `/api/purchase-orders`. |
| **Suppliers** | ✅ Exists | `/suppliers`, `/suppliers/[id]`. APIs: `/api/suppliers`. |
| **Receiving** | ✅ Exists | `/purchasing/receiving`. |
| **Vendor Bills** | ✅ Exists | `/purchasing/bills`. |

---

### 2.7 Finance

| Area | Status | Implementation |
|------|--------|----------------|
| **Revenue** | ✅ Exists | `/finance/revenue`. |
| **Expenses** | ✅ Exists | `/finance/expenses`. |
| **Profit** | ✅ Exists | `/finance/profit`. `/finance` shows P&amp;L, receivables, cashflow. API: `/api/finance`, `/api/finance/payments`. |
| **Reports** | ✅ Exists | `/reports`. API: `/api/reports`. |

---

### 2.8 Analytics

| Area | Status | Implementation |
|------|--------|----------------|
| **Analytics hub** | ⚠️ Placeholder | `/analytics` — “Coming soon.” |
| **Sales Analytics** | ⚠️ Placeholder | `/analytics/sales` — PlaceholderPage. |
| **Inventory Analytics** | ✅ Exists | `/analytics/inventory` — real page. |
| **Customer Analytics** | ⚠️ Placeholder | `/analytics/customers` — PlaceholderPage. |

---

## 3. Navigation (sidebar) vs target structure

**Current sidebar:** Overview (Dashboard), Sales (Orders [matches /orders + /sales-orders], Price List, Invoices, Customers, After-Sales [Tickets, Returns, Store Credit]), Fulfillment (Fulfillment Dashboard, Outbound Queue, Delivery Schedule), Inventory (Summary, Products, Reorder List, Movements, Stock/Locations, Suppliers), Finance (Finance, Payments, Reports), Settings.

**Gaps vs target:**

- Sales: “Orders” mixes orders and sales-orders; no explicit “Quotes” entry (quotes are same doc type).
- Fulfillment: No “Fulfillment Queue” or “Picking”/“Packing” as first-class; Picking/Packing live under warehouse and are placeholders.
- Purchasing: Not in sidebar (Suppliers is under Inventory). Purchasing (PO, Receiving, Bills) exists as pages but not as a nav group.
- Analytics: Only one real sub-page (inventory); sales/customers are placeholders.

---

## 4. What is missing or weak

1. **Fulfillment queue as primary entry**  
   Fulfillment dashboard exists but nav could better emphasize “Fulfillment Queue” and make it the main entry between SO and Pickup/Delivery.

2. **Picking & packing**  
   Placeholder pages only. No integration with fulfillment items (e.g. pick list from fulfillment, pack by fulfillment, then mark fulfillment complete).

3. **Unified Quote entry**  
   Quotes are SOs with docType QUOTE; no dedicated “Quotes” list or filter in nav. Optional: a “Quotes” view/filter under Sales.

4. **Purchasing as its own module in nav**  
   Purchasing pages exist; not grouped under a “Purchasing” section in the sidebar.

5. **Analytics**  
   Only inventory analytics is implemented; sales and customer analytics are placeholders.

6. **Dual return models**  
   Both `AfterSalesReturn` and `SalesReturn` exist; after-sales returns API proxies to returns. Clarify single source of truth and whether to migrate fully to SalesReturn.

7. **SO → Fulfillment status alignment**  
   SO has READY, PARTIALLY_FULFILLED, FULFILLED; fulfillment has its own statuses. When fulfillment is COMPLETED/DELIVERED/PICKED_UP, inventory is deducted via `deductInventoryForFulfillment`. SO status can also be set to FULFILLED (triggering flooring-only deduction). Ensure one clear path (e.g. fulfillment completion drives both inventory and SO state) to avoid double deduction or confusion.

---

## 5. Workflow connectivity summary

| Link | Connected? | Notes |
|------|------------|--------|
| Quote → Sales Order | ✅ | Convert API; docType QUOTE → SALES_ORDER, status CONFIRMED. |
| Sales Order → Fulfillment | ✅ | CONFIRMED → ensureFulfillmentFromSalesOrder; fulfillments and fulfillment items created from SO. |
| Fulfillment → Pickup/Delivery | ✅ | Fulfillment type PICKUP/DELIVERY; delivery schedule and fulfillment detail drive execution. |
| Fulfillment complete → Inventory | ✅ | deductInventoryForFulfillment on final status; onHand decrement, reserved decrement. |
| Sales Order → Invoice | ✅ | Create invoice from SO; invoice.salesOrderId. |
| Invoice → Payment | ✅ | Payments on invoice; recalc SO. |
| Return → Fulfillment items | ✅ | Return items reference fulfillmentItemId; picker limits to fulfilled qty. |
| Return complete → Inventory | ✅ | applyCompletedReturnInventory; onHand increment. |
| Return → Store Credit | ✅ | ensureStoreCreditForCompletedReturn when COMPLETED and issueStoreCredit. |

---

## 6. Recommended implementation order

1. **Navigation and module clarity (no new backend)**  
   - Add **Purchasing** nav group: Purchase Orders, Suppliers, Receiving, Vendor Bills (link to existing routes).  
   - Optionally add **Quotes** under Sales (e.g. filter or view on existing sales-orders list).  
   - Rename or add “Fulfillment Queue” as the main Fulfillment entry if desired.

2. **Picking (fulfillment-centric)**  
   - Implement picking UI that consumes **fulfillment items** (from SalesOrderFulfillmentItem): list by fulfillment or by outbound queue, allow “picked” state or notes.  
   - Keep inventory deduction where it is (on fulfillment completion); picking can be a pre-step that updates fulfillment item state or notes only, unless you explicitly want “picked” to reserve in a different way.

3. **Packing (fulfillment-centric)**  
   - Packing UI per fulfillment: confirm items packed, set fulfilled qty if not already set, then transition fulfillment to READY or final status so that existing `deductInventoryForFulfillment` runs when status becomes DELIVERED/PICKED_UP/COMPLETED.  
   - Ensures fulfillment remains the single place where inventory is decremented.

4. **SO ↔ Fulfillment status consistency**  
   - When a fulfillment is marked COMPLETED/DELIVERED/PICKED_UP and inventory is deducted, consider updating SO status (e.g. PARTIALLY_FULFILLED / FULFILLED) from the same flow so that flooring deduction and SO state stay in sync and no double deduction occurs.

5. **Analytics**  
   - Replace placeholders for Sales Analytics and Customer Analytics with real dashboards (using existing APIs: orders, invoices, payments, customers).

6. **Returns model**  
   - Decide whether all returns use `SalesReturn` (fulfillment-item-based) and migrate or hide `AfterSalesReturn`; then simplify after-sales returns API to one model.

---

## 7. Files reference (no changes made)

- **Sales:** `app/sales-orders/*`, `app/orders/*`, `app/invoices/*`, `app/api/sales-orders/*`, `app/api/invoices/*`, `app/sales-orders/entry-content.tsx`.  
- **Fulfillment:** `app/fulfillment/*`, `app/delivery/page.tsx`, `app/outbound/page.tsx`, `app/api/fulfillment/*`, `app/api/fulfillments/*`, `lib/fulfillment.ts`, `lib/fulfillment-inventory.ts`.  
- **Inventory:** `lib/sales-orders.ts` (reserve, release, sync, flooring deduction), `app/inventory/*`, `app/api/inventory/*`, `app/products/*`, `app/warehouses/*`.  
- **Returns:** `app/after-sales/returns/*`, `app/returns/*`, `app/api/returns/*`, `app/api/after-sales/returns/*`, `lib/returns.ts`.  
- **Store Credit:** `app/after-sales/store-credit`, `app/store-credit`, `app/api/store-credits/*`.  
- **Purchasing:** `app/purchasing/*`, `app/suppliers/*`, `app/api/purchase-orders/*`, `app/api/suppliers/*`.  
- **Finance:** `app/finance/*`, `app/api/finance/*`.  
- **Analytics:** `app/analytics/*`.  
- **Nav:** `components/layout/sidebar.tsx`.

---

**Summary:** The workflow Quote → Sales Order → Fulfillment → Invoice → Payment → Return → Store Credit is implemented and connected. Fulfillment is the middle layer; return items come from fulfillment items; inventory rules (reserve on confirm, deduct on fulfillment complete, add on return complete) are in place. Sales Order detail is read-only with Edit opening the POS editor. Gaps are mainly: picking/packing as real flows, nav alignment to target modules, analytics content, and optional cleanup of return model and SO/fulfillment status consistency.
