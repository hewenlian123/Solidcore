---
name: solidcore-inventory-fulfillment-guard
description: "Protect SolidCore inventory, reservation, warehouse, fulfillment, pickup, delivery, cancellation, movement-history, flooring-box, square-foot, idempotency, and concurrency correctness. Use before changing ordered, reserved, available, picked, packed, fulfilled, pickup, delivery, cancelled, remaining, or inventory movement quantities."
---

# SolidCore Inventory Fulfillment Guard

## Name And Description

Name: `solidcore-inventory-fulfillment-guard`.

Description: Use this skill for SolidCore inventory, reservation, warehouse, and fulfillment work involving ordered, reserved, available, picked, packed, fulfilled, pickup, delivery, cancelled, remaining quantities, inventory movements, fulfillment event history, or flooring box and square-foot relationships.

## Purpose

Protect inventory, reservation, warehouse, and fulfillment integrity by requiring event-level quantities, idempotent inventory movement evidence, concurrency review, and partial-fulfillment-safe calculations.

## When To Use

Use this skill before changing fulfillment status, fulfillment items, outbound queue, picking, packing, pickup, delivery, receiving, reservation, inventory movements, stock levels, returns, cancellations, warehouse/location behavior, or any code that changes quantity.

Use this skill when a UX task can indirectly change inventory, such as marking a fulfillment ready, picked up, delivered, completed, cancelled, returned, or received.

## Scope

- Ordered quantity, reserved quantity, available quantity, picked quantity, packed quantity, fulfilled quantity, pickup quantity, delivery quantity, cancelled quantity, and remaining quantity.
- Inventory movement records and stock levels.
- Warehouse and location evidence.
- Fulfillment event history.
- Partial pickup, partial delivery, partial receiving, and partial returns.
- Flooring box and square-foot relationships.
- Idempotency, duplicate deduction, concurrency, and cancellation release behavior.

## Non-Goals

- Do not rewrite fulfillment or inventory architecture without repository evidence and explicit scope.
- Do not create a detached warehouse system that bypasses SalesOrderFulfillment or InventoryMovement evidence.
- Do not couple payment status to fulfillment status.
- Do not run migrations, commits, pushes, or deployments unless explicitly requested.
- Do not treat navigation visibility as security.

## Product Principles

- Remaining quantity must be understandable from one consistent source of truth.
- Every pickup or delivery must preserve event-level line quantities.
- Inventory deductions must be traceable to fulfillment completion evidence.
- Partial fulfillment is normal and must not behave like full fulfillment.
- Warehouse staff need clear quantities and locations without financial-state ambiguity.
- Payment status and fulfillment status remain independent.

## Architecture Rules

- Never deduct full-order quantity for partial fulfillment.
- Never silently overwrite fulfillment history.
- Prevent negative quantities and over-fulfillment.
- Prevent duplicate deductions.
- Review idempotency and concurrency for every inventory-changing write.
- Completed fulfillment requires matching inventory movement evidence.
- Cancellation releases only unfulfilled reservation.
- Preserve flooring box and square-foot relationships.
- Confirm actual ownership in SalesOrder, SalesOrderItem, SalesOrderFulfillment, SalesOrderFulfillmentItem, InventoryStock, InventoryMovement, SalesReturn, and receiving or PurchaseOrder code before editing.

## UX Rules

- Display ordered, fulfilled, remaining, and current action quantity near the action.
- Make partial pickup or delivery explicit with line-level quantities.
- Use confirmations for final status changes that deduct inventory.
- Show inventory or reservation errors before committing final fulfillment states.
- Keep warehouse actions direct and scannable; avoid financial labels on fulfillment controls.
- Avoid layout shifts around quantity steppers, status controls, and fulfillment rows.

## Data-Integrity Rules

- Maintain one consistent source of truth for remaining quantity.
- Store event-level line quantities for every pickup, delivery, receiving, return, cancellation, and inventory movement.
- Link deductions to fulfillment and fulfillment item records when the model supports it.
- Do not decrement onHand or reserved twice for the same event.
- Do not release fulfilled reservation on cancellation; release only unfulfilled reservation.
- Validate unit conversions, flooring boxes, and square-foot math against existing repository logic.
- Use transactions where stock, reservation, fulfillment status, and movement records must change together.

