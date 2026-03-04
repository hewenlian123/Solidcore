import { PrismaClient, ProductCategory, ProductUnit } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

type GroupRule = {
  key: string;
  targetName: string;
  category: ProductCategory;
  customCategoryName: string | null;
  unit: ProductUnit;
  match: (row: { name: string; category: ProductCategory; customCategoryName: string | null }) => boolean;
};

const GROUPS: GroupRule[] = [
  {
    key: "SHOWER",
    targetName: "Shower Glass Door",
    category: "OTHER",
    customCategoryName: "Bathroom Shower Glass Door",
    unit: "PIECE",
    match: (row) =>
      (row.customCategoryName?.toLowerCase() === "bathroom shower glass door" ||
        row.name.toLowerCase().includes("shower")) &&
      row.name.toLowerCase() !== "shower glass door",
  },
  {
    key: "WINDOWS",
    targetName: "Windows",
    category: "WINDOW",
    customCategoryName: null,
    unit: "PIECE",
    match: (row) =>
      row.name.toLowerCase().includes("window") &&
      row.name.toLowerCase() !== "windows",
  },
  {
    key: "LED_MIRROR",
    targetName: "LED Mirror",
    category: "OTHER",
    customCategoryName: "LED Mirror",
    unit: "PIECE",
    match: (row) =>
      row.customCategoryName?.toLowerCase() === "led mirror" ||
      (row.name.toLowerCase().includes("led") && row.name.toLowerCase().includes("mirror")),
  },
  {
    key: "NICHE",
    targetName: "Shampoo Niche",
    category: "OTHER",
    customCategoryName: "Shampoo Niche",
    unit: "PIECE",
    match: (row) =>
      row.customCategoryName?.toLowerCase() === "shampoo niche" ||
      row.name.toLowerCase().includes("niche"),
  },
  {
    key: "FLOORING",
    targetName: "Flooring",
    category: "FLOOR",
    customCategoryName: null,
    unit: "SQM",
    match: (row) =>
      row.category === "FLOOR" && row.name.toLowerCase() !== "flooring",
  },
  {
    key: "FLOOR_ACCESSORIES",
    targetName: "Floor Accessories",
    category: "OTHER",
    customCategoryName: "Floor Accessories",
    unit: "PIECE",
    match: (row) =>
      row.customCategoryName?.toLowerCase() === "floor accessories" &&
      row.name.toLowerCase() !== "floor accessories",
  },
  {
    key: "MIRROR",
    targetName: "Mirror",
    category: "MIRROR",
    customCategoryName: null,
    unit: "PIECE",
    match: (row) =>
      (row.category === "MIRROR" || row.customCategoryName?.toLowerCase() === "mirror") &&
      row.name.toLowerCase() !== "mirror" &&
      !row.name.toLowerCase().includes("led"),
  },
  {
    key: "TILE",
    targetName: "Tile Finish Edge",
    category: "OTHER",
    customCategoryName: "Tile Finish Edge",
    unit: "PIECE",
    match: (row) =>
      row.customCategoryName?.toLowerCase() === "tile finish edge" ||
      row.name.toLowerCase().includes("tile"),
  },
];

function deriveVariantName(productName: string, fallback: string) {
  const cleaned = productName.trim();
  const separators = [" - ", "- ", " -", "-", "–", ":"];
  for (const sep of separators) {
    const idx = cleaned.toLowerCase().indexOf(sep.toLowerCase());
    if (idx > 0) {
      const candidate = cleaned.slice(idx + sep.length).trim();
      if (candidate) return candidate;
    }
  }
  return fallback;
}

async function ensureParent(rule: GroupRule) {
  const existing = await prisma.product.findFirst({
    where: {
      name: rule.targetName,
      category: rule.category,
      customCategoryName: rule.customCategoryName,
    },
    select: { id: true, salePrice: true, costPrice: true },
  });

  if (existing) {
    await prisma.salesProduct.upsert({
      where: { id: existing.id },
      update: {
        name: rule.targetName,
        title: rule.targetName,
        unit: rule.unit,
      },
      create: {
        id: existing.id,
        name: rule.targetName,
        title: rule.targetName,
        unit: rule.unit,
        price: 0,
        cost: 0,
      },
    });
    return existing.id;
  }

  const warehouse = await prisma.warehouse.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!warehouse) throw new Error("No warehouse found.");

  const id = randomUUID();
  await prisma.salesProduct.create({
    data: {
      id,
      name: rule.targetName,
      title: rule.targetName,
      unit: rule.unit,
      price: 0,
      cost: 0,
    },
  });
  await prisma.product.create({
    data: {
      id,
      name: rule.targetName,
      category: rule.category,
      customCategoryName: rule.customCategoryName,
      unit: rule.unit,
      salePrice: 0,
      costPrice: 0,
      warehouseId: warehouse.id,
    },
  });
  return id;
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      customCategoryName: true,
      salePrice: true,
      costPrice: true,
    },
  });
  const allVariants = await prisma.productVariant.findMany({
    select: {
      id: true,
      productId: true,
      displayName: true,
      sku: true,
      price: true,
      cost: true,
    },
  });
  const variantsByProductId = new Map<string, typeof allVariants>();
  for (const v of allVariants) {
    const current = variantsByProductId.get(v.productId) ?? [];
    current.push(v);
    variantsByProductId.set(v.productId, current);
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const protectedParentIds = new Set<string>();
  let mergedProducts = 0;
  let movedVariants = 0;

  for (const group of GROUPS) {
    const targetId = await ensureParent(group);
    protectedParentIds.add(targetId);

    const sourceProducts = products.filter((p) => {
      if (p.id === targetId) return false;
      return group.match({
        name: p.name,
        category: p.category,
        customCategoryName: p.customCategoryName ?? null,
      });
    });

    if (sourceProducts.length === 0) continue;

    for (const source of sourceProducts) {
      const sourceVariants = variantsByProductId.get(source.id) ?? [];
      if (sourceVariants.length === 0) continue;
      for (const variant of sourceVariants) {
        const fallbackName = variant.sku;
        const nextDisplayName =
          variant.displayName?.trim() ||
          deriveVariantName(source.name, fallbackName);
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            productId: targetId,
            displayName: nextDisplayName,
            price: variant.price ?? source.salePrice,
            cost: variant.cost ?? source.costPrice,
          },
        });
        movedVariants += 1;
      }
      mergedProducts += 1;
    }
  }

  const candidateDeleteIds = products
    .map((p) => p.id)
    .filter((id) => !protectedParentIds.has(id));

  if (candidateDeleteIds.length > 0) {
    // delete only empty products after variant migration
    const empties = await prisma.product.findMany({
      where: {
        id: { in: candidateDeleteIds },
      },
      select: { id: true },
    });
    const emptyIds: string[] = [];
    for (const row of empties) {
      const count = await prisma.productVariant.count({ where: { productId: row.id } });
      if (count === 0) emptyIds.push(row.id);
    }
    if (emptyIds.length > 0) {
      await prisma.salesProduct.deleteMany({ where: { id: { in: emptyIds } } });
      await prisma.product.deleteMany({ where: { id: { in: emptyIds } } });
    }
  }

  const showerParent = await prisma.product.findFirst({
    where: { name: "Shower Glass Door" },
    select: { id: true },
  });
  const showerParentVariantCount = showerParent
    ? await prisma.productVariant.count({ where: { productId: showerParent.id } })
    : 0;

  console.log(
    JSON.stringify(
      {
        mergedProducts,
        variantsCreatedOrMoved: movedVariants,
        showerParentVariantCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("merge-shower-doors failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
