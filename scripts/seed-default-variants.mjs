import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugifySku(input) {
  return String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function defaultsForProduct(product) {
  const unit = String(product.unit || "PIECE").toUpperCase();
  const name = String(product.name || "").toLowerCase();
  const looksLikeWindow = name.includes("window");
  const looksLikeDoor = name.includes("door");
  const looksLikeFloor = name.includes("floor");
  const looksLikeMirror = name.includes("mirror");

  // Reasonable defaults for demo/seed data
  if (unit === "SQFT" || looksLikeFloor) {
    return { unit: "SQFT", price: 2.89, cost: 1.75, boxSqft: Number(product.flooringBoxCoverageSqft ?? 22.5) || 22.5 };
  }
  if (looksLikeWindow) return { unit: "PIECE", price: 189, cost: 125, boxSqft: null };
  if (looksLikeDoor) return { unit: "PIECE", price: 249, cost: 170, boxSqft: null };
  if (looksLikeMirror) return { unit: "PIECE", price: 129, cost: 80, boxSqft: null };
  return { unit: "PIECE", price: 99, cost: 60, boxSqft: null };
}

async function main() {
  const products = await prisma.salesProduct.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      skuPrefix: true,
      unit: true,
      price: true,
      cost: true,
      flooringBoxCoverageSqft: true,
      variants: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  let createdVariants = 0;
  let updatedProducts = 0;
  for (const p of products) {
    const hasVariant = (p.variants?.length ?? 0) > 0;
    const d = defaultsForProduct(p);

    // Ensure product has non-zero price/cost for UI display
    const nextPrice = Number(p.price ?? 0) > 0 ? Number(p.price) : d.price;
    const nextCost = p.cost != null && Number(p.cost) > 0 ? Number(p.cost) : d.cost;
    if (Number(p.price ?? 0) !== nextPrice || Number(p.cost ?? 0) !== nextCost) {
      await prisma.salesProduct.update({
        where: { id: p.id },
        data: {
          price: nextPrice,
          cost: nextCost,
          unit: d.unit,
        },
      });
      updatedProducts += 1;
    }

    if (hasVariant) continue;

    const baseSku = slugifySku(p.skuPrefix || p.name || "SKU");
    const sku = `${baseSku || "SKU"}-STD`;

    await prisma.productVariant.create({
      data: {
        productId: p.id,
        sku,
        displayName: "Standard",
        description: `Default variant for ${p.name}`,
        boxSqft: d.boxSqft,
        cost: d.cost,
        price: d.price,
        reorderLevel: 0,
        reorderQty: 0,
        isStockItem: true,
      },
      select: { id: true },
    });
    createdVariants += 1;
  }

  console.log(
    JSON.stringify(
      { updatedProducts, createdVariants, scannedProducts: products.length },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error("seed-default-variants failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

