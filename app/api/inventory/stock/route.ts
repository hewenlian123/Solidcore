import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export type StockRow = {
  id: string;
  sku: string;
  productName: string;
  variantName: string | null;
  currentStock: number;
  minStock: number;
  status: "ok" | "low" | "out";
};

export const dynamic = "force-dynamic";

function statusFromStock(current: number, min: number): "ok" | "low" | "out" {
  if (current <= 0) return "out";
  if (min > 0 && current < min) return "low";
  return "ok";
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

    const variantWhere: {
      archivedAt?: null;
      OR?: Array<{
        sku?: { contains: string; mode: "insensitive" };
        displayName?: { contains: string; mode: "insensitive" };
        product?: { name: { contains: string; mode: "insensitive" } };
      }>;
    } = { archivedAt: null };
    if (q) {
      variantWhere.OR = [
        { sku: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const variants = await prisma.productVariant.findMany({
      where: variantWhere,
      select: {
        id: true,
        sku: true,
        displayName: true,
        reorderLevel: true,
        product: { select: { name: true } },
        inventoryStock: { select: { onHand: true } },
      },
      orderBy: [{ sku: "asc" }],
    });

    const rows: StockRow[] = variants.map((v) => {
      const current = Number(v.inventoryStock?.onHand ?? 0);
      const min = Number(v.reorderLevel ?? 0);
      return {
        id: v.id,
        sku: v.sku,
        productName: v.product?.name ?? "-",
        variantName: v.displayName ?? null,
        currentStock: current,
        minStock: min,
        status: statusFromStock(current, min),
      };
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("GET /api/inventory/stock error:", err);
    return NextResponse.json({ error: "Failed to fetch stock levels." }, { status: 500 });
  }
}
