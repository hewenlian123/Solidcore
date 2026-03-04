import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ data: [] }, { status: 200 });

    const rows = await prisma.productVariant.findMany({
      where: {
        isStockItem: true,
        archivedAt: null,
        product: { active: true },
        OR: [
          { sku: { contains: q } },
          { displayName: { contains: q } },
          { description: { contains: q } },
          { product: { name: { contains: q } } },
          { product: { title: { contains: q } } },
          { product: { brand: { contains: q } } },
          { product: { collection: { contains: q } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        sku: true,
        displayName: true,
        imageUrl: true,
        price: true,
        reorderLevel: true,
        productId: true,
        product: {
          select: {
            name: true,
            price: true,
            unit: true,
          },
        },
        inventoryStock: {
          select: {
            onHand: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        data: rows.map((row) => ({
          id: row.id,
          productId: row.productId,
          name: row.displayName || row.product.name,
          sku: row.sku,
          imageUrl: row.imageUrl ?? null,
          salePrice: Number(row.price ?? row.product.price ?? 0),
          onHand: Number(row.inventoryStock?.onHand ?? 0),
          unit: row.product.unit ?? null,
          reorderLevel: Number(row.reorderLevel ?? 0),
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/products/search error:", error);
    return NextResponse.json({ error: "Failed to search products." }, { status: 500 });
  }
}
