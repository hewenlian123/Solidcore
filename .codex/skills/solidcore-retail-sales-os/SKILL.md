---
name: solidcore-retail-sales-os
description: "Govern SolidCore retail sales operating-system changes where Customer, Quote, Sales Order, Invoice, Payment, Fulfillment, Inventory, Purchasing, Special Order, Receiving, Warehouse, or CRM lifecycle behavior is being designed or implemented. Use when a task may change how inquiries become quotes, orders, invoices, payments, reservations, purchasing actions, fulfillment events, partial pickup or delivery, completion, or follow-up."
---

# SolidCore Retail Sales OS

## Name And Description

Name: `solidcore-retail-sales-os`.

Description: Use this skill for SolidCore work that affects the connected retail lifecycle centered on Customer and Sales Order context, including Quote, Sales Order, Invoice, Payment, Fulfillment, Inventory, Purchasing, Special Order, Receiving, Warehouse, Completion, or CRM follow-up.

## Purpose

Govern the complete SolidCore business lifecycle while keeping Customer and Sales Order as the main operating contexts. Preserve related but independently auditable records across quote, order, invoice, payment, fulfillment, inventory, purchasing, and follow-up work.

## When To Use

Use this skill when a task asks to add, change, connect, review, or debug workflow behavior across customer inquiry, quote, sales order, invoice, payment, inventory reservation, purchasing, special order, receiving, warehouse fulfillment, partial pickup or delivery, completion, or CRM follow-up.

Use this skill before recommending architecture changes to any sales lifecycle module, even when the visible request sounds like navigation, UX, reporting, or cleanup.

## Scope

- Customer inquiry and customer selection.
- Quote creation, quote status, and quote conversion.
- Sales Order creation, editing, detail, status, and deep links.
- Invoice creation, issued invoice history, payment collection, receipts, and outstanding balance.
- Inventory reservation, purchasing handoff, Special Order procurement, receiving, warehouse fulfillment, partial pickup, partial delivery, and completion.
- CRM follow-up connected to customers, quotes, orders, invoices, Special Orders, and pickup reminders.

## Non-Goals

- Do not build a new application feature merely because this skill was invoked.
- Do not create a parallel second order system.
- Do not replace existing stable models, APIs, routes, or calculations without repository evidence and explicit task scope.
- Do not treat navigation visibility as security.
- Do not use this skill to justify broad rewrites, migrations, deployments, commits, or unrelated cleanup.

## Product Principles

- Keep Customer and Sales Order as the primary operating contexts for staff.
- Keep Quote, Order, Invoice, Payment, and Fulfillment related but independently auditable.
- Favor contextual workflow over detached modules for stages of the same transaction.
- Use progressive disclosure so common counter-sales work remains fast while advanced details remain available.
- Preserve historical records, deep links, data relationships, and audit trails.
- Let actual business state drive UI state; avoid creating cosmetic state that disagrees with records.

## Architecture Rules

- Inspect the repository before editing. Confirm actual route, component, API, and Prisma model names with source evidence.
- Read `docs/SYSTEM_OVERVIEW.md` and `docs/ARCHITECTURE-REVIEW.md` as orientation, then verify against current source.
- Do not duplicate stable models, APIs, calculations, counters, status enums, or record relationships.
- Do not create disconnected modules for stages of one workflow.
- Preserve Quote, Order, Invoice, Payment, Fulfillment, Return, and Store Credit as linked records with distinct audit responsibilities.
- Keep payment status and fulfillment status independent. A paid order may remain unfulfilled, and a fulfilled order may have a remaining balance.
- Require repository evidence before recommending architecture changes.
- Prefer incremental changes that connect existing SalesCustomer, SalesOrder, SalesOrderItem, Invoice, SalesOrderPayment, SalesOrderFulfillment, SalesOrderFulfillmentItem, InventoryStock, InventoryMovement, PurchaseOrder, Supplier, SalesReturn, and StoreCredit behavior when those names are confirmed in source.

## UX Rules

