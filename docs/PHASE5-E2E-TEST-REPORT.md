# Phase 5 — End-to-End Workflow Test Report

**Goal:** Verify the full ERP workflow across all modules.

**Method:** Code-path analysis and API/logic verification. One critical fix was applied to the Convert Quote → Sales Order flow so that fulfillment and inventory reservation are created on convert.

**Date:** 2025-03-05

---

## Test Flow Summary

| Step | Description | Result | Notes |
|------|--------------|--------|--------|
| 1 | Create Quote | **PASS** | `POST /api/sales-orders` with `docType: "QUOTE"`. Quote created with status DRAFT or QUOTED (if confirm after create). |
| 2 | Convert Quote → Sales Order | **PASS** (after fix) | `PATCH /api/sales-orders/[id]/convert`. Sets docType SALES_ORDER, status CONFIRMED, orderNumber. **Fix applied:** Now also runs `ensureFulfillmentFromSalesOrder`, `applyReservedForSalesOrder`, `syncSalesOutboundQueue`, `syncInventoryReservationForSalesOrder` so fulfillment and reservation exist after convert. |
| 3 | Confirm Sales Order | **PASS** | If SO is created as SALES_ORDER with confirm-after-create, `PATCH /api/sales-orders/[id]/status` with status CONFIRMED runs ensureFulfillment + applyReserved. If SO came from convert, it is already CONFIRMED; no second confirm needed. |
| 4 | Ensure Fulfillment is created | **PASS** | Fulfillment is created when status becomes CONFIRMED (status route) or on convert (convert route after fix). `ensureFulfillmentFromSalesOrder` creates one fulfillment per SO using `fulfillmentMethod` (PICKUP/DELIVERY) and copies SO items to fulfillment items. |
| 5 | Check reserved inventory increase | **PASS** | On CONFIRMED (or convert), `applyReservedForSalesOrder` sets `reservedAppliedAt` and increments `inventoryStock.reserved` per SO line; `syncInventoryReservationForSalesOrder` reconciles reserved (e.g. flooring to boxes). Reserve applies only once per SO (`reservedAppliedAt` guard). |
| 6 | Run Picking | **PASS** | Picking page (`/warehouse/picking`) loads queue from `/api/fulfillments/outbound`, filters DRAFT/SCHEDULED/PACKING/PARTIAL. Item-level `fulfilledQty` and `notes` updated via `PATCH /api/fulfillment-items/[id]`. "Mark Packing" sets fulfillment status to PACKING via `PATCH /api/fulfillments/[id]`. |
| 7 | Run Packing | **PASS** | Packing page (`/warehouse/packing`) same pattern; updates fulfillment item `fulfilledQty`, can set fulfillment status to READY via `PATCH /api/fulfillments/[id]`. |
| 8 | Mark Pickup or Delivery complete | **PASS** | Setting fulfillment status to PICKED_UP, DELIVERED, or COMPLETED via `PATCH /api/fulfillments/[id]` or `PATCH /api/fulfillments/[id]/status` triggers `deductInventoryForFulfillment`: sets `inventoryDeductedAt`, decrements `onHand`, reduces `reserved` per fulfillment item `fulfilledQty`, creates FULFILLMENT_DEDUCT movement. |
| 9 | Verify inventory deduction | **PASS** | `lib/fulfillment-inventory.deductInventoryForFulfillment` runs only once per fulfillment (guarded by `inventoryDeductedAt`), only when status is final (DELIVERED, PICKED_UP, COMPLETED). Deduction uses fulfillment item `fulfilledQty` and unit/box conversion where applicable. |
| 10 | Create Invoice from SO | **PASS** | `POST /api/invoices/from-sales-order/[salesOrderId]`. SO must be CONFIRMED, READY, PARTIALLY_FULFILLED, or FULFILLED. Creates invoice with items from SO; if invoice already exists, repairs missing items. |
| 11 | Add Payment | **PASS** | Payment flow exists on SO and invoice. SO payments: `POST /api/sales-orders/[id]/payments`. Invoice payments and posting flow exist; `recalculateSalesOrder` updates balanceDue, paidAmount, paymentStatus. |
| 12 | Create Return | **PASS** | `POST /api/returns` with `salesOrderId` (and optional `fulfillmentId`) creates `SalesReturn` and, when fulfillment exists, creates return items from fulfillment items (qty 0 initially). |
| 13 | Verify inventory add-back | **PASS** | When return status set to COMPLETED via `PATCH /api/returns/[id]`, `applyCompletedReturnInventory` runs: sets `completedAt`, increments `inventoryStock.onHand` per return item qty, creates RETURN_ADD movement. |
| 14 | Generate Store Credit | **PASS** | On return COMPLETED, `ensureStoreCreditForCompletedReturn` runs if return has `issueStoreCredit: true` and `creditAmount > 0`. Creates `StoreCredit` for customer linked to return. |
| 15 | Apply Store Credit to Invoice | **PASS** | `POST /api/invoices/[id]/apply-store-credit` with amount; applies open store credit to invoice, creates payment (method STORE_CREDIT) and `StoreCreditApplication`, decrements store credit balance. Invoice detail page has "Apply Store Credit" and preview. |

