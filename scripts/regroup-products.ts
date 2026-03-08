import { ProductCategory, ProductUnit, PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

type SourceRow = Record<string, unknown>;

type ParentConfig = {
  key: string;
  parentName: string;
  category: ProductCategory;
  customCategoryName: string | null;
  unit: ProductUnit;
  expectedVariants: number;
};

// Place Item_Group.csv in project root when running this script locally.
const SOURCE_FILE = "./Item_Group.csv";

const PARENT_CONFIGS: ParentConfig[] = [
  {
    key: "FLOORING",
    parentName: "Flooring",
    category: "FLOOR",
    customCategoryName: null,
    unit: "SQM", // closest supported unit for sqft
    expectedVariants: 18,
  },
  {
    key: "FLOOR_ACCESSORIES",
    parentName: "Floor Accessories",
    category: "OTHER",
    customCategoryName: "Floor Accessories",
    unit: "PIECE",
    expectedVariants: 123,
  },
  {
    key: "LED_MIRROR",
    parentName: "LED Mirror",
    category: "OTHER",
    customCategoryName: "LED Mirror",
    unit: "PIECE",
    expectedVariants: 46,
  },
  {
    key: "MIRROR",
    parentName: "Mirror",
    category: "MIRROR",
    customCategoryName: null,
    unit: "PIECE",
    expectedVariants: 3,
  },
  {
    key: "TILE_FINISH_EDGE",
    parentName: "Tile Finish Edge",
    category: "OTHER",
    customCategoryName: "Tile Finish Edge",
    unit: "PIECE",
    expectedVariants: 11,
  },
  {
    key: "BATHROOM_SHOWER_GLASS_DOOR",
    parentName: "Bathroom Shower Glass Door",
    category: "OTHER",
    customCategoryName: "Bathroom Shower Glass Door",
    unit: "PIECE",
    expectedVariants: 8,
  },
  {
    key: "WINDOWS",
    parentName: "Windows",
    category: "WINDOW",
    customCategoryName: null,
    unit: "PIECE",
    expectedVariants: 18,
  },
  {
    key: "SHAMPOO_NICHE",
    parentName: "Shampoo Niche",
    category: "OTHER",
    customCategoryName: "Shampoo Niche",
    unit: "PIECE",
    expectedVariants: 5,
  },
];

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeSku(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

function toNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/^USD\s*/i, "")
    .replace(/,/g, "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function ensureUniqueSku(baseSku: string, globalUsed: Set<string>) {
  if (!globalUsed.has(baseSku)) {
    globalUsed.add(baseSku);
    return baseSku;
  }
  let i = 2;
  while (true) {
    const candidate = `${baseSku}${i}`;
    if (!globalUsed.has(candidate)) {
      globalUsed.add(candidate);
      return candidate;
    }
    i += 1;
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const xlsxModule: any = await import("xlsx");
    const XLSX = xlsxModule.default ?? xlsxModule;
    const wb = XLSX.readFile(SOURCE_FILE, { raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as SourceRow[];

    const configByKey = new Map(PARENT_CONFIGS.map((item) => [item.key, item]));
    const grouped = new Map<string, SourceRow[]>();
    for (const row of rows) {
      const key = normalizeKey(row["Product Name"]);
      if (!configByKey.has(key)) continue;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }

    const skusFromFile = new Set<string>();
    for (const row of rows) {
      const base = normalizeSku(row["SKU"]) || normalizeSku(row["Variant Name"]);
      if (base) skusFromFile.add(base);
    }

    // Step 1: delete currently imported variants/products for these SKUs.
    const existingVariants = await prisma.productVariant.findMany({
      where: { sku: { in: Array.from(skusFromFile) } },
      select: { id: true, productId: true },
    });
    const variantIds = existingVariants.map((v) => v.id);
    const productIds = Array.from(new Set(existingVariants.map((v) => v.productId)));

    if (variantIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.salesOrderFulfillmentItem.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.invoiceItem.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.salesOrderItem.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.salesReturnItem.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.afterSalesReturnItem.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.inventoryStock.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.productVariant.deleteMany({ where: { id: { in: variantIds } } });
      });
    }

    // Clean up old parent products too.
    const parentNames = PARENT_CONFIGS.map((c) => c.parentName);
    const [oldParentsProduct, oldParentsSales] = await Promise.all([
      prisma.product.findMany({
        where: { name: { in: parentNames } },
        select: { id: true },
      }),
      prisma.salesProduct.findMany({
        where: { name: { in: parentNames } },
        select: { id: true },
      }),
    ]);
    const parentIds = [
      ...oldParentsProduct.map((p) => p.id),
      ...oldParentsSales.map((p) => p.id),
    ];
    const deleteProductIds = Array.from(new Set([...productIds, ...parentIds]));
    if (deleteProductIds.length > 0) {
      await prisma.salesProduct.deleteMany({ where: { id: { in: deleteProductIds } } });
      await prisma.product.deleteMany({ where: { id: { in: deleteProductIds } } });
    }

    const defaultWarehouse = await prisma.warehouse.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!defaultWarehouse) {
      throw new Error("No warehouse found. Please create one before running regroup.");
    }

    const globalSkuSet = new Set<string>();
    const summary: Array<{ parent: string; expected: number; actual: number }> = [];

    for (const cfg of PARENT_CONFIGS) {
      const sourceRows = grouped.get(cfg.key) ?? [];
      const parentSalePrice = sourceRows.length > 0 ? toNumber(sourceRows[0]["Selling Price"]) : 0;
      const parentCostPrice = sourceRows.length > 0 ? toNumber(sourceRows[0]["Purchase Price"]) : 0;

      const parentId = randomUUID();
      await prisma.salesProduct.create({
        data: {
          id: parentId,
          name: cfg.parentName,
          title: cfg.parentName,
          unit: cfg.unit,
          price: parentSalePrice,
          cost: parentCostPrice,
          defaultDescription: null,
        },
      });

      const parent = await prisma.product.create({
        data: {
          id: parentId,
          name: cfg.parentName,
          category: cfg.category,
          customCategoryName: cfg.customCategoryName,
          unit: cfg.unit,
          costPrice: parentCostPrice,
          salePrice: parentSalePrice,
          warehouseId: defaultWarehouse.id,
          defaultDescription: null,
        },
      });

      let createdForParent = 0;
      for (const row of sourceRows) {
        const displayName = String(row["Variant Name"] ?? "").trim();
        let sku = normalizeSku(row["SKU"]) || normalizeSku(displayName);
        if (!sku) continue;
        sku = ensureUniqueSku(sku, globalSkuSet);

        const salePrice = toNumber(row["Selling Price"]);
        const costPrice = toNumber(row["Purchase Price"]);
        const onHand = toNumber(row["Opening Stock"]);
        const description = String(row["Variant Description"] ?? "").trim() || null;

        const variant = await prisma.productVariant.create({
          data: {
            productId: parent.id,
            displayName: displayName || null,
            sku,
            description,
            price: salePrice,
            cost: costPrice,
            reorderLevel: 0,
            reorderQty: 0,
            isStockItem: true,
          },
        });
        await prisma.inventoryStock.create({
          data: {
            variantId: variant.id,
            onHand,
            reserved: 0,
          },
        });
        createdForParent += 1;
      }

      summary.push({
        parent: cfg.parentName,
        expected: cfg.expectedVariants,
        actual: createdForParent,
      });
    }

    const finalParentCount = await prisma.product.count({
      where: { name: { in: parentNames } },
    });
    const finalVariantCount = await prisma.productVariant.count({
      where: { product: { name: { in: parentNames } } },
    });

    console.log("Regroup complete.");
    console.log(`Parent products created: ${finalParentCount}`);
    console.log(`Variants created: ${finalVariantCount}`);
    for (const row of summary) {
      console.log(`- ${row.parent}: ${row.actual} variants (expected ${row.expected})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("regroup-products failed:", error);
  process.exit(1);
});
