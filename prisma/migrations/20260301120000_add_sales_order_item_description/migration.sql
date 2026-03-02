-- Add nullable description field for sales order line notes
ALTER TABLE "sales_order_items" ADD COLUMN "description" TEXT;

