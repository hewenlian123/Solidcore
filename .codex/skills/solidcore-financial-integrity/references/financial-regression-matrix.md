# Financial Regression Matrix

Use this matrix before implementing or reviewing SolidCore financial changes.

## Amount Sources

For each affected amount, record:

- Displayed field name.
- Server source of truth.
- API route that reads or writes it.
- Prisma model and relation.
- Client component that displays it.
- Tests that prove it.

## Minimum Scenarios

- Quote or order with tax and discount.
- Delivery fee added or removed.
- Deposit payment posted.
- Partial payment leaves remaining balance.
- Final payment closes balance only when paid total reaches amount due.
- Payment void restores balance.
- Refund creates auditable negative movement or refund record.
- Store credit is applied once and remaining credit changes correctly.
- Overpayment is explicit and not hidden as paid in full with no allocation.

## Evidence Pattern

Use before/after records, not screenshots alone. Capture the order or invoice totals, payment records, store-credit records, and customer balance before and after the write.
