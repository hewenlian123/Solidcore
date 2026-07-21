ALTER TABLE "sales_order_payments"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "idempotency_fingerprint" TEXT;

CREATE UNIQUE INDEX "sales_order_payments_idempotency_key_key"
  ON "sales_order_payments"("idempotency_key");
