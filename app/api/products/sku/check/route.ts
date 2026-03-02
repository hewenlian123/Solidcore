import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { searchParams } = new URL(request.url);
    const sku = normalizeSkuValue(searchParams.get("sku") ?? "");
    const productId = String(searchParams.get("productId") ?? "").trim();
    if (!sku) return NextResponse.json({ data: { exists: false, sku: "" } }, { status: 200 });

    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      select: { id: true, productId: true },
    });

    const exists = Boolean(variant && (!productId || variant.productId !== productId));
    return NextResponse.json(
      { data: { exists, sku, variantId: variant?.id ?? null, productId: variant?.productId ?? null } },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/products/sku/check error:", error);
    return NextResponse.json({ error: "Failed to validate SKU." }, { status: 500 });
  }
}
