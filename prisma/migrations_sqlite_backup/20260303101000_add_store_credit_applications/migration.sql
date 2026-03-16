ALTER TABLE "store_credits"
  ADD COLUMN "used_amount" DECIMAL NOT NULL DEFAULT 0;

CREATE TABLE "store_credit_applications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_credit_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "amount" DECIMAL NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_credit_applications_store_credit_id_fkey" FOREIGN KEY ("store_credit_id") REFERENCES "store_credits" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "store_credit_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "store_credit_applications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "sales_order_payments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "store_credit_applications_store_credit_id_invoice_id_key"
  ON "store_credit_applications"("store_credit_id", "invoice_id");
CREATE INDEX "store_credit_applications_invoice_id_created_at_idx"
  ON "store_credit_applications"("invoice_id", "created_at");
CREATE INDEX "store_credit_applications_store_credit_id_created_at_idx"
  ON "store_credit_applications"("store_credit_id", "created_at");
CREATE INDEX "store_credit_applications_payment_id_idx"
  ON "store_credit_applications"("payment_id");
