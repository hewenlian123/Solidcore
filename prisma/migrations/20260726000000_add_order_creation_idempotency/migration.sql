ALTER TABLE "sales_orders"
  ADD COLUMN "creation_fingerprint" TEXT,
  ADD COLUMN "creation_key" TEXT;

CREATE UNIQUE INDEX "sales_orders_creation_key_key"
  ON "sales_orders"("creation_key");
