import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

    const [totalProducts, variants] = await Promise.all([
      prisma.product.count(),
      prisma.productVariant.findMany({
        where: { archivedAt: null },
        select: {
          id: true,
          reorderLevel: true,
          cost: true,
          price: true,
          inventoryStock: { select: { onHand: true } },
          product: {
            select: {
              id: true,
              cost: true,
              price: true,
            },
          },
        },
      }),
    ]);

    const productIds = Array.from(new Set(variants.map((row) => String(row.product?.id ?? "")).filter(Boolean)));
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            category: true,
            customCategoryName: true,
            costPrice: true,
            salePrice: true,
          },
        })
      : [];
    const productById = new Map(products.map((row) => [row.id, row]));

    let totalUnitsInStock = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;
    let lowStockItems = 0;

    const categoryMap = new Map<
      string,
      {
        category: string;
        skus: number;
        totalUnits: number;
        costValue: number;
        retailValue: number;
      }
    >();

    for (const variant of variants) {
      const onHand = Number(variant.inventoryStock?.onHand ?? 0);
      const reorderLevel = Number(variant.reorderLevel ?? 0);
      const productMaster = productById.get(String(variant.product?.id ?? ""));
      const costPrice = Number(
        variant.cost ?? productMaster?.costPrice ?? variant.product?.cost ?? 0,
      );
      const salePrice = Number(
        variant.price ?? productMaster?.salePrice ?? variant.product?.price ?? 0,
      );
      const costValue = onHand * costPrice;
      const retailValue = onHand * salePrice;
      const category =
        productMaster?.category === "OTHER" && String(productMaster?.customCategoryName ?? "").trim()
          ? String(productMaster?.customCategoryName ?? "").trim()
          : String(productMaster?.category ?? "OTHER");

      totalUnitsInStock += onHand;
      totalCostValue += costValue;
      totalRetailValue += retailValue;
      if (onHand <= reorderLevel) lowStockItems += 1;

      const prev = categoryMap.get(category) ?? {
        category,
        skus: 0,
        totalUnits: 0,
        costValue: 0,
        retailValue: 0,
      };
      prev.skus += 1;
      prev.totalUnits += onHand;
      prev.costValue += costValue;
      prev.retailValue += retailValue;
      categoryMap.set(category, prev);
    }

    const categoryBreakdown = Array.from(categoryMap.values())
      .map((row) => {
        const marginValue = row.retailValue - row.costValue;
        const marginPct = row.retailValue > 0 ? (marginValue / row.retailValue) * 100 : 0;
        return {
          category: row.category,
          skus: row.skus,
          totalUnits: round2(row.totalUnits),
          costValue: round2(row.costValue),
          retailValue: round2(row.retailValue),
          marginPct: round2(marginPct),
        };
      })
      .sort((a, b) => b.costValue - a.costValue);

    return NextResponse.json(
      {
        data: {
          cards: {
            totalProducts,
            totalSkus: variants.length,
            totalUnitsInStock: round2(totalUnitsInStock),
            totalCostValue: round2(totalCostValue),
            totalRetailValue: round2(totalRetailValue),
            lowStockItems,
          },
          categoryBreakdown,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/inventory/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory summary." }, { status: 500 });
  }
}
