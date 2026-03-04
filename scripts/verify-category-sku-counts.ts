import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, category: true },
  });
  const variants = await prisma.productVariant.findMany({
    where: { archivedAt: null },
    select: { productId: true },
  });

  const categoryByProductId = new Map(products.map((p) => [p.id, p.category]));
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const category = String(categoryByProductId.get(variant.productId) ?? "OTHER");
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("verify-category-sku-counts failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
