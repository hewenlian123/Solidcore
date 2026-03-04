import { PrismaClient, ProductCategory } from "@prisma/client";

const prisma = new PrismaClient();

type CategoryTargetKey =
  | "LED_MIRROR"
  | "SHOWER_DOOR"
  | "WINDOW"
  | "SHAMPOO_NICHE"
  | "TILE_EDGE"
  | "FLOOR_ACCESSORIES"
  | "FLOOR";

type CategoryTarget = {
  key: CategoryTargetKey;
  category: ProductCategory;
  customCategoryName: string | null;
};

const TARGETS: Record<CategoryTargetKey, CategoryTarget> = {
  LED_MIRROR: {
    key: "LED_MIRROR",
    category: "OTHER",
    customCategoryName: "LED Mirror",
  },
  SHOWER_DOOR: {
    key: "SHOWER_DOOR",
    category: "OTHER",
    customCategoryName: "Bathroom Shower Glass Door",
  },
  WINDOW: {
    key: "WINDOW",
    category: "WINDOW",
    customCategoryName: null,
  },
  SHAMPOO_NICHE: {
    key: "SHAMPOO_NICHE",
    category: "OTHER",
    customCategoryName: "Shampoo Niche",
  },
  TILE_EDGE: {
    key: "TILE_EDGE",
    category: "OTHER",
    customCategoryName: "Tile Finish Edge",
  },
  FLOOR_ACCESSORIES: {
    key: "FLOOR_ACCESSORIES",
    category: "OTHER",
    customCategoryName: "Floor Accessories",
  },
  FLOOR: {
    key: "FLOOR",
    category: "FLOOR",
    customCategoryName: null,
  },
};

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function resolveTarget(name: string, variantNames: string[]): CategoryTarget | null {
  const productName = name.toLowerCase();
  const variantText = variantNames.join(" ").toLowerCase();

  if (includesAny(productName, ["mirror", "led mirror"])) {
    return TARGETS.LED_MIRROR;
  }

  if (includesAny(productName, ["shower", "shower glass"])) {
    return TARGETS.SHOWER_DOOR;
  }

  if (includesAny(productName, ["window", "sliding door"])) {
    return TARGETS.WINDOW;
  }

  if (includesAny(productName, ["niche", "shampoo"])) {
    return TARGETS.SHAMPOO_NICHE;
  }

  if (includesAny(productName, ["tile", "edging", "trim"])) {
    return TARGETS.TILE_EDGE;
  }

  if (includesAny(productName, ["molding", "bullnose", "underlayment", "stair", "corner", "baseboard"])) {
    return TARGETS.FLOOR_ACCESSORIES;
  }

  if (
    includesAny(productName, ["flooring"]) ||
    includesAny(variantText, ["oak", "maple", "elm"])
  ) {
    return TARGETS.FLOOR;
  }

  return null;
}

async function main() {
  const others = await prisma.product.findMany({
    where: { category: "OTHER" },
    select: {
      id: true,
      name: true,
      customCategoryName: true,
    },
  });
  const otherIds = others.map((item) => item.id);
  const variants = await prisma.productVariant.findMany({
    where: { productId: { in: otherIds } },
    select: {
      productId: true,
      displayName: true,
      sku: true,
    },
  });
  const variantsByProductId = new Map<string, Array<{ displayName: string | null; sku: string }>>();
  for (const variant of variants) {
    const current = variantsByProductId.get(variant.productId) ?? [];
    current.push({ displayName: variant.displayName ?? null, sku: variant.sku });
    variantsByProductId.set(variant.productId, current);
  }

  const updatesByCategory: Record<CategoryTargetKey, number> = {
    LED_MIRROR: 0,
    SHOWER_DOOR: 0,
    WINDOW: 0,
    SHAMPOO_NICHE: 0,
    TILE_EDGE: 0,
    FLOOR_ACCESSORIES: 0,
    FLOOR: 0,
  };
  let unchanged = 0;

  for (const product of others) {
    const variantNames = (variantsByProductId.get(product.id) ?? []).map(
      (v) => v.displayName || v.sku || "",
    );
    const target = resolveTarget(product.name, variantNames);

    if (!target) {
      unchanged += 1;
      continue;
    }

    const alreadyMatch =
      product.customCategoryName === target.customCategoryName &&
      (target.category === "OTHER" ? true : true);

    if (alreadyMatch && target.category === "OTHER") {
      unchanged += 1;
      continue;
    }

    if (target.category === "OTHER" && product.customCategoryName !== target.customCategoryName) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          category: target.category,
          customCategoryName: target.customCategoryName,
        },
      });
      updatesByCategory[target.key] += 1;
      continue;
    }

    if (target.category !== "OTHER") {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          category: target.category,
          customCategoryName: null,
        },
      });
      updatesByCategory[target.key] += 1;
      continue;
    }
  }

  console.log(
    JSON.stringify(
      {
        scannedOtherProducts: others.length,
        updatedPerCategory: updatesByCategory,
        unchangedOrUnmatched: unchanged,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("fix-categories failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
