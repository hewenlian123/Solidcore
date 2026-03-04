import { ProductCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function mapCategoryName(categoryName: unknown): { category: ProductCategory; customCategoryName: string | null; label: string } {
  const raw = String(categoryName ?? "").trim();
  const key = raw.toUpperCase().replace(/[\s-]+/g, "_");

  if (key === "FLOORING") return { category: "FLOOR", customCategoryName: null, label: "Flooring" };
  if (key === "WINDOWS" || key === "WINDOW") return { category: "WINDOW", customCategoryName: null, label: "Windows" };
  if (key === "MIRROR" || key === "MIRRORS") return { category: "MIRROR", customCategoryName: null, label: "Mirror" };
  if (key === "LED_MIRROR") return { category: "OTHER", customCategoryName: "LED Mirror", label: "LED Mirror" };
  if (key === "FLOOR_ACCESSORIES") return { category: "OTHER", customCategoryName: "Floor Accessories", label: "Floor Accessories" };
  if (key === "TILE_FINISH_EDGE") return { category: "OTHER", customCategoryName: "Tile Finish Edge", label: "Tile Finish Edge" };
  if (key === "BATHROOM_SHOWER_GLASS_DOOR") {
    return { category: "OTHER", customCategoryName: "Bathroom Shower Glass Door", label: "Bathroom Shower Glass Door" };
  }
  if (key === "SHAMPOO_NICHE") return { category: "OTHER", customCategoryName: "Shampoo Niche", label: "Shampoo Niche" };
  return { category: "OTHER", customCategoryName: null, label: "Other" };
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const body = await request.json();
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds
          .map((id: unknown) => String(id ?? "").trim())
          .filter((id: string) => id.length > 0)
      : [];
    if (productIds.length === 0) {
      return NextResponse.json({ error: "Please select at least one product." }, { status: 400 });
    }

    const { category, customCategoryName, label } = mapCategoryName(body?.categoryName);
    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: {
        category,
        customCategoryName,
      },
    });

    return NextResponse.json(
      {
        data: {
          updatedCount: result.count,
          category,
          customCategoryName,
          label,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/products/bulk-category error:", error);
    return NextResponse.json({ error: "Failed to update product categories." }, { status: 500 });
  }
}
