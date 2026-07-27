-- Preserve customer history while enabling manager-controlled archive, restore, and merge.
ALTER TABLE "customers"
ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "merged_into_id" TEXT,
ADD COLUMN "merged_at" TIMESTAMP(3),
ADD COLUMN "merged_by" TEXT,
ADD COLUMN "merge_reason" TEXT;

CREATE TABLE "customer_aliases" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "source_customer_id" TEXT,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_lifecycle_events" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "source_customer_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_archived_at_merged_into_id_idx"
ON "customers"("archived_at", "merged_into_id");

CREATE INDEX "customers_merged_into_id_idx"
ON "customers"("merged_into_id");

CREATE UNIQUE INDEX "customer_aliases_customer_id_kind_normalized_value_key"
ON "customer_aliases"("customer_id", "kind", "normalized_value");

CREATE INDEX "customer_aliases_normalized_value_idx"
ON "customer_aliases"("normalized_value");

CREATE INDEX "customer_aliases_source_customer_id_idx"
ON "customer_aliases"("source_customer_id");

CREATE INDEX "customer_lifecycle_events_customer_id_created_at_idx"
ON "customer_lifecycle_events"("customer_id", "created_at");

CREATE INDEX "customer_lifecycle_events_source_customer_id_idx"
ON "customer_lifecycle_events"("source_customer_id");

ALTER TABLE "customers"
ADD CONSTRAINT "customers_merged_into_id_fkey"
FOREIGN KEY ("merged_into_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_aliases"
ADD CONSTRAINT "customer_aliases_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_aliases"
ADD CONSTRAINT "customer_aliases_source_customer_id_fkey"
FOREIGN KEY ("source_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_lifecycle_events"
ADD CONSTRAINT "customer_lifecycle_events_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_lifecycle_events"
ADD CONSTRAINT "customer_lifecycle_events_source_customer_id_fkey"
FOREIGN KEY ("source_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
