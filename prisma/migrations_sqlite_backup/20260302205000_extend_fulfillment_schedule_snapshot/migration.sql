ALTER TABLE "sales_order_fulfillments" ADD COLUMN "scheduled_at" DATETIME;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_name" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_phone" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_address1" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_address2" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_city" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_state" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_zip" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "shipto_notes" TEXT;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "marked_out_at" DATETIME;
ALTER TABLE "sales_order_fulfillments" ADD COLUMN "marked_done_at" DATETIME;

UPDATE "sales_order_fulfillments"
SET "scheduled_at" = "scheduled_date"
WHERE "scheduled_at" IS NULL AND "scheduled_date" IS NOT NULL;
