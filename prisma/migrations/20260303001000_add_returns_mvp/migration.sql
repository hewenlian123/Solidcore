CREATE TABLE "returns" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sales_order_id" TEXT NOT NULL,
  "fulfillment_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT,
  "completed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "returns_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "returns_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "return_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "return_id" TEXT NOT NULL,
  "fulfillment_item_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "qty" DECIMAL NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "return_items_fulfillment_item_id_fkey" FOREIGN KEY ("fulfillment_item_id") REFERENCES "sales_order_fulfillment_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "returns_sales_order_id_created_at_idx" ON "returns"("sales_order_id", "created_at");
CREATE INDEX "returns_fulfillment_id_idx" ON "returns"("fulfillment_id");
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");
CREATE INDEX "return_items_fulfillment_item_id_idx" ON "return_items"("fulfillment_item_id");
CREATE INDEX "return_items_variant_id_idx" ON "return_items"("variant_id");
