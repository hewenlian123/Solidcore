DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "sales_order_fulfillments" WHERE "status"::text = 'PACKING'
  ) OR EXISTS (
    SELECT 1 FROM "sales_outbound_queue" WHERE "status"::text = 'PACKING'
  ) THEN
    RAISE EXCEPTION 'Cannot remove PACKING from SalesFulfillmentStatus while PACKING records exist.';
  END IF;
END $$;

CREATE TYPE "SalesFulfillmentStatus_new" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'OUT',
  'PARTIAL',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "sales_order_fulfillments" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "sales_order_fulfillments"
  ALTER COLUMN "status" TYPE "SalesFulfillmentStatus_new"
  USING ("status"::text::"SalesFulfillmentStatus_new");

ALTER TABLE "sales_outbound_queue"
  ALTER COLUMN "status" TYPE "SalesFulfillmentStatus_new"
  USING ("status"::text::"SalesFulfillmentStatus_new");

ALTER TYPE "SalesFulfillmentStatus" RENAME TO "SalesFulfillmentStatus_old";
ALTER TYPE "SalesFulfillmentStatus_new" RENAME TO "SalesFulfillmentStatus";
DROP TYPE "SalesFulfillmentStatus_old";

ALTER TABLE "sales_order_fulfillments" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
