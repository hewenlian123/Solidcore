import { PrismaClient, ProductCategory } from "@prisma/client";

const prisma = new PrismaClient();

type TargetKey =
  | "FLOOR"
  | "FLOOR_ACCESSORIES"
  | "LED_MIRROR"
  | "MIRROR"
  | "TILE_EDGE"
  | "SHOWER_DOOR"
  | "WINDOW"
  | "SHAMPOO_NICHE"
  | "OTHER";

type Target = {
  key: TargetKey;
  category: ProductCategory;
  customCategoryName: string | null;
};

const TARGETS: Record<Exclude<TargetKey, "OTHER">, Target> = {
  FLOOR: { key: "FLOOR", category: "FLOOR", customCategoryName: null },
  FLOOR_ACCESSORIES: {
    key: "FLOOR_ACCESSORIES",
    category: "OTHER",
    customCategoryName: "Floor Accessories",
  },
  LED_MIRROR: {
    key: "LED_MIRROR",
    category: "OTHER",
    customCategoryName: "LED Mirror",
  },
  MIRROR: { key: "MIRROR", category: "MIRROR", customCategoryName: null },
  TILE_EDGE: {
    key: "TILE_EDGE",
    category: "OTHER",
    customCategoryName: "Tile Finish Edge",
  },
  SHOWER_DOOR: {
    key: "SHOWER_DOOR",
    category: "OTHER",
    customCategoryName: "Bathroom Shower Glass Door",
  },
  WINDOW: { key: "WINDOW", category: "WINDOW", customCategoryName: null },
  SHAMPOO_NICHE: {
    key: "SHAMPOO_NICHE",
    category: "OTHER",
    customCategoryName: "Shampoo Niche",
  },
};

function classifyByProductName(rawName: string): Target {
  const name = rawName.trim().toLowerCase();

  if (name === "flooring") return TARGETS.FLOOR;
  if (name === "floor accessories") return TARGETS.FLOOR_ACCESSORIES;
  if (name === "led mirror" || name === "led mirror") return TARGETS.LED_MIRROR;
  if (name === "mirror") return TARGETS.MIRROR;
  if (name === "tile finish edge" || name === "tile finish edge") return TARGETS.TILE_EDGE;
  if (name === "bathroom shower glass door" || name.includes("shower")) return TARGETS.SHOWER_DOOR;
  if (name === "windows" || name.includes("window")) return TARGETS.WINDOW;
  if (name === "shampoo niche") return TARGETS.SHAMPOO_NICHE;

  return { key: "OTHER", category: "OTHER", customCategoryName: null };
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      customCategoryName: true,
    },
  });

  // Variant counts are used as SKU counts in report.
  const allVariants = await prisma.productVariant.findMany({
    select: { productId: true },
  });
  const variantCountByProductId = new Map<string, number>();
  for (const row of allVariants) {
    variantCountByProductId.set(row.productId, (variantCountByProductId.get(row.productId) ?? 0) + 1);
  }

  let updatedProducts = 0;

  for (const product of products) {
    const target = classifyByProductName(product.name);
    if (target.key === "OTHER") continue;

    const sameCategory = product.category === target.category;
    const sameCustom = (product.customCategoryName ?? null) === target.customCategoryName;
    if (sameCategory && sameCustom) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        category: target.category,
        customCategoryName: target.customCategoryName,
      },
    });
    updatedProducts += 1;
  }

  const finalProducts = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      customCategoryName: true,
    },
  });

  const countsByCategory: Record<TargetKey, { products: number; skus: number }> = {
    FLOOR: { products: 0, skus: 0 },
    FLOOR_ACCESSORIES: { products: 0, skus: 0 },
    LED_MIRROR: { products: 0, skus: 0 },
    MIRROR: { products: 0, skus: 0 },
    TILE_EDGE: { products: 0, skus: 0 },
    SHOWER_DOOR: { products: 0, skus: 0 },
    WINDOW: { products: 0, skus: 0 },
    SHAMPOO_NICHE: { products: 0, skus: 0 },
    OTHER: { products: 0, skus: 0 },
  };

  const remainingOtherNames: string[] = [];

  for (const product of finalProducts) {
    const skuCount = variantCountByProductId.get(product.id) ?? 0;
    const normalizedCustom = String(product.customCategoryName ?? "").trim().toLowerCase();

    let bucket: TargetKey = "OTHER";
    if (product.category === "FLOOR") bucket = "FLOOR";
    else if (product.category === "WINDOW") bucket = "WINDOW";
    else if (product.category === "MIRROR") bucket = "MIRROR";
    else if (product.category === "OTHER" && normalizedCustom === "floor accessories") bucket = "FLOOR_ACCESSORIES";
    else if (product.category === "OTHER" && normalizedCustom === "led mirror") bucket = "LED_MIRROR";
    else if (product.category === "OTHER" && normalizedCustom === "tile finish edge") bucket = "TILE_EDGE";
    else if (product.category === "OTHER" && normalizedCustom === "bathroom shower glass door") bucket = "SHOWER_DOOR";
    else if (product.category === "OTHER" && normalizedCustom === "shampoo niche") bucket = "SHAMPOO_NICHE";

    countsByCategory[bucket].products += 1;
    countsByCategory[bucket].skus += skuCount;

    if (bucket === "OTHER") {
      remainingOtherNames.push(product.name);
    }
  }

  remainingOtherNames.sort((a, b) => a.localeCompare(b));

  console.log(
    JSON.stringify(
      {
        updatedProducts,
        countsByCategory,
        remainingOtherProducts: remainingOtherNames,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("fix-categories-v2 failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
