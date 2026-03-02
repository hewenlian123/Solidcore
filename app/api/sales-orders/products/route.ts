import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderDescription } from "@/lib/description/renderDescription";
import { ensureDescriptionTemplateSeeds } from "@/lib/description/templates";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getCustomerSpecLine, getEffectiveSpecs } from "@/lib/specs/glass";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    await ensureDescriptionTemplateSeeds();
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();

    const data = await prisma.productVariant.findMany({
      where: {
        isStockItem: true,
        product: { active: true },
        ...(q
          ? {
              OR: [
                { sku: { contains: q } },
                { description: { contains: q } },
                { openingTypeOverride: { contains: q } },
                { screenOverride: { contains: q } },
                { variantType: { contains: q } },
                { product: { name: { contains: q } } },
                { product: { title: { contains: q } } },
                { product: { brand: { contains: q } } },
                { product: { collection: { contains: q } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            title: true,
            defaultDescription: true,
            glassTypeDefault: true,
            glassFinishDefault: true,
            screenDefault: true,
            openingTypeDefault: true,
            brand: true,
            collection: true,
              price: true,
              cost: true,
              unit: true,
              active: true,
          },
        },
        inventoryStock: {
          select: { onHand: true, reserved: true },
        },
      },
    });
    const productMetaRows =
      data.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: Array.from(new Set(data.map((variant) => variant.productId))) } },
            select: {
              id: true,
              category: true,
              name: true,
              material: true,
              color: true,
              sizeW: true,
              sizeH: true,
              thicknessMm: true,
              glass: true,
              glassTypeDefault: true,
              glassFinishDefault: true,
              screenDefault: true,
              openingTypeDefault: true,
              type: true,
              style: true,
              rating: true,
              finish: true,
              swing: true,
              handing: true,
            },
          })
        : [];
    const productMetaById = new Map(productMetaRows.map((row) => [row.id, row]));
    const templateRows = await prisma.descriptionTemplate.findMany({
      where: { enabled: true },
      select: { category: true, templateJson: true },
    });
    const templateByCategory = new Map(templateRows.map((row) => [row.category, row.templateJson]));

    const mappedData = data.map((variant) => ({
          ...(function () {
            const productMeta = productMetaById.get(variant.productId);
            const normalizedCategory = String(productMeta?.category ?? "");
            const categoryName =
              normalizedCategory === "WINDOW"
                ? "Windows"
                : normalizedCategory === "FLOOR"
                  ? "Flooring"
                  : normalizedCategory === "DOOR"
                    ? "Doors"
                    : normalizedCategory === "MIRROR"
                      ? "Mirrors"
                      : normalizedCategory;
            const generatedDescription = renderDescription({
              category: categoryName,
              product: {
                ...productMeta,
                name: variant.product.name,
              },
              variant: {
                ...variant,
                type: variant.variantType,
              },
              templateJson: templateByCategory.get(categoryName) ?? null,
            });
            return {
              specsLine:
                productMeta?.category === "WINDOW"
                  ? getCustomerSpecLine(
                      getEffectiveSpecs(productMeta, {
                        glassTypeOverride: variant.glassTypeOverride,
                        glassFinishOverride: variant.glassFinishOverride,
                        screenOverride: variant.screenOverride,
                        openingTypeOverride: variant.openingTypeOverride,
                        glassType: variant.glassType,
                        screenType: variant.screenType,
                        slideDirection: variant.slideDirection,
                      }),
                    )
                  : "",
              category: categoryName || null,
              generatedDescription:
                (productMeta?.category === "WINDOW"
                  ? getCustomerSpecLine(
                      getEffectiveSpecs(productMeta, {
                        glassTypeOverride: variant.glassTypeOverride,
                        glassFinishOverride: variant.glassFinishOverride,
                        screenOverride: variant.screenOverride,
                        openingTypeOverride: variant.openingTypeOverride,
                        glassType: variant.glassType,
                        screenType: variant.screenType,
                        slideDirection: variant.slideDirection,
                      }),
                    )
                  : generatedDescription) || null,
            };
          })(),
          id: variant.id,
          productId: variant.productId,
          name: variant.product.name,
          title: variant.product.name,
          sku: variant.sku,
          variantDescription: variant.description ?? null,
          defaultDescription: variant.product.defaultDescription ?? null,
          brand: variant.product.brand,
          collection: variant.product.collection,
          onHandStock: String(Number(variant.inventoryStock?.onHand ?? 0)),
          availableStock: String(
            Number(variant.inventoryStock?.onHand ?? 0) - Number(variant.inventoryStock?.reserved ?? 0),
          ),
          price: String(variant.price ?? 0),
        }));
    const qLower = q.toLowerCase();
    const filtered = qLower
      ? mappedData.filter((variant) => {
          const productMeta = productMetaById.get(variant.productId);
          const sizeText =
            productMeta?.sizeW !== null && productMeta?.sizeW !== undefined &&
            productMeta?.sizeH !== null && productMeta?.sizeH !== undefined
              ? `${productMeta.sizeW}x${productMeta.sizeH}`
              : "";
          const searchBlob = [
            variant.sku,
            variant.name,
            variant.title,
            variant.brand,
            variant.collection,
            variant.variantDescription,
            productMeta?.color,
            productMeta?.type,
            productMeta?.glass,
            sizeText,
            variant.generatedDescription,
          ]
            .map((value) => String(value ?? "").toLowerCase())
            .join(" ");
          return searchBlob.includes(qLower);
        })
      : mappedData;

    return NextResponse.json({ data: filtered }, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales-orders/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products." }, { status: 500 });
  }
}
