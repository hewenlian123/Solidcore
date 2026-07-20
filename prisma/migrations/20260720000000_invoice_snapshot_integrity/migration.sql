-- Phase 4A-1: preserve the Sales Order order-level discount as an immutable
-- Invoice header snapshot and enforce the existing one-invoice-per-sales-order
-- workflow at the database boundary.
ALTER TABLE "invoices"
  ADD COLUMN "discount_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "invoices_sales_order_id_idx";

CREATE UNIQUE INDEX "invoices_sales_order_id_key"
  ON "invoices"("sales_order_id");
