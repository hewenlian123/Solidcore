# Canonical SolidCore Lifecycle Reference

Use this reference when a SolidCore task touches more than one business stage. Treat repository source as authoritative and these notes as orientation.

## Canonical Flow

Customer inquiry -> Quote -> Sales Order -> Inventory reservation -> Purchasing or Special Order if needed -> Receiving -> Fulfillment -> Invoice -> Payment -> Return or Store Credit when applicable -> CRM follow-up.

The current documented target flow is Quote -> Sales Order -> Fulfillment -> Invoice -> Payment -> Return -> Store Credit. Purchasing, receiving, Special Order, and CRM follow-up must connect to that flow instead of replacing it.

## Canonical Contexts

- Customer context: customer detail, customer summary, notes, statement, returns, store credits, warranty, related quotes, orders, invoices, and follow-ups.
- Sales Order context: quote/order header, line items, customer snapshot, status, totals, payments, invoices, fulfillments, tickets, and Special Order purchasing links.
- Fulfillment context: fulfillment header, fulfillment items, pickup or delivery type, event-level quantities, inventory deduction evidence, and outbound queue.
- Financial context: invoice, invoice items, payments, receipts, voids, refunds, store credit, and balance.

## Evidence Checklist

Before implementing, identify the actual files for:

- User route and component.
- API route or server action.
- Prisma models and relationships.
- Shared library functions for totals, status, reservation, fulfillment, inventory, invoice, payment, or returns.
- Existing tests or scripts that cover the path.

## Design Default

Extend or connect existing records first. Create new records only when they represent a genuinely auditable business event that cannot be represented by the existing model without loss of history.
