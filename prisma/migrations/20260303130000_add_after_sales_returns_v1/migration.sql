CREATE TABLE "after_sales_returns" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "return_number" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "sales_order_id" TEXT,
  "invoice_id" TEXT,
  "type" TEXT NOT NULL DEFAULT 'RETURN',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "refund_method" TEXT NOT NULL DEFAULT 'NO_REFUND',
  "refund_total" DECIMAL NOT NULL DEFAULT 0,
  "notes" TEXT,
  "pdf_url" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "after_sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "after_sales_returns_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "after_sales_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "after_sales_return_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "return_id" TEXT NOT NULL,
  "line_item_id" TEXT,
  "variant_id" TEXT,
  "title" TEXT NOT NULL,
  "sku" TEXT,
  "qty_purchased" DECIMAL,
  "qty_return" DECIMAL NOT NULL DEFAULT 0,
  "unit_price" DECIMAL NOT NULL DEFAULT 0,
  "reason" TEXT,
  "condition" TEXT,
  "line_refund" DECIMAL NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "after_sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "after_sales_returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "after_sales_return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "after_sales_return_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "return_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "after_sales_return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "after_sales_returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "after_sales_returns_return_number_key" ON "after_sales_returns"("return_number");
CREATE INDEX "after_sales_returns_customer_id_created_at_idx" ON "after_sales_returns"("customer_id", "created_at");
CREATE INDEX "after_sales_returns_sales_order_id_idx" ON "after_sales_returns"("sales_order_id");
CREATE INDEX "after_sales_returns_invoice_id_idx" ON "after_sales_returns"("invoice_id");
CREATE INDEX "after_sales_returns_status_created_at_idx" ON "after_sales_returns"("status", "created_at");
CREATE INDEX "after_sales_return_items_return_id_idx" ON "after_sales_return_items"("return_id");
CREATE INDEX "after_sales_return_items_line_item_id_idx" ON "after_sales_return_items"("line_item_id");
CREATE INDEX "after_sales_return_items_variant_id_idx" ON "after_sales_return_items"("variant_id");
CREATE INDEX "after_sales_return_events_return_id_created_at_idx" ON "after_sales_return_events"("return_id", "created_at");
