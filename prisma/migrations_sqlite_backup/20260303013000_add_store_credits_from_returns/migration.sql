ALTER TABLE "returns"
  ADD COLUMN "issue_store_credit" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "returns"
  ADD COLUMN "credit_amount" DECIMAL NOT NULL DEFAULT 0;

CREATE TABLE "store_credits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customer_id" TEXT NOT NULL,
  "return_id" TEXT NOT NULL,
  "amount" DECIMAL NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "store_credits_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "store_credits_return_id_key" ON "store_credits"("return_id");
CREATE INDEX "store_credits_customer_id_created_at_idx" ON "store_credits"("customer_id", "created_at");
CREATE INDEX "store_credits_status_idx" ON "store_credits"("status");
