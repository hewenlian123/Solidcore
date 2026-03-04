import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.product.updateMany({
    where: { name: "Floor Accessories" },
    data: { category: "OTHER", customCategoryName: "Floor Accessories" },
  });
  await prisma.product.updateMany({
    where: { name: "LED Mirror" },
    data: { category: "OTHER", customCategoryName: "LED Mirror" },
  });
  await prisma.product.updateMany({
    where: { name: "Tile Finish Edge" },
    data: { category: "OTHER", customCategoryName: "Tile Finish Edge" },
  });
  await prisma.product.updateMany({
    where: { name: "Shampoo Niche" },
    data: { category: "OTHER", customCategoryName: "Shampoo Niche" },
  });
  await prisma.product.updateMany({
    where: { name: "Shower Glass Door" },
    data: { category: "OTHER", customCategoryName: "Bathroom Shower Glass Door" },
  });
  console.log("Done! All 5 products updated.");
}

main().then(() => prisma.$disconnect());
