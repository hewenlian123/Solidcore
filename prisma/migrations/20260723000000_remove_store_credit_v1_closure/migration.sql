DO $$
BEGIN
  IF to_regclass('public.store_credit_applications') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "store_credit_applications") THEN
    RAISE EXCEPTION 'STORE_CREDIT_DATA_PRESENT: store_credit_applications must be empty before V1 closure migration';
  END IF;

  IF to_regclass('public.store_credits') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "store_credits") THEN
    RAISE EXCEPTION 'STORE_CREDIT_DATA_PRESENT: store_credits must be empty before V1 closure migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "sales_order_payments"
    WHERE "method"::text = 'STORE_CREDIT'
  ) THEN
    RAISE EXCEPTION 'STORE_CREDIT_DATA_PRESENT: STORE_CREDIT payments must be resolved before V1 closure migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "returns"
    WHERE COALESCE("issue_store_credit", false) = true
       OR COALESCE("credit_amount", 0) <> 0
       OR UPPER(COALESCE("refund_method", '')) = 'STORE_CREDIT'
  ) THEN
    RAISE EXCEPTION 'STORE_CREDIT_DATA_PRESENT: returns still reference Store Credit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "after_sales_returns"
    WHERE "refund_method"::text = 'STORE_CREDIT'
  ) THEN
    RAISE EXCEPTION 'STORE_CREDIT_DATA_PRESENT: after_sales_returns still reference Store Credit';
  END IF;
END $$;

DROP TABLE IF EXISTS "store_credit_applications";
DROP TABLE IF EXISTS "store_credits";

ALTER TABLE "returns"
  DROP COLUMN IF EXISTS "issue_store_credit",
  DROP COLUMN IF EXISTS "credit_amount";

ALTER TYPE "SalesPaymentMethod" RENAME TO "SalesPaymentMethod_old";
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH', 'CHECK', 'CARD', 'BANK', 'OTHER');
ALTER TABLE "sales_order_payments"
  ALTER COLUMN "method" TYPE "SalesPaymentMethod"
  USING "method"::text::"SalesPaymentMethod";
DROP TYPE "SalesPaymentMethod_old";

ALTER TABLE "after_sales_returns"
  ALTER COLUMN "refund_method" DROP DEFAULT;
ALTER TYPE "AfterSalesRefundMethod" RENAME TO "AfterSalesRefundMethod_old";
CREATE TYPE "AfterSalesRefundMethod" AS ENUM ('REFUND_PAYMENT', 'NO_REFUND');
ALTER TABLE "after_sales_returns"
  ALTER COLUMN "refund_method" TYPE "AfterSalesRefundMethod"
  USING "refund_method"::text::"AfterSalesRefundMethod";
ALTER TABLE "after_sales_returns"
  ALTER COLUMN "refund_method" SET DEFAULT 'NO_REFUND';
DROP TYPE "AfterSalesRefundMethod_old";

DROP TYPE IF EXISTS "StoreCreditStatus";
