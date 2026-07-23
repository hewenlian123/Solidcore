ALTER TABLE "sales_order_payments"
  ADD COLUMN "refund_of_payment_id" TEXT;

CREATE INDEX "sales_order_payments_refund_of_payment_id_idx"
  ON "sales_order_payments"("refund_of_payment_id");

ALTER TABLE "sales_order_payments"
  ADD CONSTRAINT "sales_order_payments_refund_of_payment_id_fkey"
  FOREIGN KEY ("refund_of_payment_id")
  REFERENCES "sales_order_payments"("id")
  ON DELETE NO ACTION
  ON UPDATE CASCADE;

ALTER TABLE "sales_order_payments"
  ADD CONSTRAINT "sales_order_payments_refund_relation_type_chk"
  CHECK (
    (type = 'REFUND' AND refund_of_payment_id IS NOT NULL)
    OR
    (type <> 'REFUND' AND refund_of_payment_id IS NULL)
  );

ALTER TABLE "sales_order_payments"
  ADD CONSTRAINT "sales_order_payments_refund_not_self_chk"
  CHECK (
    refund_of_payment_id IS NULL
    OR refund_of_payment_id <> id
  );