## Required Repository Evidence

- Inspect `prisma/schema.prisma` for fulfillment, inventory, order-item, return, warehouse, and purchasing relationships.
- Inspect `lib/fulfillment-inventory.ts`, `lib/fulfillment.ts`, `lib/sales-orders.ts`, `lib/inventory-movements.ts`, `lib/inventory-safety.ts`, `lib/returns.ts`, and related files when they exist.
- Inspect relevant API routes under `app/api/fulfillment`, `app/api/fulfillments`, `app/api/fulfillment-items`, `app/api/inventory`, `app/api/sales-orders`, `app/api/returns`, and purchasing or receiving paths after confirming actual paths.
- Inspect user-facing routes under `app/fulfillment`, `app/outbound`, `app/delivery`, `app/warehouse`, `app/inventory`, and returns paths after confirming actual paths.
- Read `references/partial-fulfillment-scenarios.md` in this skill before defining tests.

## Implementation Controls

- Inspect before editing.
- Prefer small reviewable diffs.
- Make no unrelated cleanup.
- Make no destructive schema changes without explicit approval.
- Make no silent data migration.
- Work local-only first.
- Run formatting, lint, TypeScript, production build, and focused fulfillment/inventory tests for code changes.
- Review git diff and git status before completion.
- Do not commit, push, or deploy without explicit instruction.

## Required Automated Tests

- Cover partial pickup, partial delivery, full fulfillment, cancellation, return, duplicate finalization, over-fulfillment prevention, negative quantity prevention, reservation release, and inventory movement evidence when affected.
- Include concurrency or idempotency tests for inventory-changing writes.
- Run existing focused scripts such as fulfillment rules, fulfillment inventory, fulfillment PDF, or fulfillment E2E tests when relevant and present.
- Run lint, TypeScript, and production build for implementation changes.

## Required Browser Validation

- Validate fulfillment and warehouse workflows in a real browser for user-facing changes.
- Cover desktop, iPad landscape, iPad portrait, and mobile usability.
- Verify partial quantity entry, final status changes, duplicate-click behavior, error states, and event history visibility.
- Confirm inventory status does not imply payment status and payment state does not hide fulfillment state.

## Completion Report Requirements

- State the source of truth for remaining quantity.
- List before/after inventory, reservation, fulfillment, and movement evidence.
- List idempotency, concurrency, and duplicate-deduction protections reviewed.
- List automated tests, browser viewports, lint, TypeScript, and build checks run.
- Include git diff summary and git status.
- State whether schema changes, migrations, commits, pushes, or deployments occurred.

## Stop Conditions

- Stop if the change would deduct full-order quantity for partial fulfillment.
- Stop if remaining quantity has no consistent source of truth.
- Stop if fulfillment history would be overwritten silently.
- Stop if inventory movements cannot prove a completed fulfillment deduction.
- Stop if cancellation would release fulfilled reservation or fulfilled stock.
- Stop if payment and fulfillment states would be coupled.

## Red Flags

- `fulfilledQty` updated without event-level evidence.
- Inventory deduction triggered by a UI-only status with no idempotency guard.
- A final status path that can run twice and double-deduct stock.
- Negative reserved or onHand quantities accepted without explicit correction workflow.
- Flooring quantities converted by ad hoc math outside existing unit rules.
- Cancellation that ignores already fulfilled quantities.

## Compliant Examples

- Record a partial pickup of 3 out of 10 units, reduce reserved by 3, reduce onHand by 3, and create linked inventory movements for the fulfilled lines only.
- Add a packing step that records packed quantities but leaves inventory deduction to the existing final fulfillment transition.
- Release only the remaining unfulfilled reservation when a partially fulfilled order is cancelled.

## Noncompliant Examples

- Deduct all 10 ordered units when the customer picks up 3.
- Mark fulfillment complete by overwriting the previous fulfilled quantity history.
- Use paid-in-full status as the trigger for inventory deduction.
- Recalculate flooring square feet with a new formula that disagrees with product variant units.