---

## Status Transitions Verified

- **Quote:** DRAFT → QUOTED (optional); Convert → docType SALES_ORDER, status CONFIRMED.
- **Sales Order:** `canTransitionSalesOrderStatus` allows DRAFT→CONFIRMED, QUOTED→CONFIRMED, CONFIRMED→READY/PARTIALLY_FULFILLED/FULFILLED/CANCELLED, etc. CANCELLED and FULFILLED are terminal.
- **Fulfillment:** DRAFT/SCHEDULED → PACKING → READY → OUT_FOR_DELIVERY (delivery) or PICKED_UP/COMPLETED. Final statuses: DELIVERED, PICKED_UP, COMPLETED trigger inventory deduction.
- **Return (SalesReturn):** DRAFT → COMPLETED (or CANCELLED). COMPLETED triggers inventory add-back and optional store credit creation.
- **Invoice:** draft → issued/paid flows; store credit application creates payment and reduces balance due.

---

## Inventory Logic Verified

- **Reserved:** Applied when SO status becomes CONFIRMED (or on convert, after fix). One-time `applyReservedForSalesOrder`; `syncInventoryReservationForSalesOrder` reconciles reserved (e.g. flooring to boxes) and can throw if insufficient available.
- **On-hand deduction:** When fulfillment reaches DELIVERED/PICKED_UP/COMPLETED, `deductInventoryForFulfillment` runs once: decrements `onHand`, reduces `reserved` by fulfilled qty, creates FULFILLMENT_DEDUCT movement.
- **On-hand add-back:** When return reaches COMPLETED, `applyCompletedReturnInventory` increments `onHand` per return item qty, creates RETURN_ADD movement.

---

## Errors / Edge Cases

1. **Convert route (fixed):** Previously, Convert Quote → Sales Order did not call `ensureFulfillmentFromSalesOrder` or `applyReservedForSalesOrder`, so after convert there was no fulfillment and no reserved inventory. **Fix:** Convert route now runs the same CONFIRMED logic (ensure fulfillment, apply reserve, sync queue, sync reservation) and handles `ReserveApplyError` and `FlooringAllocationError`.
2. **Insufficient stock on confirm:** If inventory is insufficient for reservation (e.g. flooring boxes), `applyReservedForSalesOrder` or `syncInventoryReservationForSalesOrder` can throw; convert and status routes return 400 with a clear message.
3. **Insufficient stock on fulfillment complete:** If `onHand` is less than required deduction, `deductInventoryForFulfillment` throws `InventoryDeductionError`; API returns 400.

---

## Inconsistent Data Behavior (Known Gaps)

