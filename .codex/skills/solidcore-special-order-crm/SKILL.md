---
name: solidcore-special-order-crm
description: "Govern SolidCore Special Order materials and lightweight operational CRM. Use when work touches custom or supplier-ordered sales lines, purchase-order handoff, supplier cost, receiving, ETA, deposits, customer approvals, specifications, attachments, Customer Detail notes, calls, texts, emails, visits, next follow-up, quote follow-up, unpaid invoice follow-up, pickup reminders, or customer relationship queues."
---

# SolidCore Special Order CRM

## Name And Description

Name: `solidcore-special-order-crm`.

Description: Use this skill for SolidCore Special Order and lightweight CRM work involving supplier-ordered or custom materials, customer approvals, deposits, specifications, attachments, ETA, purchasing, receiving, partial fulfillment, customer notes, communication history, next follow-up, and operational follow-up queues.

## Purpose

Govern Special Order materials and lightweight customer relationship management while keeping Special Order inside the normal Sales Order workflow and CRM centered on Customer Detail and related transactions.

## When To Use

Use this skill when a task touches Special Order lines, custom materials, supplier details, purchase order handoff, receiving, ETA updates, deposit requirements, customer approval, specs, attachments, Special Order status, Customer Detail notes, calls, texts, emails, visits, follow-up dates, unpaid invoice follow-up, quote follow-up, Special Order updates, or pickup reminders.

Use this skill before adding CRM screens, pipeline states, automation, Kanban, or customer activity features.

## Scope

- Special Order as part of a Sales Order with in-stock, backorder, Special Order, and custom lines allowed together.
- Sales capture of customer-facing requirements, approval, deposit requirements, specifications, attachments, ETA, and terms.
- Purchasing capture of supplier, cost, purchase order, shipping, receiving details, and ETA updates.
- Partial receiving and partial fulfillment where the underlying model allows.
- Customer Detail CRM with notes, calls, texts, emails, visits, next follow-up, quote follow-up, unpaid invoice follow-up, Special Order updates, and pickup reminders.
- Simple operational follow-up queue before Kanban, automation, or enterprise CRM features.

## Non-Goals

- Do not create a disconnected second order system for Special Orders.
- Do not create an enterprise CRM or global sales pipeline unless explicitly requested and justified by repository evidence.
- Do not force one global pipeline state onto a customer with multiple active transactions.
- Do not duplicate customer, order, invoice, payment, purchasing, fulfillment, or inventory records.
- Do not treat navigation visibility as security.
- Do not commit, push, deploy, migrate, or modify schema without explicit instruction.

## Product Principles

- Special Order is part of the normal Sales Order workflow.
- One order may contain in-stock, backorder, Special Order, and custom lines.
- Sales owns customer-facing requirements; purchasing owns supplier, cost, purchase order, shipping, and receiving details.
- CRM is lightweight, operational, and centered on current work rather than abstract pipeline management.
- Customer Detail should show related Quotes, Orders, Invoices, Special Orders, notes, and next follow-up without flattening them into one customer state.
- Prefer a simple follow-up queue before Kanban, automation, or enterprise CRM features.

## Architecture Rules

- Do not create a parallel second order system.
- Model Special Order behavior as Sales Order line context or linked purchasing context when the current schema supports it.
- Preserve customer approval, deposit requirements, specifications, attachments, ETA, terms, supplier, cost, purchase order, shipping, and receiving details.
- Keep purchasing details distinct from customer-facing sales details while linking both to the same order line or order context.
- Support partial receiving and partial fulfillment where the underlying model allows.
- Keep CRM activities linked to Customer and, when applicable, Quote, Sales Order, Invoice, Special Order line, Fulfillment, or follow-up reason.
- Do not force one global pipeline state onto a customer with multiple active transactions.

## UX Rules

- Keep Special Order entry inside the normal sales workflow.
- Reveal supplier/cost/procurement fields only when the line is Special Order or custom.
- Show ETA, approval, deposit requirement, and customer-facing terms where sales staff need them.
- Show supplier, cost, PO, shipping, and receiving details where purchasing staff need them.
- Center CRM on Customer Detail and a simple follow-up queue.
- Support calls, texts, emails, visits, notes, next follow-up, quote follow-up, unpaid invoice follow-up, Special Order updates, and pickup reminders.
- Avoid Kanban, automation builders, or enterprise CRM concepts until a simple queue fails a documented business need.

## Data-Integrity Rules

