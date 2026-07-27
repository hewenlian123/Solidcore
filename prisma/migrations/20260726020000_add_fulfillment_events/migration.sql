-- Add immutable business events while preserving existing cumulative fulfillment fields.
CREATE TABLE "sales_fulfillment_events" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "method" "SalesFulfillmentType" NOT NULL,
    "actor" TEXT NOT NULL,
    "job_site_name" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_fulfillment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_fulfillment_event_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "fulfillment_item_id" TEXT,
    "sales_order_item_id" TEXT,
    "title" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "prior_fulfilled_qty" DECIMAL(65,30) NOT NULL,
    "new_fulfilled_qty" DECIMAL(65,30) NOT NULL,
    "remaining_qty" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_fulfillment_event_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_fulfillment_event_items_quantity_check"
      CHECK ("quantity" > 0),
    CONSTRAINT "sales_fulfillment_event_items_progress_check"
      CHECK ("new_fulfilled_qty" = "prior_fulfilled_qty" + "quantity"),
    CONSTRAINT "sales_fulfillment_event_items_remaining_check"
      CHECK ("remaining_qty" >= 0)
);

CREATE UNIQUE INDEX "sales_fulfillment_events_idempotency_key_key"
ON "sales_fulfillment_events"("idempotency_key");

CREATE INDEX "sales_fulfillment_events_fulfillment_id_occurred_at_idx"
ON "sales_fulfillment_events"("fulfillment_id", "occurred_at");

CREATE INDEX "sales_fulfillment_events_sales_order_id_occurred_at_idx"
ON "sales_fulfillment_events"("sales_order_id", "occurred_at");

CREATE UNIQUE INDEX "sales_fulfillment_event_items_event_id_fulfillment_item_id_key"
ON "sales_fulfillment_event_items"("event_id", "fulfillment_item_id");

CREATE INDEX "sales_fulfillment_event_items_event_id_idx"
ON "sales_fulfillment_event_items"("event_id");

CREATE INDEX "sales_fulfillment_event_items_fulfillment_item_id_idx"
ON "sales_fulfillment_event_items"("fulfillment_item_id");

CREATE INDEX "sales_fulfillment_event_items_sales_order_item_id_idx"
ON "sales_fulfillment_event_items"("sales_order_item_id");

ALTER TABLE "sales_fulfillment_events"
ADD CONSTRAINT "sales_fulfillment_events_fulfillment_id_fkey"
FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_fulfillment_events"
ADD CONSTRAINT "sales_fulfillment_events_sales_order_id_fkey"
FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_fulfillment_event_items"
ADD CONSTRAINT "sales_fulfillment_event_items_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "sales_fulfillment_events"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_fulfillment_event_items"
ADD CONSTRAINT "sales_fulfillment_event_items_fulfillment_item_id_fkey"
FOREIGN KEY ("fulfillment_item_id") REFERENCES "sales_order_fulfillment_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales_fulfillment_event_items"
ADD CONSTRAINT "sales_fulfillment_event_items_sales_order_item_id_fkey"
FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
