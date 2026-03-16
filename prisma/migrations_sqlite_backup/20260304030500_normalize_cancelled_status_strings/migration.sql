UPDATE "sales_order_fulfillments"
SET "status" = 'CANCELLED'
WHERE "status" = 'CANCELED';

UPDATE "sales_outbound_queue"
SET "status" = 'CANCELLED'
WHERE "status" = 'CANCELED';

UPDATE "returns"
SET "status" = 'CANCELLED'
WHERE "status" = 'CANCELED';
