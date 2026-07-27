ALTER TABLE "sales_order_payments"
  ADD COLUMN "approved_return_id" TEXT,
  ADD COLUMN "refund_approval_actor" TEXT,
  ADD COLUMN "refund_review_actor" TEXT,
  ADD COLUMN "commercial_reduction_snapshot" DECIMAL(14, 2);

UPDATE "sales_order_payments"
SET
  "refund_approval_actor" = 'Legacy refund - approval evidence unavailable',
  "refund_review_actor" = 'Legacy refund - review evidence unavailable',
  "commercial_reduction_snapshot" = 0
WHERE "type" = 'REFUND';

CREATE INDEX "sales_order_payments_approved_return_id_idx"
  ON "sales_order_payments"("approved_return_id");

ALTER TABLE "sales_order_payments"
  ADD CONSTRAINT "sales_order_payments_approved_return_id_fkey"
  FOREIGN KEY ("approved_return_id")
  REFERENCES "after_sales_returns"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "sales_order_payments"
  ADD CONSTRAINT "sales_order_payments_refund_approval_evidence_chk"
  CHECK (
    (
      "type" = 'REFUND'
      AND "refund_approval_actor" IS NOT NULL
      AND "refund_review_actor" IS NOT NULL
      AND "commercial_reduction_snapshot" IS NOT NULL
    )
    OR
    (
      "type" <> 'REFUND'
      AND "approved_return_id" IS NULL
      AND "refund_approval_actor" IS NULL
      AND "refund_review_actor" IS NULL
      AND "commercial_reduction_snapshot" IS NULL
    )
  );
