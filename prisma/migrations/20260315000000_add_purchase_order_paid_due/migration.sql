-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "due_date" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
