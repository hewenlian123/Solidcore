PRAGMA foreign_keys=OFF;

CREATE TABLE "sales_order_fulfillments_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sales_order_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "type" TEXT NOT NULL,
  "scheduled_date" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "time_window" TEXT,
  "driver_name" TEXT,
  "pickup_contact" TEXT,
  "delivery_name" TEXT,
  "delivery_phone" TEXT,
  "address1" TEXT,
  "address2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zip" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "sales_order_fulfillments_sales_order_id_fkey"
    FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_order_fulfillments_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "sales_order_fulfillments_new" (
  "id",
  "sales_order_id",
  "customer_id",
  "type",
  "scheduled_date",
  "status",
  "address",
  "notes",
  "created_at",
  "updated_at"
)
SELECT
  f."id",
  f."sales_order_id",
  so."customer_id" AS "customer_id",
  f."type",
  f."scheduled_date",
  f."status",
  f."address",
  f."notes",
  f."created_at",
  f."updated_at"
FROM "sales_order_fulfillments" f
JOIN "sales_orders" so ON so."id" = f."sales_order_id"
WHERE f."id" IN (
  SELECT picked."id"
  FROM (
    SELECT
      so2."id" AS "sales_order_id",
      (
        SELECT ff."id"
        FROM "sales_order_fulfillments" ff
        WHERE ff."sales_order_id" = so2."id"
        ORDER BY ff."created_at" DESC, ff."id" DESC
        LIMIT 1
      ) AS "id"
    FROM "sales_orders" so2
  ) picked
  WHERE picked."id" IS NOT NULL
);

DROP TABLE "sales_order_fulfillments";
ALTER TABLE "sales_order_fulfillments_new" RENAME TO "sales_order_fulfillments";

CREATE UNIQUE INDEX "sales_order_fulfillments_sales_order_id_key"
  ON "sales_order_fulfillments"("sales_order_id");
CREATE INDEX "sales_order_fulfillments_customer_id_idx"
  ON "sales_order_fulfillments"("customer_id");
CREATE INDEX "sales_order_fulfillments_scheduled_date_idx"
  ON "sales_order_fulfillments"("scheduled_date");

CREATE TABLE IF NOT EXISTS "sales_order_fulfillment_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fulfillment_id" TEXT NOT NULL,
  "sales_order_item_id" TEXT NOT NULL,
  "variant_id" TEXT,
  "title" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "ordered_qty" DECIMAL NOT NULL,
  "fulfilled_qty" DECIMAL NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_order_fulfillment_items_fulfillment_id_fkey"
    FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_order_fulfillment_items_sales_order_item_id_fkey"
    FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_order_fulfillment_items_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_order_fulfillment_items_fulfillment_id_sales_order_item_id_key"
  ON "sales_order_fulfillment_items"("fulfillment_id", "sales_order_item_id");
CREATE INDEX IF NOT EXISTS "sales_order_fulfillment_items_fulfillment_id_idx"
  ON "sales_order_fulfillment_items"("fulfillment_id");
CREATE INDEX IF NOT EXISTS "sales_order_fulfillment_items_sales_order_item_id_idx"
  ON "sales_order_fulfillment_items"("sales_order_item_id");
CREATE INDEX IF NOT EXISTS "sales_order_fulfillment_items_variant_id_idx"
  ON "sales_order_fulfillment_items"("variant_id");

PRAGMA foreign_keys=ON;
