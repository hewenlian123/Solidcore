import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updates = [
    prisma.product.updateMany({
      where: { category: "OTHER", customCategoryName: "Floor Accessories" },
      data: { category: "FLOOR_ACCESSORIES", customCategoryName: null },
    }),
    prisma.product.updateMany({
      where: { category: "OTHER", customCategoryName: "LED Mirror" },
      data: { category: "LED_MIRROR", customCategoryName: null },
    }),
    prisma.product.updateMany({
      where: { category: "OTHER", customCategoryName: "Tile Finish Edge" },
      data: { category: "TILE_EDGE", customCategoryName: null },
    }),
    prisma.product.updateMany({
      where: { category: "OTHER", customCategoryName: "Shampoo Niche" },
      data: { category: "SHAMPOO_NICHE", customCategoryName: null },
    }),
    prisma.product.updateMany({
      where: {
        category: "OTHER",
        OR: [
          { customCategoryName: "Bathroom Shower Glass Door" },
          { name: "Shower Glass Door" },
        ],
      },
      data: { category: "SHOWER_DOOR", customCategoryName: null },
    }),
  ];

  const [floorAccessories, ledMirror, tileEdge, shampooNiche, showerDoor] = await prisma.$transaction(updates);

  console.log(
    JSON.stringify(
      {
        migrated: {
          FLOOR_ACCESSORIES: floorAccessories.count,
          LED_MIRROR: ledMirror.count,
          TILE_EDGE: tileEdge.count,
          SHAMPOO_NICHE: shampooNiche.count,
          SHOWER_DOOR: showerDoor.count,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("migrate-other-to-new-category-enums failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
