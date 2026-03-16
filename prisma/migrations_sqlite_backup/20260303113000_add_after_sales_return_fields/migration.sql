ALTER TABLE "returns"
  ADD COLUMN "source_invoice_id" TEXT;

ALTER TABLE "returns"
  ADD COLUMN "return_type" TEXT NOT NULL DEFAULT 'RETURN';

ALTER TABLE "returns"
  ADD COLUMN "refund_method" TEXT;

CREATE INDEX "returns_source_invoice_id_idx" ON "returns"("source_invoice_id");