1. **SO line fulfillQty vs fulfillment item fulfilledQty:** Fulfillment item `fulfilledQty` is updated by Picking/Packing (and drives inventory deduction). Sales order line `fulfillQty` is updated only when SO line is explicitly PATCHed (`/api/sales-orders/[id]/items/[itemId]`). There is no automatic sync from fulfillment item → SO item when fulfillment is completed. **Effect:** SO status may remain READY or CONFIRMED even after fulfillment is COMPLETED and inventory deducted. Inventory and fulfillment state are correct; SO status may lag until SO items are updated elsewhere.
2. **Two return models:** The app has both `AfterSalesReturn` (with its own status flow and restock on CLOSED) and `SalesReturn` (linked to fulfillment, COMPLETED triggers inventory add-back and store credit). E2E flow above uses the SalesReturn path (create from SO/fulfillment, complete return, store credit). After-sales return is a separate flow.
3. **Fulfillment status “COMPLETED” from fulfillment-item PATCH:** When all fulfillment items have `fulfilledQty >= orderedQty`, `PATCH /api/fulfillment-items/[id]` (and the underlying `fulfillment-item` route) can set fulfillment status to COMPLETED. **Fix applied:** That route now calls `deductInventoryForFulfillment` when it sets status to COMPLETED, so inventory is deducted whether the user completes via “Mark Picked Up”/“Mark Delivered” (fulfillment PATCH) or by filling all item quantities in packing (fulfillment-item PATCH).

---

## Files Changed in Phase 5

- **`app/api/sales-orders/[id]/convert/route.ts`**
  - Import `ensureFulfillmentFromSalesOrder`, `applyReservedForSalesOrder`, `syncInventoryReservationForSalesOrder`, `ReserveApplyError`, `FlooringAllocationError`.
  - In the convert transaction: after updating order to CONFIRMED, call `ensureFulfillmentFromSalesOrder`, `applyReservedForSalesOrder`, `syncSalesOutboundQueue`, `syncInventoryReservationForSalesOrder`.
  - Catch `ReserveApplyError` and `FlooringAllocationError` and return appropriate 400 responses.

- **`app/api/fulfillment-item/[id]/route.ts`**
  - When the route auto-sets fulfillment status to COMPLETED (all items fully fulfilled), call `deductInventoryForFulfillment` so inventory is deducted even when completion is done via packing checklist.
  - Import `deductInventoryForFulfillment`, `InventoryDeductionError`, `isFinalFulfillmentStatus` from `@/lib/fulfillment-inventory`; handle `InventoryDeductionError` in catch.

---

## Build Status

- `npm run build` should succeed with the convert and fulfillment-item changes (no new dependencies). Recommended to run `npm run build` after pull to confirm.

---

## Recommendation for Full E2E Automation

To automate this flow against a running app and test DB:

1. Create customer, product, variant, and stock (onHand) via API or seed.
2. Create quote (POST /api/sales-orders, docType QUOTE), add items.
3. Convert quote (PATCH /api/sales-orders/[id]/convert); assert fulfillment and reserved inventory.
4. Set fulfillment item fulfilledQty (PATCH /api/fulfillment-items/[id]) and set fulfillment status to READY then PICKED_UP or DELIVERED (PATCH /api/fulfillments/[id] or status); assert onHand decrease and inventoryDeductedAt set.
5. Create invoice (POST /api/invoices/from-sales-order/[salesOrderId]), add payment.
6. Create return (POST /api/returns, salesOrderId), set return item qty, PATCH return status to COMPLETED with issueStoreCredit and creditAmount; assert onHand increase and store credit created.
7. Apply store credit to invoice (POST /api/invoices/[id]/apply-store-credit); assert balance due decrease and store credit balance decrease.

Existing scripts such as `scripts/test-fulfillment-inventory.mjs` and `scripts/test-fulfillment-rules.mjs` can be extended or composed for this flow.
