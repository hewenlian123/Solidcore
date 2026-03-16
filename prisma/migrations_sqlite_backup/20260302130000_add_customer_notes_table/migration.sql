CREATE TABLE IF NOT EXISTS "customer_notes" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "customer_notes_customer_id_created_at_idx"
  ON "customer_notes"("customer_id", "created_at");
