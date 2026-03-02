CREATE INDEX IF NOT EXISTS "sales_orders_customer_id_created_at_idx"
  ON "sales_orders"("customer_id", "created_at");

CREATE INDEX IF NOT EXISTS "sales_orders_customer_id_status_idx"
  ON "sales_orders"("customer_id", "status");

CREATE INDEX IF NOT EXISTS "sales_order_payments_status_sales_order_id_idx"
  ON "sales_order_payments"("status", "sales_order_id");

CREATE INDEX IF NOT EXISTS "sales_order_payments_status_invoice_id_idx"
  ON "sales_order_payments"("status", "invoice_id");
