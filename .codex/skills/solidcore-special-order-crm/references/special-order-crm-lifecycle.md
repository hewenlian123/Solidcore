# Special Order And CRM Lifecycle Reference

Use this reference before adding Special Order states, purchasing handoffs, receiving behavior, CRM activity, or follow-up queues.

## Special Order Shape

Special Order is not a second order system. It is line-level or order-context behavior inside the normal Sales Order workflow.

A single Sales Order may include:

- in-stock lines.
- backorder lines.
- Special Order lines.
- custom lines.

Sales-facing details include customer requirements, specs, attachments, approval, deposit requirement, ETA, and terms. Purchasing-facing details include supplier, cost, PO, shipping, receiving, and supplier ETA.

## CRM Shape

CRM should answer: who needs follow-up, why, and by when?

Supported activity types:

- call.
- text.
- email.
- visit.
- note.
- next follow-up.

Supported follow-up reasons:

- quote follow-up.
- unpaid invoice follow-up.
- Special Order update.
- pickup reminder.

## Default Queue

Prefer a simple queue grouped by due date, customer, reason, linked record, and owner. Add Kanban or automation only after a documented need shows the queue is insufficient.
