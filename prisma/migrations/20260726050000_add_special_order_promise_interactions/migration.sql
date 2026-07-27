CREATE TYPE "SpecialOrderCommunicationState" AS ENUM (
  'PREPARED',
  'LOGGED',
  'SENT',
  'DELIVERED',
  'CONFIRMED'
);

ALTER TABLE "sales_orders"
  ADD COLUMN "customer_promise_date" TIMESTAMP(3),
  ADD COLUMN "proposed_customer_promise_date" TIMESTAMP(3),
  ADD COLUMN "promise_date_approval_actor" TEXT,
  ADD COLUMN "promise_date_reason" TEXT,
  ADD COLUMN "promise_date_updated_at" TIMESTAMP(3),
  ADD COLUMN "special_follow_up_owner" TEXT,
  ADD COLUMN "special_follow_up_due_at" TIMESTAMP(3);

CREATE INDEX "sales_orders_customer_promise_date_idx"
  ON "sales_orders"("customer_promise_date");

CREATE INDEX "sales_orders_special_follow_up_due_at_idx"
  ON "sales_orders"("special_follow_up_due_at");

CREATE TABLE "special_order_interactions" (
  "id" TEXT NOT NULL,
  "sales_order_id" TEXT NOT NULL,
  "state" "SpecialOrderCommunicationState" NOT NULL,
  "channel" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence_reference" TEXT,
  "actor" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creation_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "special_order_interactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "special_order_interactions_creation_key_key"
  ON "special_order_interactions"("creation_key");

CREATE INDEX "special_order_interactions_sales_order_id_occurred_at_idx"
  ON "special_order_interactions"("sales_order_id", "occurred_at");

CREATE INDEX "special_order_interactions_state_occurred_at_idx"
  ON "special_order_interactions"("state", "occurred_at");

ALTER TABLE "special_order_interactions"
  ADD CONSTRAINT "special_order_interactions_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id")
  REFERENCES "sales_orders"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "special_order_interactions"
  ADD CONSTRAINT "special_order_interactions_evidence_chk"
  CHECK (
    "state" IN ('PREPARED', 'LOGGED')
    OR NULLIF(BTRIM("evidence_reference"), '') IS NOT NULL
  );

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_special_follow_up_pair_chk"
  CHECK (
    (
      "special_follow_up_owner" IS NULL
      AND "special_follow_up_due_at" IS NULL
    )
    OR
    (
      NULLIF(BTRIM("special_follow_up_owner"), '') IS NOT NULL
      AND "special_follow_up_due_at" IS NOT NULL
    )
  );
