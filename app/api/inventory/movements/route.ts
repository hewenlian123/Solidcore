import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import {
  buildInventoryMovementWhere,
  parseInventoryMovementFilters,
  parseReturnIdFromMovementNote,
  toMovementLimit,
} from "@/lib/inventory-movements";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const filters = parseInventoryMovementFilters(searchParams);
    const cursor = String(searchParams.get("cursor") ?? "").trim();
    const limit = toMovementLimit(searchParams.get("limit"), 50, 200);
    const where = buildInventoryMovementWhere(filters);
    const hasSingleVariant = Boolean(filters.variantId);

    let balanceSeed: number | null = null;
    if (hasSingleVariant) {
      const stock = await prisma.inventoryStock.findUnique({
        where: { variantId: filters.variantId },
        select: { onHand: true },
      });
      const currentOnHand = Number(stock?.onHand ?? 0);
      if (!cursor) {
        balanceSeed = currentOnHand;
      } else {
        const cursorRow = await prisma.inventoryMovement.findUnique({
          where: { id: cursor },
          select: { id: true, createdAt: true },
        });
        if (!cursorRow) {
          balanceSeed = currentOnHand;
        } else {
          const prior = await prisma.inventoryMovement.aggregate({
            where: {
              ...where,
              OR: [
                { createdAt: { gt: cursorRow.createdAt } },
                {
                  AND: [
                    { createdAt: cursorRow.createdAt },
                    { id: { gte: cursorRow.id } },
                  ],
                },
              ],
            },
            _sum: { qty: true },
          });
          balanceSeed = currentOnHand - Number(prior._sum.qty ?? 0);
        }
      }
    }

    const rows = await prisma.inventoryMovement.findMany({
      where,
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            displayName: true,
            productId: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    const items = sliced.map((row) => {
      const returnId = parseReturnIdFromMovementNote(row.note);
      const qty = Number(row.qty);
      const balanceAfter = balanceSeed;
      const balanceBefore =
        balanceSeed === null || !Number.isFinite(balanceSeed)
          ? null
          : balanceSeed - qty;
      if (balanceBefore !== null) balanceSeed = balanceBefore;
      return {
        id: row.id,
        createdAt: row.createdAt,
        type: row.type,
        qty,
        unit: row.unit,
        note: row.note,
        variantId: row.variantId,
        sku: row.variant?.sku ?? null,
        displayName: row.variant?.displayName ?? row.variant?.product?.name ?? null,
        productId: row.variant?.productId ?? null,
        balanceAfter,
        balanceBefore,
        related: {
          fulfillmentId: row.fulfillmentId ?? null,
          returnId,
        },
      };
    });

    return NextResponse.json(
      {
        items,
        nextCursor,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/inventory/movements error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory movements." }, { status: 500 });
  }
}
