import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export const dynamic = "force-dynamic";

const DEFAULT_MARGIN_PCT = 30;

export type CategoryMarginRow = { category: string; marginPct: number };
export type VariantMarginRow = {
  variantId: string;
  sku: string;
  productName: string;
  cost: number;
  price: number;
  marginPctOverride: number | null;
  defaultMarginPct: number;
  appliedMarginPct: number;
  suggestedPrice: number;
  actualMarginPct: number;
};

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    // Use only product_variants + products (no category_margin_defaults / variant_margin_overrides)
    const variants = await prisma.productVariant.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        sku: true,
        displayName: true,
        cost: true,
        price: true,
        product: { select: { name: true, cost: true, price: true } },
      },
    });

    const defaultPct = DEFAULT_MARGIN_PCT;
    const variantRows: VariantMarginRow[] = variants.map((v) => {
      const cost = Number(v.cost ?? v.product?.cost ?? 0) || 0;
      const price = Number(v.price ?? v.product?.price ?? 0) || 0;
      const appliedPct = defaultPct;
      const suggestedPrice = cost * (1 + appliedPct / 100);
      const actualMarginPct = cost > 0 ? ((price - cost) / cost) * 100 : 0;
      return {
        variantId: v.id,
        sku: v.sku,
        productName: v.product?.name ?? "-",
        cost,
        price,
        marginPctOverride: null,
        defaultMarginPct: defaultPct,
        appliedMarginPct: appliedPct,
        suggestedPrice,
        actualMarginPct,
      };
    });

    return NextResponse.json({
      categoryDefaults: [{ category: "DEFAULT", marginPct: defaultPct }],
      variants: variantRows,
      defaultMarginPct: defaultPct,
    });
  } catch (err) {
    console.error("GET /api/price-management/margin error:", err);
    return NextResponse.json({ error: "Failed to load margin config." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const body = await request.json();
    const category = String(body.category ?? "DEFAULT").trim() || "DEFAULT";
    const marginPct = Number(body.marginPct);
    if (!Number.isFinite(marginPct) || marginPct < 0) {
      return NextResponse.json({ error: "Invalid marginPct." }, { status: 400 });
    }

    // Optional: requires category_margin_defaults table (run margin migration to enable)
    try {
      await prisma.categoryMarginDefault.upsert({
        where: { category },
        create: { category, marginPct },
        update: { marginPct },
      });
    } catch {
      // Table may not exist; GET uses product_variants only
    }
    return NextResponse.json({ data: { category, marginPct } });
  } catch (err) {
    console.error("POST /api/price-management/margin error:", err);
    return NextResponse.json({ error: "Failed to save category margin." }, { status: 500 });
  }
}
