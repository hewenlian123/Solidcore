---
name: solidcore-financial-integrity
description: "Protect SolidCore Order, Invoice, Payment, receipt, customer-balance, store-credit, refund, void, tax, discount, deposit, partial-payment, overpayment, and outstanding-balance correctness. Use before changing financial calculations, invoice lines, payment allocation, financial APIs, payment UX, reconciliation, receipts, or any workflow that can alter money records."
---

# SolidCore Financial Integrity

## Name And Description

Name: `solidcore-financial-integrity`.

Description: Use this skill for SolidCore financial work that can affect order totals, invoice totals, invoice lines, tax, discounts, delivery fees, deposits, partial payments, payment allocation, store credit, refunds, voids, overpayments, receipts, or outstanding balances.

## Purpose

Protect Order, Invoice, Payment, and customer-balance correctness by requiring source-of-truth analysis, server-side calculations, durable records, transactions where needed, and financial regression testing.

## When To Use

Use this skill before changing or reviewing invoice creation, invoice updates, payment posting, payment voiding, refunds, store-credit application, receipts, reconciliation, customer statements, tax, discounts, delivery fees, deposits, partial payments, overpayments, or financial reports.

Use this skill when a UX task can indirectly change financial state, such as checkout, Collect Payment, Mark Sent, Void, Apply Store Credit, or customer balance displays.

## Scope

- Order totals and invoice totals.
- Invoice lines and issued invoice history.
- Tax, discount, delivery fees, deposits, and balance calculations.
- Partial payments, final payments, overpayments, refunds, voids, and receipts.
- Payment allocation to Sales Order or Invoice.
- Store credit creation, application, used amount, and remaining amount.
- Customer outstanding balance, statements, reconciliation, and finance reporting.

## Non-Goals

- Do not redesign finance modules without a financial correctness issue or explicit request.
- Do not create another payment ledger unless repository evidence proves the existing model cannot support the requirement.
- Do not treat navigation visibility as security.
- Do not alter tax, discount, or balance calculations as a UI-only convenience.
- Do not mutate issued invoice history without explicit business logic and audit preservation.
- Do not run migrations, commits, pushes, or deployments unless explicitly requested.

## Product Principles

- Money records must be explainable from source records.
- Posted payments, issued invoices, refunds, voids, and store credit movements must remain auditable.
- Partial payment is not paid in full.
- Payment status and fulfillment status must remain independent.
- Customer-facing balances must match server-side financial records.
- Financial UI should reduce mistakes with clear amounts, states, disabled duplicate actions, and confirmation for destructive operations.

## Architecture Rules

- Identify the source of truth for every financial amount before changing code.
- Do not rely solely on client-calculated totals.
- Do not duplicate tax or discount calculations.
- Do not create unallocated payments unless explicit supported business logic defines how they are later allocated and audited.
- Use transactions for multi-record financial writes where required.
- Preserve issued invoice history. If corrections are needed, prefer void, credit, adjustment, or new auditable records over silent mutation.
- Prevent duplicate submissions for payment, void, refund, invoice issue, and store-credit actions.
- Confirm actual model and API ownership for SalesOrder, Invoice, InvoiceItem, SalesOrderPayment, StoreCredit, StoreCreditApplication, SalesReturn, and reconciliation before editing.

## UX Rules

- Show amount due, amount paid, remaining balance, and payment status with clear labels.
- Avoid labels that imply fulfillment completion from payment state.
- Disable or guard payment submission while a payment is posting.
- Require explicit confirmation for voids, refunds, and irreversible invoice actions.
- Keep receipts and invoice PDFs linked to the record that generated them.
- Surface overpayment, store credit, or unapplied amount as explicit states, not hidden math.

## Data-Integrity Rules

- Store and compare amounts using the repository's established numeric approach.
- Recalculate server-side totals from authoritative lines, fees, discounts, tax, payments, voids, and store credit records.
- Treat voided payments as historical records excluded from paid totals unless business logic says otherwise.
- Preserve payment allocation evidence to order, invoice, store credit, refund, or customer balance.
- Require before/after data evidence for financial, inventory, and fulfillment changes that affect money.
- Verify idempotency and concurrency for payment and invoice writes.

## Required Repository Evidence

- Inspect `prisma/schema.prisma` for the financial models and relations in scope.
- Inspect involved API routes under `app/api/invoices`, `app/api/sales-orders`, `app/api/sales-order-payments`, `app/api/store-credits`, `app/api/reconciliation`, and `app/api/finance` after confirming actual paths.
- Inspect library functions under `lib/` that calculate invoices, sales orders, returns, store credit, PDFs, or settings.
- Inspect relevant pages under `app/invoices`, `app/finance`, `app/reconciliation`, `app/customers`, and sales order routes.
- Read `references/financial-regression-matrix.md` in this skill before defining tests.

## Implementation Controls

- Inspect before editing.
- Prefer small reviewable diffs.
- Make no unrelated cleanup.
- Make no destructive schema changes without explicit approval.
- Make no silent data migration.
- Work local-only first.
- Run formatting, lint, TypeScript, production build, and focused financial tests for code changes.
- Review git diff and git status before completion.
- Do not commit, push, or deploy without explicit instruction.

## Required Automated Tests

- Cover source-of-truth totals for order, invoice, tax, discount, delivery fee, deposits, payments, voids, refunds, overpayments, store credit, receipts, and outstanding balance when affected.
- Include duplicate-submit and idempotency coverage for payment-like writes.
- Include transaction consistency tests for multi-record writes.
- Include before/after fixtures or data snapshots for financial regressions.
- Run lint, TypeScript, and production build for implementation changes.

## Required Browser Validation

- Validate financial workflows in a real browser when user-facing behavior changes.
- Cover desktop, iPad landscape, iPad portrait, and mobile usability for payment or invoice screens.
- Verify disabled states, loading states, duplicate-click behavior, receipt/PDF links, error states, and balance updates.
- Confirm a partial payment remains visibly partial and does not imply fulfillment completion.

## Completion Report Requirements

- State the source of truth for each amount touched.
- List before/after financial data evidence.
- List transaction, idempotency, and duplicate-submit protections reviewed.
- List automated tests, browser validation, lint, TypeScript, and build checks run.
- Include git diff summary and git status.
- State whether schema changes, migrations, commits, pushes, or deployments occurred.

## Stop Conditions

- Stop if the source of truth for a financial amount cannot be identified.
- Stop if the change would rely only on client-calculated totals.
- Stop if a partial payment would be treated as paid in full.
- Stop if unallocated payment behavior is requested without explicit business rules.
- Stop if issued invoice history would be overwritten silently.
- Stop if tests cannot cover the affected money path.

## Red Flags

- Recalculating historical invoices without preserving issued records.
- Two tax or discount implementations that can diverge.
- Payment status automatically set from fulfillment status.
- Fulfillment status automatically set from payment status.
- Store credit used without reducing available credit or preserving application history.
- Void or refund actions without transaction boundaries or duplicate-submit controls.

## Compliant Examples

- Update invoice balance display by reading server-calculated invoice totals and posted, non-voided payments.
- Add duplicate-submit protection to payment posting and verify only one payment record is created.
- Apply store credit through an auditable application record that updates remaining credit and invoice balance in one transaction.

## Noncompliant Examples

- Mark an invoice paid when the user enters any partial payment.
- Calculate tax in the browser with a new formula that differs from invoice creation.
- Delete and recreate issued invoice lines to fix a display issue.
- Post a refund without linking it to the payment, invoice, return, or customer balance history.
