-- CreateTable
CREATE TABLE "category_margin_defaults" (
    "category" TEXT NOT NULL,
    "margin_pct" DECIMAL(65,30) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_margin_defaults_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "variant_margin_overrides" (
    "variant_id" TEXT NOT NULL,
    "margin_pct" DECIMAL(65,30) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_margin_overrides_pkey" PRIMARY KEY ("variant_id")
);
