ALTER TABLE "sales_order_fulfillments"
  ADD COLUMN "inventory_deducted_at" DATETIME;

ALTER TABLE "sales_order_fulfillments"
  ADD COLUMN "inventory_deducted_by" TEXT;

CREATE TABLE "inventory_movements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "variant_id" TEXT NOT NULL,
  "fulfillment_id" TEXT,
  "fulfillment_item_id" TEXT,
  "type" TEXT NOT NULL,
  "qty" DECIMAL NOT NULL,
  "unit" TEXT NOT NULL,
  "note" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "inventory_movements_fulfillment_item_id_fkey" FOREIGN KEY ("fulfillment_item_id") REFERENCES "sales_order_fulfillment_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");
CREATE INDEX "inventory_movements_fulfillment_id_idx" ON "inventory_movements"("fulfillment_id");
CREATE INDEX "inventory_movements_fulfillment_item_id_idx" ON "inventory_movements"("fulfillment_item_id");
