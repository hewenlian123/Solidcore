import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const attribute = searchParams.get("attribute");

    const rows = await prisma.productAttributeDictionary.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { OR: [{ categoryId }, { categoryId: null }] } : {}),
        ...(attribute ? { attribute: attribute.toLowerCase() } : {}),
      },
      orderBy: [{ attribute: "asc" }, { value: "asc" }],
      select: {
        id: true,
        attribute: true,
        value: true,
        code: true,
        categoryId: true,
      },
    });

    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error) {
    console.error("GET /api/product-attributes-dictionary error:", error);
    return NextResponse.json({ error: "Failed to load attribute dictionary." }, { status: 500 });
  }
}