- Preserve links from Special Order lines to Sales Order, customer, supplier, purchase order, receiving, fulfillment, invoice, and deposit/payment evidence where available.
- Preserve attachments and specifications without detaching them from the transaction they support.
- Do not overwrite approval, ETA, terms, receiving, or follow-up history silently.
- Keep deposits and payment status under financial rules; do not let Special Order status imply paid in full.
- Keep payment status and fulfillment status independent for Special Order lines and mixed orders.
- Keep fulfillment and receiving quantities event-level when partial receiving or partial fulfillment is supported.
- Keep follow-up records tied to their reason so quote, unpaid invoice, Special Order, and pickup reminders can coexist for one customer.

## Required Repository Evidence

- Inspect actual models in `prisma/schema.prisma` for SalesOrder, SalesOrderItem, PurchaseOrder, Supplier, Customer/SalesCustomer, CustomerNote, Invoice, Payment, Fulfillment, attachments, and Special Order fields.
- Inspect `app/api/special-orders`, `app/api/sales-orders`, `app/api/purchase-orders`, `app/api/suppliers`, `app/api/customers`, `app/api/invoices`, and receiving or fulfillment APIs after confirming actual paths.
- Inspect `app/special-orders`, `app/sales-orders`, `app/purchasing`, `app/suppliers`, `app/customers`, and Customer Detail pages after confirming actual paths.
- Read `references/special-order-crm-lifecycle.md` in this skill before adding workflow states or CRM features.

## Implementation Controls

- Inspect before editing.
- Prefer small reviewable diffs.
- Make no unrelated cleanup.
- Make no destructive schema changes without explicit approval.
- Make no silent data migration.
- Work local-only first.
- Run formatting, lint, TypeScript, production build, and focused tests for code changes.
- Include before/after data evidence for financial, inventory, fulfillment, receiving, or follow-up state changes.
- Review git diff and git status before completion.
- Do not commit, push, or deploy without explicit instruction.

## Required Automated Tests

- Cover mixed in-stock, backorder, Special Order, and custom lines when sales-entry behavior changes.
- Cover supplier, PO, cost, ETA, receiving, approval, deposit, specification, and attachment behavior when affected.
- Cover quote follow-up, unpaid invoice follow-up, Special Order updates, pickup reminders, notes, and next-follow-up queues when affected.
- Include financial, inventory, fulfillment, and receiving regression tests for cross-record writes.
- Run lint, TypeScript, and production build for implementation changes.

## Required Browser Validation

- Validate sales, purchasing, receiving, Customer Detail, and follow-up flows in a real browser when user-facing behavior changes.
- Cover desktop, iPad landscape, iPad portrait, and mobile usability.
- Verify ordinary sales remain fast when Special Order fields are not needed.
- Verify Special Order details remain visible and editable at the correct sales or purchasing context.
- Verify multiple follow-up reasons can coexist for one customer without one global customer pipeline state.

## Completion Report Requirements

- State how Special Order remains part of the normal Sales Order workflow.
- State how CRM remains lightweight and operational.
- List customer, order, supplier, PO, invoice, payment, fulfillment, receiving, attachment, and follow-up evidence inspected as applicable.
- List tests, browser validation, lint, TypeScript, and build checks run.
- Include before/after data evidence for financial, inventory, fulfillment, receiving, or CRM state changes.
- Include git diff summary and git status.
- State whether schema changes, migrations, commits, pushes, or deployments occurred.

## Stop Conditions

- Stop if the task would create a disconnected second order system.
- Stop if one customer-wide pipeline state would override multiple active transactions.
- Stop if deposits are handled outside financial integrity rules.
- Stop if receiving or fulfillment history would be overwritten silently.
- Stop if attachments, specs, approvals, ETA, or terms would lose links to the transaction.
- Stop if a simple follow-up queue has not been considered before Kanban or automation.

## Red Flags

- A `SpecialOrder` workflow that duplicates SalesOrder totals, payments, customer data, or fulfillment state.
- A customer status like Active, Won, or Lost that hides separate quote, invoice, pickup, or Special Order follow-ups.
- Supplier cost shown in customer-facing sales views without intent.
- Deposit requirement treated as paid in full.
- ETA changes without history or customer communication context.
- CRM automation proposed before a basic follow-up queue is proven insufficient.

## Compliant Examples

- Add Special Order fields to a Sales Order line and link that line to purchasing details after verifying model support.
- Add a Customer Detail follow-up queue grouped by Quote follow-up, unpaid Invoice follow-up, Special Order update, and pickup reminder.
- Add partial receiving status that links received quantities to the purchase and the Sales Order line without marking all fulfillment complete.

## Noncompliant Examples

- Create a standalone Special Order app with its own customers, totals, deposits, and fulfillment states.
- Force one customer pipeline status when the customer has an open quote, unpaid invoice, and pending pickup.
- Hide Special Order supplier work in a note with no purchase order or receiving link.
- Use a Kanban board as the first CRM implementation when a queue would satisfy follow-up work.
