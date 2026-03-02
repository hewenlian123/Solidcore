import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type CategoryMap = Record<string, string>;

function toNum(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalize(text: unknown) {
  return String(text ?? "").trim();
}

function buildVariantText(args: {
  width?: number | null;
  height?: number | null;
  color?: string | null;
  variantType?: string | null;
  thicknessMm?: number | null;
  boxSqft?: number | null;
}) {
  const parts: string[] = [];
  if (args.width || args.height) parts.push(`${args.width ?? "-"}x${args.height ?? "-"}`);
  if (args.color) parts.push(args.color);
  if (args.variantType) parts.push(args.variantType);
  if (args.thicknessMm) parts.push(`${args.thicknessMm}mm`);
  if (args.boxSqft) parts.push(`${args.boxSqft} sqft/box`);
  return parts.join(" / ") || "-";
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const q = normalize(searchParams.get("q")).toLowerCase();

    const variants = await prisma.productVariant.findMany({
      where: { isStockItem: true },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            title: true,
            defaultDescription: true,
            cost: true,
            price: true,
            active: true,
          },
        },
        inventoryStock: {
          select: {
            onHand: true,
            reserved: true,
          },
        },
      },
    });

    const productIds = Array.from(new Set(variants.map((item) => item.productId)));
    const productMetaRows = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, category: true, name: true },
        })
      : [];
    const categoryByProductId = productMetaRows.reduce<CategoryMap>((acc, item) => {
      acc[item.id] = item.category;
      return acc;
    }, {});

    const rows = variants
      .filter((item) => item.product?.active !== false)
      .map((item) => {
        const onHand = toNum(item.inventoryStock?.onHand);
        const reserved = toNum(item.inventoryStock?.reserved);
        const available = onHand - reserved;
        const cost = toNum(item.cost ?? item.product.cost);
        const price = toNum(item.price ?? item.product.price);
        const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
        const productName = normalize(item.product.title || item.product.name || "Unnamed Product");
        const variantText = buildVariantText({
          width: item.width ? toNum(item.width) : null,
          height: item.height ? toNum(item.height) : null,
          color: item.color,
          variantType: item.variantType,
          thicknessMm: item.thicknessMm ? toNum(item.thicknessMm) : null,
          boxSqft: item.boxSqft ? toNum(item.boxSqft) : null,
        });
        const category = normalize(categoryByProductId[item.productId] || "UNCATEGORIZED");
              const description = normalize(item.description || item.product.defaultDescription || "");
        return {
          id: item.id,
          sku: item.sku,
          category,
          productName,
          variantText,
                description,
          cost,
          price,
          margin,
          availableStock: available,
          sizeSort: variantText.toLowerCase(),
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.sku.toLowerCase().includes(q) ||
          row.productName.toLowerCase().includes(q) ||
                row.variantText.toLowerCase().includes(q) ||
                row.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const categoryCmp = a.category.localeCompare(b.category);
        if (categoryCmp !== 0) return categoryCmp;
        const nameCmp = a.productName.localeCompare(b.productName);
        if (nameCmp !== 0) return nameCmp;
        return a.sizeSort.localeCompare(b.sizeSort);
      });

    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error) {
    console.error("GET /api/price-list error:", error);
    return NextResponse.json({ error: "Failed to fetch price list." }, { status: 500 });
  }
}
