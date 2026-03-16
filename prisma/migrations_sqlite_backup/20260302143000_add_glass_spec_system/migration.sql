ALTER TABLE "Product" ADD COLUMN "glass_type_default" TEXT;
ALTER TABLE "Product" ADD COLUMN "glass_finish_default" TEXT;
ALTER TABLE "Product" ADD COLUMN "screen_default" TEXT;
ALTER TABLE "Product" ADD COLUMN "opening_type_default" TEXT;

ALTER TABLE "products" ADD COLUMN "glass_type_default" TEXT;
ALTER TABLE "products" ADD COLUMN "glass_finish_default" TEXT;
ALTER TABLE "products" ADD COLUMN "screen_default" TEXT;
ALTER TABLE "products" ADD COLUMN "opening_type_default" TEXT;

ALTER TABLE "product_variants" ADD COLUMN "glass_type_override" TEXT;
ALTER TABLE "product_variants" ADD COLUMN "glass_finish_override" TEXT;
ALTER TABLE "product_variants" ADD COLUMN "screen_override" TEXT;
ALTER TABLE "product_variants" ADD COLUMN "opening_type_override" TEXT;