- Keep ordinary sales activity inside the relevant sales/order workflow when possible.
- Prefer contextual panels, inline states, and direct actions over route hopping.
- Use progressive disclosure for uncommon fields, supplier details, advanced invoice actions, or fulfillment exceptions.
- Keep one clear primary action per state.
- Avoid nested dialogs, large ERP-style forms, unnecessary cards, decorative gradients, visual noise, or animation that slows counter work.
- Preserve deep links from Customer, Sales Order, Invoice, Fulfillment, Special Order, and CRM follow-up views.

## Data-Integrity Rules

- Identify the source of truth for each lifecycle state and amount before changing behavior.
- Preserve historical invoices, posted payments, fulfillment events, inventory movements, and customer notes.
- Require event-level evidence for partial pickup, partial delivery, receiving, payment, void, refund, return, and store-credit behavior.
- Prevent duplicate submissions for state-changing writes.
- Use transactions for multi-record lifecycle writes where consistency depends on multiple records.
- Never silently migrate or overwrite business history.

## Required Repository Evidence

- Confirm the exact files with `rg` or `rg --files` before proposing or editing.
- Inspect the relevant Prisma models in `prisma/schema.prisma` and the involved API routes under `app/api/`.
- Inspect the user-facing routes and components under `app/`, `components/`, and `lib/` that actually own the behavior.
- For lifecycle mapping, read `references/canonical-lifecycle.md` in this skill.
- Include before/after data evidence whenever a change touches financial, inventory, fulfillment, or status behavior.

## Implementation Controls

- Prefer small reviewable diffs.
- Make no unrelated cleanup.
- Make no destructive schema change without explicit approval.
- Make no silent data migration.
- Work local-only first.
- Run formatting validation where the repository provides it.
- Run lint, TypeScript, production build, and focused automated tests when implementation changes code.
- Review the git diff and git status before completion.
- Do not commit, push, or deploy without explicit instruction.

## Required Automated Tests

- Add or update focused tests for the changed lifecycle path.
- Cover Quote to Sales Order conversion, invoice creation, payment posting, reservation, fulfillment, partial fulfillment, Special Order, receiving, return, or store credit behavior when those paths are affected.
- Include financial, inventory, and fulfillment regression tests for cross-record writes.
- Run existing focused scripts when relevant, plus lint, TypeScript, and production build for code changes.

## Required Browser Validation

- Validate the real workflow in a browser for any user-facing change.
- Cover desktop, iPad landscape, iPad portrait, and mobile usability.
- Verify deep links, primary actions, empty states, loading states, and error states.
- Confirm payment state does not mask fulfillment state and fulfillment state does not mask payment state.

## Completion Report Requirements

- Report routes, components, APIs, models, and records inspected.
- Summarize the lifecycle impact and why the change does not create a second order system.
- List automated tests, browser validations, and build checks run.
- Include before/after data evidence for financial, inventory, fulfillment, or status changes.
- Include git diff summary and git status.
- State whether commits, pushes, deployments, migrations, or schema changes occurred.

## Stop Conditions

- Stop if the requested change requires a second order system.
- Stop if the task requires destructive schema changes, silent migration, or history rewriting without explicit approval.
- Stop if source evidence contradicts the planned model, API, or route assumptions.
- Stop if payment and fulfillment state would become coupled.
- Stop if validation cannot prove the lifecycle remains auditable.

## Red Flags

- A new order-like table, route, or API that competes with SalesOrder or Quote behavior.
- A module that copies Sales Order line items without preserving source links.
- UI that hides a route and calls that authorization.
- A status change that marks payment and fulfillment complete together.
- Full-order inventory deduction for partial pickup or delivery.
- Recalculated historical invoices without preserved issued history.

## Compliant Examples

- Add a Quotes filter that uses existing SalesOrder records with `docType` evidence and preserves quote conversion links.
- Add a Customer Detail follow-up panel that links to that customer's active quotes, orders, invoices, and Special Orders.
- Add a fulfillment action that records event-level line quantities and links inventory movements back to fulfillment items.

## Noncompliant Examples

- Create a separate `SpecialOrder` order table that duplicates customer, totals, payment, and fulfillment state.
- Mark an order as paid because all items were picked up.
- Deduct the whole order from inventory when only one line or partial quantity was delivered.
- Replace the existing Sales Order detail route with a disconnected CRM pipeline record.
