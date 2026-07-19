# Partial Fulfillment Scenarios

Use this reference when changing inventory, fulfillment, warehouse, pickup, delivery, cancellation, receiving, or return behavior.

## Quantity Invariants

- fulfilled quantity cannot exceed ordered quantity minus cancelled quantity.
- remaining quantity must come from one documented source of truth.
- available quantity must not become negative through ordinary fulfillment actions.
- final fulfillment inventory deduction must be idempotent.
- inventory movement quantity must match the event-level fulfilled quantity.

## Scenarios To Test

- Full pickup or delivery for all lines.
- Partial pickup for one line with remaining quantity left open.
- Partial delivery across multiple lines.
- Duplicate click or repeated request on final status.
- Cancellation after no fulfillment.
- Cancellation after partial fulfillment.
- Return from fulfilled items only.
- Flooring item where boxes and square feet both need preservation.

## Evidence Pattern

For each scenario, capture before and after:

- order item quantities.
- fulfillment item quantities.
- inventory stock onHand and reserved.
- inventory movement rows.
- fulfillment status and event history.
