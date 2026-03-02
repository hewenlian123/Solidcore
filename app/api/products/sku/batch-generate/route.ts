import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { generateVariantSku } from "@/lib/sku/generateVariantSku";
import { getEffectiveSpecs } from "@/lib/specs/glass";

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function toIntPart(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const variants = await prisma.productVariant.findMany({
      select: {
        id: true,
        sku: true,
        width: true,
        height: true,
        color: true,
        glassFinishOverride: true,
        product: {
          select: {
            id: true,
            skuPrefix: true,
            glassTypeDefault: true,
            glassFinishDefault: true,
            screenDefault: true,
            openingTypeDefault: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const existingSkuSet = new Set<string>(variants.map((row) => normalizeSkuValue(row.sku)));
    const reservedTargetSet = new Set<string>();

    const updates: Array<{ id: string; sku: string }> = [];
    let skippedNoPrefix = 0;
    let skippedNoSize = 0;
    let skippedNonDefault = 0;
    let skippedConflict = 0;

    for (const variant of variants) {
      const currentSku = normalizeSkuValue(variant.sku);
      if (!currentSku.startsWith("VAR-")) {
        skippedNonDefault += 1;
        continue;
      }

      const prefix = normalizeSkuValue(variant.product?.skuPrefix ?? "");
      if (!prefix) {
        skippedNoPrefix += 1;
        continue;
      }

      const width = toIntPart(variant.width);
      const height = toIntPart(variant.height);
      if (width === null || height === null) {
        skippedNoSize += 1;
        continue;
      }

      const effectiveSpecs = getEffectiveSpecs(variant.product, variant);
      const targetSku = generateVariantSku({
        skuPrefix: prefix,
        width,
        height,
        color: variant.color,
        glassFinish: effectiveSpecs.glassFinish,
      }).effectiveSku;
      if (!targetSku) {
        skippedNoSize += 1;
        continue;
      }

      const hasConflict =
        (existingSkuSet.has(targetSku) && targetSku !== currentSku) || reservedTargetSet.has(targetSku);
      if (hasConflict) {
        skippedConflict += 1;
        continue;
      }

      updates.push({ id: variant.id, sku: targetSku });
      reservedTargetSet.add(targetSku);
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((item) =>
          prisma.productVariant.update({
            where: { id: item.id },
            data: { sku: item.sku },
          }),
        ),
      );
    }

    return NextResponse.json(
      {
        data: {
          updated: updates.length,
          skippedNoPrefix,
          skippedNoSize,
          skippedNonDefault,
          skippedConflict,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/products/sku/batch-generate error:", error);
    return NextResponse.json({ error: "Failed to batch generate SKU." }, { status: 500 });
  }
}
