import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function endOfTodayUtc() {
  const start = startOfTodayUtc();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const now = new Date();
    const todayStart = startOfTodayUtc();
    const todayEnd = endOfTodayUtc();

    const [variants, overdueDeliveriesCount, specialOrdersFollowupCount] = await Promise.all([
      prisma.productVariant.findMany({
        where: { isStockItem: true },
        select: {
          id: true,
          sku: true,
          reorderLevel: true,
          inventoryStock: { select: { onHand: true, reserved: true } },
          product: { select: { id: true, name: true, title: true } },
        },
      }),
      prisma.salesOrderFulfillment.count({
        where: {
          type: "DELIVERY",
          scheduledDate: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      prisma.salesOrderItem.count({
        where: {
          isSpecialOrder: true,
          specialFollowupDate: { gte: todayStart, lt: todayEnd },
          OR: [{ specialOrderStatus: null }, { specialOrderStatus: { not: "COMPLETED" } }],
        },
      }),
    ]);

    const lowStockRows = variants
      .map((variant) => {
        const onHand = Number(variant.inventoryStock?.onHand ?? 0);
        const reserved = Number(variant.inventoryStock?.reserved ?? 0);
        const available = onHand - reserved;
        const reorderLevel = Number(variant.reorderLevel ?? 0);
        return {
          id: variant.id,
          sku: variant.sku,
          productId: variant.product.id,
          productName: variant.product.title ?? variant.product.name,
          available,
          reorderLevel,
          shortage: reorderLevel - available,
        };
      })
      .filter((row) => row.available <= row.reorderLevel)
      .sort((a, b) => b.shortage - a.shortage);

    return NextResponse.json(
      {
        data: {
          lowStockCount: lowStockRows.length,
          lowStockTop: lowStockRows.slice(0, 10).map((row) => ({
            id: row.id,
            sku: row.sku,
            productName: row.productName,
            available: row.available,
            reorderLevel: row.reorderLevel,
            productId: row.productId,
          })),
          lowStockTopList: lowStockRows.slice(0, 5).map((row) => ({
            id: row.id,
            sku: row.sku,
            productName: row.productName,
            available: row.available,
            reorderLevel: row.reorderLevel,
            productId: row.productId,
          })),
          overdueDeliveriesCount,
          specialOrdersFollowupCount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/inventory/alerts error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory alerts." }, { status: 500 });
  }
}
