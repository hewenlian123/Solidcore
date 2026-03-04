import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const others = await prisma.product.findMany({
    where: { category: "OTHER" },
    select: { id: true, name: true },
  });
  const variantCounts = await prisma.productVariant.groupBy({
    by: ["productId"],
    _count: { _all: true },
    where: {
      productId: { in: others.map((p) => p.id) },
    },
  });
  const countMap = new Map(variantCounts.map((row) => [row.productId, row._count._all]));

  console.log(`Total OTHER products: ${others.length}`);
  others.forEach((p) => {
    console.log(`  "${p.name}" — ${countMap.get(p.id) ?? 0} variants`);
  });
}

main().then(() => prisma.$disconnect());
