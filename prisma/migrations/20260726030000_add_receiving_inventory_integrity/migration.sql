-- Add structured PO lines, immutable receipt events, and explicit Hold balances.
ALTER TABLE "inventory_stock"
ADD COLUMN "hold" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "incoming" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "in_transit" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "inventory_stock"
ADD CONSTRAINT "inventory_stock_hold_nonnegative_check" CHECK ("hold" >= 0),
ADD CONSTRAINT "inventory_stock_incoming_nonnegative_check" CHECK ("incoming" >= 0),
ADD CONSTRAINT "inventory_stock_in_transit_nonnegative_check" CHECK ("in_transit" >= 0),
ADD CONSTRAINT "inventory_stock_hold_within_on_hand_check" CHECK ("hold" <= "on_hand");

CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "expected_qty" DECIMAL(65,30) NOT NULL,
    "received_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closed_short_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_items_expected_positive_check" CHECK ("expected_qty" > 0),
    CONSTRAINT "purchase_order_items_received_nonnegative_check" CHECK ("received_qty" >= 0),
    CONSTRAINT "purchase_order_items_closed_short_nonnegative_check" CHECK ("closed_short_qty" >= 0)
);

CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "actor" TEXT NOT NULL,
    "approval_actor" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "expected_qty" DECIMAL(65,30) NOT NULL,
    "prior_received_qty" DECIMAL(65,30) NOT NULL,
    "accepted_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "damaged_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hold_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overage_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shortage_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "wrong_item_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closed_short_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "new_received_qty" DECIMAL(65,30) NOT NULL,
    "remaining_qty" DECIMAL(65,30) NOT NULL,
    "available_impact" DECIMAL(65,30) NOT NULL,
    "exception_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_receipt_items_quantities_nonnegative_check"
      CHECK (
        "prior_received_qty" >= 0 AND
        "accepted_qty" >= 0 AND
        "damaged_qty" >= 0 AND
        "hold_qty" >= 0 AND
        "overage_qty" >= 0 AND
        "shortage_qty" >= 0 AND
        "wrong_item_qty" >= 0 AND
        "closed_short_qty" >= 0 AND
        "new_received_qty" >= "prior_received_qty" AND
        "remaining_qty" >= 0 AND
        "available_impact" >= 0
      )
);

ALTER TABLE "inventory_movements"
ADD COLUMN "purchase_receipt_item_id" TEXT;

CREATE UNIQUE INDEX "purchase_order_items_purchase_order_id_variant_id_key"
ON "purchase_order_items"("purchase_order_id", "variant_id");
CREATE INDEX "purchase_order_items_purchase_order_id_idx"
ON "purchase_order_items"("purchase_order_id");
CREATE INDEX "purchase_order_items_variant_id_idx"
ON "purchase_order_items"("variant_id");

CREATE UNIQUE INDEX "purchase_receipts_idempotency_key_key"
ON "purchase_receipts"("idempotency_key");
CREATE INDEX "purchase_receipts_purchase_order_id_occurred_at_idx"
ON "purchase_receipts"("purchase_order_id", "occurred_at");

CREATE UNIQUE INDEX "purchase_receipt_items_receipt_id_purchase_order_item_id_key"
ON "purchase_receipt_items"("receipt_id", "purchase_order_item_id");
CREATE INDEX "purchase_receipt_items_receipt_id_idx"
ON "purchase_receipt_items"("receipt_id");
CREATE INDEX "purchase_receipt_items_purchase_order_item_id_idx"
ON "purchase_receipt_items"("purchase_order_item_id");
CREATE INDEX "purchase_receipt_items_variant_id_idx"
ON "purchase_receipt_items"("variant_id");
CREATE INDEX "inventory_movements_purchase_receipt_item_id_idx"
ON "inventory_movements"("purchase_receipt_item_id");

ALTER TABLE "purchase_order_items"
ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey"
FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items"
ADD CONSTRAINT "purchase_order_items_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_receipts"
ADD CONSTRAINT "purchase_receipts_purchase_order_id_fkey"
FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_receipt_items"
ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey"
FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items"
ADD CONSTRAINT "purchase_receipt_items_purchase_order_item_id_fkey"
FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items"
ADD CONSTRAINT "purchase_receipt_items_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_purchase_receipt_item_id_fkey"
FOREIGN KEY ("purchase_receipt_item_id") REFERENCES "purchase_receipt_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
