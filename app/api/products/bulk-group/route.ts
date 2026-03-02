import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

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
    const groupIdRaw = body?.groupId;
    const groupId =
      groupIdRaw === null || groupIdRaw === undefined || String(groupIdRaw).trim() === ""
        ? null
        : String(groupIdRaw).trim();

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Please select at least one product." }, { status: 400 });
    }

    if (groupId) {
      const group = await prisma.inventoryGroup.findUnique({
        where: { id: groupId },
        select: { id: true },
      });
      if (!group) {
        return NextResponse.json({ error: "Inventory group not found." }, { status: 400 });
      }
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { groupId },
    });

    return NextResponse.json(
      { data: { updatedCount: result.count, groupId } },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/products/bulk-group error:", error);
    return NextResponse.json({ error: "Failed to update product groups." }, { status: 500 });
  }
}
