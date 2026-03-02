import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATASET = [
  {
    productName: "Vinyl Window",
    unit: "PIECE",
    defaultPrice: 65.97,
    defaultCost: 40,
    variants: [
      {
        sku: "VWW3636",
        width: 36,
        height: 36,
        color: "White",
        variantType: "Vinyl Window",
        thicknessMm: null,
        boxSqft: null,
        price: 65.97,
        cost: 40,
        onHand: 49,
        glass: "Tempered",
      },
      {
        sku: "VWW4848",
        width: 48,
        height: 48,
        color: "White",
        variantType: "Vinyl Window",
        thicknessMm: null,
        boxSqft: null,
        price: 119.0,
        cost: 80,
        onHand: 12,
        glass: "Tempered",
      },
      {
        sku: "VWB6060",
        width: 60,
        height: 60,
        color: "Black",
        variantType: "Vinyl Window",
        thicknessMm: null,
        boxSqft: null,
        price: 159.0,
        cost: 110,
        onHand: 6,
        glass: "Tempered",
      },
    ],
  },
  {
    productName: "SPC Flooring",
    unit: "SQFT",
    defaultPrice: 2.89,
    defaultCost: 1.75,
    variants: [
      {
        sku: "SPCOAK5",
        width: null,
        height: null,
        color: "Oak",
        variantType: "SPC Flooring",
        thicknessMm: 5,
        boxSqft: 22.5,
        price: 2.89,
        cost: 1.75,
        onHand: 450,
        glass: null,
      },
      {
        sku: "SPCGRY5",
        width: null,
        height: null,
        color: "Grey",
        variantType: "SPC Flooring",
        thicknessMm: 5,
        boxSqft: 22.5,
        price: 2.69,
        cost: 1.65,
        onHand: 320,
        glass: null,
      },
    ],
  },
  {
    productName: "Interior Door",
    unit: "PIECE",
    defaultPrice: 179.0,
    defaultCost: 120,
    variants: [
      {
        sku: "ID3680W",
        width: 36,
        height: 80,
        color: "White",
        variantType: "Interior Door",
        thicknessMm: null,
        boxSqft: null,
        price: 179.0,
        cost: 120,
        onHand: 8,
        glass: null,
      },
      {
        sku: "ID3280W",
        width: 32,
        height: 80,
        color: "White",
        variantType: "Interior Door",
        thicknessMm: null,
        boxSqft: null,
        price: 169.0,
        cost: 115,
        onHand: 10,
        glass: null,
      },
    ],
  },
];

function toDisplayName(productName, variant) {
  const size =
    variant.width !== null && variant.height !== null
      ? `${variant.width}''x${variant.height}''`
      : "";
  if (size && variant.color) return `${productName}-${size}(${variant.color})`;
  if (size) return `${productName}-${size}`;
  if (variant.color) return `${productName}(${variant.color})`;
  return productName;
}

function toDescriptionLines(productName, variant) {
  const lines = [];
  lines.push(`Product: ${productName}`);
  if (variant.width !== null && variant.height !== null) {
    lines.push(`Size: ${variant.width} x ${variant.height}`);
  }
  if (variant.color) lines.push(`Color: ${variant.color}`);
  if (variant.variantType) lines.push(`Type: ${variant.variantType}`);
  if (variant.glass) lines.push(`Glass: ${variant.glass}`);
  if (variant.thicknessMm !== null) lines.push(`Thickness: ${variant.thicknessMm}mm`);
  if (variant.boxSqft !== null) lines.push(`Box: ${variant.boxSqft} sqft`);
  return lines.join("\n");
}

async function getOrCreateProduct(row) {
  const existing = await prisma.salesProduct.findFirst({
    where: { name: row.productName },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.salesProduct.create({
    data: {
      name: row.productName,
      title: row.productName,
      unit: row.unit,
      availableStock: 0,
      price: row.defaultPrice,
      cost: row.defaultCost,
      active: true,
    },
  });
}

async function main() {
  const createdReportRows = [];
  let createdProducts = 0;
  let createdVariants = 0;
  let createdStockRows = 0;
  let skippedExistingVariants = 0;

  for (const productRow of DATASET) {
    const productBefore = await prisma.salesProduct.findFirst({
      where: { name: productRow.productName },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const product = await getOrCreateProduct(productRow);
    if (!productBefore) createdProducts += 1;

    for (const variantRow of productRow.variants) {
      const existingVariant = await prisma.productVariant.findUnique({
        where: { sku: variantRow.sku },
        select: { id: true, sku: true, productId: true },
      });

      let variantId = existingVariant?.id ?? null;
      if (!existingVariant) {
        const createdVariant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: variantRow.sku,
            description: toDescriptionLines(productRow.productName, variantRow),
            width: variantRow.width,
            height: variantRow.height,
            color: variantRow.color,
            variantType: variantRow.variantType,
            thicknessMm: variantRow.thicknessMm,
            boxSqft: variantRow.boxSqft,
            cost: variantRow.cost,
            price: variantRow.price,
            reorderLevel: 0,
            reorderQty: 0,
            isStockItem: true,
          },
          select: { id: true },
        });
        variantId = createdVariant.id;
        createdVariants += 1;
        createdReportRows.push({
          displayName: toDisplayName(productRow.productName, variantRow),
          sku: variantRow.sku,
          onHand: variantRow.onHand,
          price: variantRow.price,
        });
      } else {
        skippedExistingVariants += 1;
      }

      if (!variantId) continue;

      const stockExists = await prisma.inventoryStock.findUnique({
        where: { variantId },
        select: { id: true },
      });
      if (!stockExists) {
        await prisma.inventoryStock.create({
          data: {
            variantId,
            onHand: variantRow.onHand,
            reserved: 0,
          },
        });
        createdStockRows += 1;
      }
    }
  }

  console.log("Seed complete: test catalog items");
  console.log(
    `Created products: ${createdProducts}, created variants: ${createdVariants}, created inventory rows: ${createdStockRows}, skipped existing variants: ${skippedExistingVariants}`,
  );
  if (createdReportRows.length === 0) {
    console.log("No new variants inserted.");
    return;
  }
  console.log("\nCreated variants:");
  for (const row of createdReportRows) {
    console.log(
      `- ${row.displayName} | sku=${row.sku} | onHand=${Number(row.onHand).toFixed(2)} | price=${Number(row.price).toFixed(2)}`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Failed to seed test items:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
