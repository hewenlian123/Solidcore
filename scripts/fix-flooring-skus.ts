import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_PARENT_NAMES = [
  "Flooring",
  "Floor Accessories",
  "LED Mirror",
  "Mirror",
  "Tile Finish Edge",
  "Shower Glass Door",
  "Windows",
  "Shampoo Niche",
];

function parseDisplayNameAndSku(rawDisplayName: string) {
  const text = String(rawDisplayName ?? "").trim();
  if (!text) return null;

  const dashIndex = text.lastIndexOf("-");
  if (dashIndex <= 0 || dashIndex >= text.length - 1) return null;

  const namePart = text.slice(0, dashIndex).trim();
  const suffixPart = text.slice(dashIndex + 1).trim();
  if (!namePart || !suffixPart) return null;

  // Only treat suffix as SKU if it looks SKU-like:
  // - contains at least one digit
  // - no lowercase letters
  // - after removing spaces, contains only letters/numbers/dot
  const compactSku = suffixPart.replace(/\s+/g, "").toUpperCase();
  if (!/\d/.test(compactSku)) return null;
  if (/[a-z]/.test(suffixPart)) return null;
  if (!/^[A-Z0-9.]+$/.test(compactSku)) return null;

  return {
    cleanedDisplayName: namePart,
    extractedSku: compactSku,
  };
}

async function main() {
  const parents = await prisma.product.findMany({
    where: { name: { in: TARGET_PARENT_NAMES } },
    select: { id: true, name: true },
  });
  const parentIds = parents.map((p) => p.id);

  if (parentIds.length === 0) {
    console.log("No target parent products found.");
    return;
  }

  const variants = await prisma.productVariant.findMany({
    where: { productId: { in: parentIds } },
    select: {
      id: true,
      productId: true,
      sku: true,
      displayName: true,
    },
  });

  const existingSkuMap = new Map<string, string>();
  for (const v of variants) {
    const key = String(v.sku ?? "").trim().toUpperCase();
    if (key) existingSkuMap.set(key, v.id);
  }

  let updated = 0;
  let skippedConflicts = 0;
  let skippedNoPattern = 0;

  for (const variant of variants) {
    const parsed = parseDisplayNameAndSku(variant.displayName ?? "");
    if (!parsed) {
      skippedNoPattern += 1;
      continue;
    }

    const nextSku = parsed.extractedSku;
    const currentSku = String(variant.sku ?? "").trim().toUpperCase();
    const shouldUpdateSku = !currentSku || currentSku !== nextSku;
    const shouldUpdateName = (variant.displayName ?? "").trim() !== parsed.cleanedDisplayName;
    if (!shouldUpdateSku && !shouldUpdateName) continue;

    const owner = existingSkuMap.get(nextSku);
    if (shouldUpdateSku && owner && owner !== variant.id) {
      skippedConflicts += 1;
      continue;
    }

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        sku: shouldUpdateSku ? nextSku : undefined,
        displayName: shouldUpdateName ? parsed.cleanedDisplayName : undefined,
      },
    });

    if (shouldUpdateSku) existingSkuMap.set(nextSku, variant.id);
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        targetParentsFound: parentIds.length,
        totalVariantsScanned: variants.length,
        variantsUpdated: updated,
        skippedNoSkuPattern: skippedNoPattern,
        skippedSkuConflicts: skippedConflicts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("fix-flooring-skus failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
