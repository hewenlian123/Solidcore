---
name: solidcore-counter-sales-ux
description: "Optimize SolidCore counter-sales, New Sale, POS, quote entry, and order-entry UX for desktop and iPad staff. Use when work changes customer search, quick customer creation, product or SKU search, line entry, quote/order creation, checkout, payment prompts, route transitions, dialogs, forms, responsive behavior, or interaction count in sales workflows."
---

# SolidCore Counter Sales UX

## Name And Description

Name: `solidcore-counter-sales-ux`.

Description: Use this skill for SolidCore counter-sales, New Sale, POS, quote entry, and order-entry work where speed, clarity, route count, dialog count, touch ergonomics, or responsive usability matter.

## Purpose

Optimize counter-sales, New Sale, and order-entry workflows for speed, clarity, and low interaction count while preserving financial, customer, product, and inventory integrity.

## When To Use

Use this skill when a task touches New Sale, quote entry, sales order creation, POS-style editing, customer lookup, customer quick create, product or SKU search, line entry, quantity editing, checkout, save actions, payment prompts, responsive layout, or counter-sales validation.

Use this skill for UX reviews that affect sales staff on desktop or iPad, even if the code change appears small.

## Scope

- New Sale and order-entry route behavior.
- Customer search and quick customer creation inside New Sale.
- Product, variant, SKU, price-list, and direct line addition inside New Sale.
- Quote and Sales Order creation speed.
- Checkout, save, convert, and payment entry handoff.
- Desktop, iPad landscape, iPad portrait, and usable mobile layouts.
- Click-count, dialog-count, and route-transition audits.

## Non-Goals

- Do not force ordinary sales through Customer or Product modules.
- Do not build a detached POS system that bypasses SalesOrder, Invoice, Payment, or inventory rules.
- Do not redesign unrelated dashboards, reports, or back-office pages.
- Do not treat navigation visibility as security.
- Do not add visual decoration that makes sales entry slower.

## Product Principles

- Desktop and iPad are primary. Mobile must remain usable.
- Common sales should target approximately 30-60 seconds from customer/product selection to saved quote or order.
- Customer search and quick creation stay inside New Sale.
- Product/SKU search and direct addition stay inside New Sale.
- Ordinary sales must not require navigating to Customer or Product modules.
- Use one clear primary action for each state.
- Put the fastest common path in front; reveal uncommon fields only when needed.

## Architecture Rules

- Confirm the actual New Sale, POS, Sales Order, Customer, Product, and price-list routes before editing.
- Prefer extending existing SalesOrder and SalesOrderItem creation paths over creating a separate POS model.
- Keep customer quick-create connected to the canonical customer record.
- Keep product search connected to the canonical product or variant data used by order lines.
- Do not duplicate pricing, tax, discount, customer, product, or inventory calculations on a detached client path.
- Do not use client-only state as the source of truth for saved orders, totals, reservations, or payments.
- Preserve deep links back to Sales Order detail, Customer detail, Invoice, and Fulfillment.

## UX Rules

- Audit click count, dialog count, and route transitions for the intended sales scenario before and after changes.
- Prefer inline panels, typeahead search, keyboard-friendly fields, barcode/SKU-friendly entry, and clear touch targets.
- Avoid nested dialogs.
- Avoid large ERP-style forms.
- Avoid unnecessary cards, animation, gradients, and visual noise.
- Use compact, scannable rows for line items with stable dimensions so totals and actions do not jump.
- Keep exactly one obvious primary action for each state, such as Save Quote, Create Sales Order, Convert, or Collect Payment.
- Make errors specific and close to the field or action that caused them.

## Data-Integrity Rules

- Reuse server-side validation for customer, product, price, tax, discount, quantity, and totals.
- Prevent duplicate submissions from double-clicks, slow networks, or repeated Enter keypresses.
- Do not allow a quick-create customer to orphan a quote or order.
- Do not allow a product line to lose product, variant, SKU, unit, box, or square-foot relationships.
- Preserve payment and fulfillment independence in checkout-oriented screens.

## Required Repository Evidence

- Inspect actual routes such as `app/sales-orders/new`, `app/sales-orders/pos`, `app/sales-orders-v2/new`, `app/orders/new`, `app/price-list`, `app/customers`, and their APIs only after confirming they exist.
- Inspect relevant components, shared UI components, and `lib/sales-order-ui.ts` or equivalent source when present.
- Inspect API and Prisma paths that create customers, products, quotes, sales orders, and line items.
- Read `references/new-sale-efficiency.md` in this skill before doing an interaction-count review.

## Implementation Controls

- Inspect before editing.
- Prefer small reviewable diffs.
- Make no unrelated cleanup.
- Make no destructive schema changes or silent data migrations.
- Work local-only first.
- Run formatting, lint, TypeScript, production build, and focused automated tests when code changes.
- Review git diff and git status before completion.
- Do not commit, push, or deploy without explicit instruction.

## Required Automated Tests

- Cover the exact sales-entry path changed, including validation failures and duplicate-submit prevention.
- Test customer quick-create, customer selection, product/SKU search, line addition, quantity changes, totals, and save/convert behavior when affected.
- Include financial and inventory regression tests when sales-entry changes can affect totals, reservation, or fulfillment.
- Run lint, TypeScript, and production build for implementation changes.

## Required Browser Validation

- Validate desktop, iPad landscape, iPad portrait, and mobile.
- Record click count, dialog count, and route transitions for at least one common sale scenario.
- Verify keyboard entry and touch entry where relevant.
- Verify long customer names, long product names, variant-heavy products, empty results, and failed saves.
- Confirm no text overlap, button overflow, or layout shift in line-item and total areas.

## Completion Report Requirements

- Report the before/after click count, dialog count, and route transitions.
- List route, component, API, model, and validation evidence inspected.
- List automated tests, browser viewports, and build checks run.
- State how ordinary sales remain inside New Sale.
- Include git diff summary and git status.
- State whether commits, pushes, deployments, migrations, or schema changes occurred.

## Stop Conditions

- Stop if the task requires ordinary sales to navigate to Customer or Product modules.
- Stop if the planned UX creates nested dialogs or a large ERP-style form without explicit approval.
- Stop if saved data would rely on client-only totals, product data, or customer records.
- Stop if source evidence shows the route or API assumptions are wrong.
- Stop if mobile or iPad usability cannot be validated for a user-facing change.

## Red Flags

- More route transitions for the common sale path after the change.
- Product or customer creation that leaves the New Sale flow and loses cart/order context.
- Multiple primary buttons competing in the same state.
- Decorative layout work that reduces scan speed.
- A payment prompt that implies fulfillment is complete.
- A hidden navigation item used as the only access control.

## Compliant Examples

- Add inline customer quick-create to New Sale and return focus to product search after save.
- Add SKU scan entry that uses existing product/variant lookup and server-side price validation.
- Replace an optional delivery details block with a collapsed section that opens only when delivery is selected.

## Noncompliant Examples

- Require staff to leave New Sale, open Customers, create a customer, return manually, then rebuild the order.
- Add a separate POS checkout API that calculates taxes differently from invoices.
- Put product search in a modal that opens another modal for variant selection.
- Add large decorative cards that push the line-item table below the fold on iPad.
