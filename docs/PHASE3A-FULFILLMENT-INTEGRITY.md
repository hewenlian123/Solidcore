# Phase 3A-0 Fulfillment Integrity

**Validated:** 2026-07-19

This document is the current source of truth for SolidCore fulfillment and inventory deduction behavior after Phase 3A-0.

## Business Ownership

- Sales Order remains the master transaction.
- Fulfillment remains linked to the Sales Order through `SalesOrderFulfillment`.
- There is no parallel fulfillment or order system.
- Phase 3A-0 did not add Warehouse UI, picking queues, packing queues, barcode scanning, receiving, transfers, invoice/payment behavior, pricing, tax, or discount logic.

## Canonical Helpers

Current fulfillment inventory writes are owned by `lib/fulfillment-inventory.ts`:

- `setFulfillmentItemFulfilledQuantity`
- `setFulfillmentStatus`
- `isInventoryDeductionError`

`deductInventoryForFulfillment` remains as a compatibility wrapper only. It delegates final-status fulfillment work back through `setFulfillmentStatus`; it is not the primary current architecture.

## Status Rules

Sales Order statuses are:

- `DRAFT`
- `QUOTED`
- `CONFIRMED`
- `READY`
- `PARTIALLY_FULFILLED`
- `FULFILLED`
- `CANCELLED`

Fulfillment statuses are:

- `DRAFT`
- `SCHEDULED`
- `PACKING`
- `READY`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `PICKED_UP`
- `OUT`
- `PARTIAL`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

Rules:

- `DRAFT`, `QUOTED`, and `CANCELLED` Sales Orders cannot be fulfilled.
- `CONFIRMED`, `READY`, and `PARTIALLY_FULFILLED` Sales Orders mutate fulfillment through the canonical fulfillment helpers.
- Final fulfillment statuses are `DELIVERED`, `PICKED_UP`, and `COMPLETED`.
- Repeating a final fulfillment action is idempotent and does not double-deduct inventory.
- Direct Sales Order status mutation to `FULFILLED` through `/api/sales-orders/[id]/status` is rejected.
- Direct Sales Order item `fulfillQty` mutation through `/api/sales-orders/[id]/items/[itemId]` is rejected.

## Inventory Rules

- Inventory deduction is movement-delta based.
- The target deducted stock quantity is calculated from the requested fulfilled quantity and current selling unit.
- Flooring square-foot lines continue to convert to boxes using the variant `boxSqft` rule.
- Previously deducted quantity is read from persisted `InventoryMovement` rows with type `FULFILLMENT_DEDUCT`.
- Only the positive delta between target deducted quantity and already deducted quantity is deducted from `InventoryStock.onHand`.
- Each deduction creates linked `InventoryMovement` evidence with `fulfillmentId` and `fulfillmentItemId`.
- Insufficient stock fails before the transaction commits.
- Other orders and unrelated variants must remain unchanged.

`inventoryDeductedAt` remains a status/timestamp field, not the primary idempotency guard.

## Reservation Rules

- Reservation is the aggregate active demand for reserving Sales Orders.
- `syncInventoryReservationForSalesOrder` recalculates reservation after fulfillment mutations.
- Partial fulfillment leaves the remaining unfulfilled demand reserved.
- Completing one order releases only that order's fulfilled demand.
- Fulfilling one order must not release another order's active reservation.

## Transaction Rules

Inventory, movement, fulfillment item quantity, Sales Order item `fulfillQty`, fulfillment status, Sales Order status, outbound queue, and reservation synchronization are performed inside Prisma transactions through the calling API routes.

The canonical helpers use row locks for fulfillment rows and inventory stock rows where stock deduction is needed. Failure rolls back stock, movements, fulfillment quantities, statuses, outbound queue changes, and reservation changes.

## Route Rules

Routes that delegate to the canonical helper:

- `PATCH /api/fulfillment-item/[id]` delegates quantity changes to `setFulfillmentItemFulfilledQuantity`.
- `PATCH /api/fulfillments/[id]` delegates status changes to `setFulfillmentStatus`.
- `PATCH /api/fulfillments/[id]/status` delegates quick status changes to `setFulfillmentStatus`.
- `PATCH /api/fulfillment/[id]` remains a legacy route and delegates status changes to `setFulfillmentStatus`.
- `PATCH /api/sales-orders/[id]/fulfillments/[fulfillmentId]` remains a legacy Sales Order wrapper and delegates status changes to `setFulfillmentStatus`.

Routes that reject unsafe direct mutation:

- `PATCH /api/sales-orders/[id]/items/[itemId]` rejects direct `fulfillQty` mutation.
- `PATCH /api/sales-orders/[id]/status` rejects direct status mutation to `FULFILLED`.

Read-only or document routes:

- `GET /api/fulfillments/[id]` reads fulfillment detail.
- `GET /api/fulfillment/[id]` reads legacy fulfillment detail.
- `GET /api/fulfillments/[id]/pdf` generates the fulfillment PDF from existing records.
- `GET /api/fulfillments/outbound` reads the outbound queue.

## Deterministic Test Commands

Current deterministic fulfillment commands:

- `npm run test:fulfillment-rules`
- `npm run test:fulfillment-inventory`
- `npm run test:fulfillment-pdf`
- `npm run test:fulfillment-e2e`
- `npx playwright test tests/sales-order-fulfillment-integrity.spec.ts --reporter=list`

The old arbitrary-row fulfillment rule and inventory scripts were retired. `test:fulfillment-rules` and `test:fulfillment-inventory` both run the deterministic canonical Playwright suite. `test:fulfillment-pdf` creates and cleans its own local fixture.

## Deterministic Coverage

`tests/sales-order-fulfillment-integrity.spec.ts` verifies:

- full completion deducts once and fulfills the Sales Order.
- repeated completion is idempotent.
- shared variants preserve other confirmed order reservations.
- partial quantity deducts only the new delta and keeps remaining reservation.
- `DRAFT`, `QUOTED`, and `CANCELLED` orders cannot fulfill and do not mutate.
- insufficient stock rejects without mutation.
- intermediate failure rolls back stock, movements, status, reservation, and financial fields.
- legacy fulfillment routes delegate to canonical completion.
- direct Sales Order item `fulfillQty` mutation is rejected.
- direct Sales Order `FULFILLED` status mutation is rejected.
- unrelated variants are not mutated.
- financial fields, invoices, and payments are not mutated by fulfillment.
- concurrent duplicate completion creates one logical deduction only.

## Current Limitations

- The schema permits one `SalesOrderFulfillment` per Sales Order through `SalesOrderFulfillment.salesOrderId @unique`.
- There is no deducted-fulfillment reversal flow; returns remain the auditable add-back path.
- Multiple pickup or delivery events are not redesigned.
- Phase 3A-0 did not start the new Warehouse UI.
- Barcode scanning, transfers, receiving, and picking/packing queue redesigns remain future Warehouse work.
- `npm run lint` remains broken because `next lint` resolves `lint` as an invalid project directory in the current Next.js/tooling setup.
