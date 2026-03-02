import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureProductTemplateSeeds } from "@/lib/product-templates";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    await ensureProductTemplateSeeds();

    const templates = await prisma.productCategoryTemplate.findMany({
      orderBy: { categoryLabel: "asc" },
      select: {
        id: true,
        categoryId: true,
        categoryKey: true,
        categoryLabel: true,
        titleTemplate: true,
        skuTemplate: true,
        requiredFields: true,
        fieldOrder: true,
      },
    });

    return NextResponse.json({ data: templates }, { status: 200 });
  } catch (error) {
    console.error("GET /api/product-category-templates error:", error);
    return NextResponse.json({ error: "Failed to load product templates." }, { status: 500 });
  }
}
