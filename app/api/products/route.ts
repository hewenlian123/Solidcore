import { GlassFinish, GlassType, Prisma, ProductCategory, ProductUnit } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderTemplateSku } from "@/lib/product-template-engine";
import { ensureProductTemplateSeeds } from "@/lib/product-templates";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { normalizeNullableString } from "@/lib/normalize-nullable-string";
import { generateVariantSku } from "@/lib/sku/generateVariantSku";

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function toIntPart(value: number | null) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function parseGlassType(value: unknown): GlassType | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return Object.values(GlassType).includes(normalized as GlassType) ? (normalized as GlassType) : null;
}

function parseGlassFinish(value: unknown): GlassFinish | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return Object.values(GlassFinish).includes(normalized as GlassFinish)
    ? (normalized as GlassFinish)
    : null;
}

type CreateVariantInput = {
  sku: string;
  width: number;
  height: number;
  color: string | null;
  salePrice: number;
  cost: number;
  openingStock: number;
};

function colorCodeFromColor(color: string) {
  const normalized = String(color ?? "").trim().toLowerCase();
  if (!normalized) return "";
  const map: Record<string, string> = {
    white: "W",
    black: "B",
    gray: "G",
    grey: "G",
    bronze: "Z",
  };
  return map[normalized] ?? normalized.slice(0, 1).toUpperCase();
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) {
      return deny();
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const customCategoryName = searchParams.get("customCategoryName");
    const groupId = searchParams.get("groupId");
    const lowStockOnly = searchParams.get("lowStockOnly") === "true";

    const where = {
      ...(category && category !== "ALL"
        ? { category: category as ProductCategory }
        : {}),
      ...(customCategoryName && customCategoryName !== "ALL"
        ? {
            category: ProductCategory.OTHER,
            customCategoryName,
          }
        : {}),
      ...(groupId && groupId !== "ALL" ? { groupId } : {}),
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        supplier: true,
        group: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    const salesProductRows = products.length
      ? await prisma.salesProduct.findMany({
          where: { id: { in: products.map((item) => item.id) } },
          select: {
            id: true,
            skuPrefix: true,
            defaultDescription: true,
            glassTypeDefault: true,
            glassFinishDefault: true,
            screenDefault: true,
            openingTypeDefault: true,
          },
        })
      : [];
    const salesProductMetaById = salesProductRows.reduce<
      Record<
        string,
        {
          skuPrefix: string | null;
          defaultDescription: string | null;
          glassTypeDefault: GlassType | null;
          glassFinishDefault: GlassFinish | null;
          screenDefault: string | null;
          openingTypeDefault: string | null;
        }
      >
    >((acc, row) => {
      acc[row.id] = {
        skuPrefix: row.skuPrefix ?? null,
        defaultDescription: row.defaultDescription ?? null,
        glassTypeDefault: row.glassTypeDefault ?? null,
        glassFinishDefault: row.glassFinishDefault ?? null,
        screenDefault: row.screenDefault ?? null,
        openingTypeDefault: row.openingTypeDefault ?? null,
      };
      return acc;
    }, {});
    const productIds = products.map((item) => item.id);
    const variants = productIds.length
      ? await prisma.productVariant.findMany({
          where: { productId: { in: productIds } },
          select: {
            id: true,
            productId: true,
            sku: true,
            description: true,
            cost: true,
            price: true,
            width: true,
            height: true,
            color: true,
            inventoryStock: {
              select: {
                onHand: true,
                reserved: true,
              },
            },
          },
        })
      : [];
    const variantsByProduct = variants.reduce<
      Record<
        string,
        Array<{
          id: string;
          sku: string;
          description: string | null;
          cost: number | null;
          price: number | null;
          width: number | null;
          height: number | null;
          color: string | null;
          onHand: number;
          reserved: number;
          available: number;
        }>
      >
    >((acc, variant) => {
      const onHand = Number(variant.inventoryStock?.onHand ?? 0);
      const reserved = Number(variant.inventoryStock?.reserved ?? 0);
      const row = {
        id: variant.id,
        sku: variant.sku,
        description: variant.description ?? null,
        cost: variant.cost != null ? Number(variant.cost) : null,
        price: variant.price != null ? Number(variant.price) : null,
        width: variant.width != null ? Number(variant.width) : null,
        height: variant.height != null ? Number(variant.height) : null,
        color: variant.color ?? null,
        onHand,
        reserved,
        available: onHand - reserved,
      };
      if (!acc[variant.productId]) acc[variant.productId] = [];
      acc[variant.productId].push(row);
      return acc;
    }, {});
    // Deprecated: product-level stock fields are no longer used for inventory calculations.
    const lowStockCount = 0;
    const filteredProducts = lowStockOnly ? [] : products;

    const data = filteredProducts.map((item) => {
      const productVariants = variantsByProduct[item.id] ?? [];
      const variantPrices = productVariants
        .map((variant) => (variant.price != null ? Number(variant.price) : null))
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const stockSummary = productVariants.reduce(
        (acc, variant) => {
          acc.onHand += variant.onHand;
          acc.reserved += variant.reserved;
          acc.available += variant.available;
          return acc;
        },
        { onHand: 0, reserved: 0, available: 0 },
      );
      const priceMin = variantPrices.length > 0 ? Math.min(...variantPrices) : null;
      const priceMax = variantPrices.length > 0 ? Math.max(...variantPrices) : null;
      const normalized = {
        ...item,
        skuPrefix: salesProductMetaById[item.id]?.skuPrefix ?? null,
        defaultDescription:
          salesProductMetaById[item.id]?.defaultDescription ?? item.defaultDescription ?? null,
        glassTypeDefault: salesProductMetaById[item.id]?.glassTypeDefault ?? null,
        glassFinishDefault: salesProductMetaById[item.id]?.glassFinishDefault ?? null,
        screenDefault: salesProductMetaById[item.id]?.screenDefault ?? null,
        openingTypeDefault: salesProductMetaById[item.id]?.openingTypeDefault ?? null,
        variants: productVariants,
        stockSummary,
        variantCount: productVariants.length,
        priceMin,
        priceMax,
        totalAvailable: stockSummary.available,
      };
      if (role === "ADMIN") return normalized;
      if (role === "SALES") {
        return { ...normalized, costPrice: null };
      }
      return { ...normalized, costPrice: null, salePrice: null };
    });

    return NextResponse.json(
      {
        data,
        meta: {
          lowStockThreshold: null,
          lowStockCount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products, please try again." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) {
      return deny();
    }

    const body = await request.json();

    const name = String(body?.name ?? "").trim();
    const barcode = String(body?.barcode ?? "").trim();
    const specification = String(body?.specification ?? "").trim();
    const category = body?.category as ProductCategory;
    const customCategoryNameRaw = String(body?.customCategoryName ?? "").trim();
    const customCategoryName = customCategoryNameRaw || null;
    const unit = body?.unit as ProductUnit;
    const warehouseId = String(body?.warehouseId ?? "").trim();
    const supplierId = String(body?.supplierId ?? "").trim();
    const groupId = String(body?.groupId ?? "").trim();
    const costPrice = Number(body?.costPrice);
    const salePrice = Number(body?.salePrice);
    const brand = String(body?.brand ?? "").trim() || null;
    const collection = String(body?.collection ?? "").trim() || null;
    const model = String(body?.model ?? "").trim() || null;
    const material = String(body?.material ?? "").trim() || null;
    const type = String(body?.type ?? "").trim() || null;
    const style = String(body?.style ?? "").trim() || null;
    const screenType = String(body?.screenType ?? "").trim() || null;
    const color = String(body?.color ?? "").trim() || null;
    const finish = String(body?.finish ?? "").trim() || null;
    const glass = String(body?.glass ?? "").trim() || null;
    const glassTypeDefault = parseGlassType(body?.glassTypeDefault);
    const glassFinishDefault = parseGlassFinish(body?.glassFinishDefault) ?? "CLEAR";
    const screenDefault = String(body?.screenDefault ?? "").trim() || null;
    const openingTypeDefault = String(body?.openingTypeDefault ?? "").trim() || null;
    const rating = String(body?.rating ?? "").trim() || null;
    const swing = String(body?.swing ?? "").trim() || null;
    const handing = String(body?.handing ?? "").trim() || null;
    const uom = String(body?.uom ?? "").trim() || null;
    const notes = String(body?.notes ?? "").trim() || null;
    const defaultDescription = String(body?.defaultDescription ?? "").trim() || null;
    const variantDescription = String(body?.variantDescription ?? "").trim() || null;
    const sizeW = body?.sizeW !== undefined && body?.sizeW !== "" ? Number(body?.sizeW) : null;
    const sizeH = body?.sizeH !== undefined && body?.sizeH !== "" ? Number(body?.sizeH) : null;
    const thicknessMm =
      body?.thicknessMm !== undefined && body?.thicknessMm !== "" ? Number(body?.thicknessMm) : null;
    const price = body?.price !== undefined && body?.price !== "" ? Number(body?.price) : null;
    const cost = body?.cost !== undefined && body?.cost !== "" ? Number(body?.cost) : null;
    const categoryId = String(body?.categoryId ?? "").trim() || null;
    const titleInput = String(body?.title ?? "").trim();
    const titleOverride = Boolean(body?.titleOverride);
    const skuPrefixInput = normalizeSkuValue(String(body?.skuPrefix ?? ""));
    const variantSkuOverrideRaw = normalizeNullableString(body?.variantSku);
    const variantSkuOverrideInput = variantSkuOverrideRaw
      ? normalizeSkuValue(variantSkuOverrideRaw)
      : null;
    const deprecatedSkuInput = normalizeNullableString(body?.sku);
    const deprecatedSkuOverride = normalizeNullableString(body?.skuOverride);
    const variantsInputRaw = Array.isArray(body?.variants) ? body.variants : [];
    const variantsInput: CreateVariantInput[] = variantsInputRaw
      .map((item: any): CreateVariantInput => ({
        sku: normalizeSkuValue(String(item?.sku ?? "")),
        width: Number(item?.width ?? 0),
        height: Number(item?.height ?? 0),
        color: String(item?.color ?? "").trim() || null,
        salePrice: Number(item?.salePrice ?? 0),
        cost: Number(item?.cost ?? 0),
        openingStock: Number(item?.openingStock ?? 0),
      }))
      .filter((item: CreateVariantInput) => item.sku);

    if (deprecatedSkuInput || deprecatedSkuOverride) {
      return NextResponse.json(
        { error: "Product-level SKU is deprecated. Please manage SKU on product variants only." },
        { status: 400 },
      );
    }

    if (!name || !warehouseId) {
      return NextResponse.json({ error: "Product name and warehouse are required." }, { status: 400 });
    }
    if (!Object.values(ProductCategory).includes(category)) {
      return NextResponse.json({ error: "Invalid product category." }, { status: 400 });
    }
    if (category === "OTHER" && !customCategoryName) {
      return NextResponse.json({ error: "Custom category name is required for Other." }, { status: 400 });
    }
    if (!Object.values(ProductUnit).includes(unit)) {
      return NextResponse.json({ error: "Invalid product unit." }, { status: 400 });
    }
    if (variantsInput.length === 0 && (Number.isNaN(costPrice) || Number.isNaN(salePrice))) {
      return NextResponse.json({ error: "Invalid price or stock format." }, { status: 400 });
    }
    if ([sizeW, sizeH, thicknessMm, price, cost].some((v) => v !== null && Number.isNaN(v))) {
      return NextResponse.json({ error: "Invalid template numeric fields." }, { status: 400 });
    }
    if (variantsInput.length === 0 && (costPrice < 0 || salePrice < 0)) {
      return NextResponse.json({ error: "Price or stock cannot be negative." }, { status: 400 });
    }
    if (
      variantsInput.some(
        (item) =>
          Number.isNaN(item.salePrice) ||
          Number.isNaN(item.cost) ||
          Number.isNaN(item.openingStock) ||
          item.sku.includes("-") ||
          item.salePrice < 0 ||
          item.cost < 0 ||
          item.openingStock < 0,
      )
    ) {
      return NextResponse.json(
        { error: "Each variant requires valid size, SKU (no hyphen), sale price, cost, and opening stock." },
        { status: 400 },
      );
    }
    if (variantsInput.length > 0) {
      const skuSet = new Set(variantsInput.map((item) => item.sku));
      if (skuSet.size !== variantsInput.length) {
        return NextResponse.json({ error: "Variant SKUs must be unique." }, { status: 400 });
      }
    }
    const effectiveSkuPrefix = skuPrefixInput;
    if (category === "WINDOW" && !effectiveSkuPrefix) {
      return NextResponse.json(
        { error: "SKU Prefix is required for Window products." },
        { status: 400 },
      );
    }
    if (category === "WINDOW") {
      const missingSize = variantsInput.some(
        (item) =>
          Number.isNaN(item.width) ||
          Number.isNaN(item.height) ||
          item.width <= 0 ||
          item.height <= 0,
      );
      if (missingSize) return NextResponse.json({ error: "Size is required." }, { status: 400 });
      const missingColor = variantsInput.some((item) => !item.color);
      if (missingColor) return NextResponse.json({ error: "Color is required." }, { status: 400 });
      const invalidColorCode = variantsInput.some((item) => {
        const code = colorCodeFromColor(item.color ?? "");
        const expectedSku = normalizeSkuValue(
          `${effectiveSkuPrefix}${Math.trunc(item.width)}${Math.trunc(item.height)}${code}`,
        );
        const expectedSkuWithF = normalizeSkuValue(`${expectedSku}F`);
        return !code || (item.sku !== expectedSku && item.sku !== expectedSkuWithF);
      });
      if (invalidColorCode) {
        return NextResponse.json(
          {
            error:
              "Auto SKU format: prefix + width + height (+ optional colorCode) with optional 'F' for Frosted.",
          },
          { status: 400 },
        );
      }
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found." }, { status: 400 });
    }

    if (supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });
      if (!supplier) {
        return NextResponse.json({ error: "Supplier not found." }, { status: 400 });
      }
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

    await ensureProductTemplateSeeds();
    const template =
      categoryId
        ? await prisma.productCategoryTemplate.findFirst({
            where: { OR: [{ id: categoryId }, { categoryId }] },
            select: { id: true, categoryId: true, titleTemplate: true, skuTemplate: true, requiredFields: true },
          })
        : null;

    if (template?.requiredFields && Array.isArray(template.requiredFields)) {
      const required = template.requiredFields as string[];
      const missing = required.filter((field) => {
        const valueMap: Record<string, unknown> = {
          brand,
          collection,
          model,
          material,
          type,
          style,
          screen_type: screenType,
          screen: screenType,
          color,
          finish,
          glass,
          rating,
          swing,
          handing,
          size_w: sizeW,
          size_h: sizeH,
          thickness_mm: thicknessMm,
          notes,
        };
        const value = valueMap[field];
        return value === null || value === undefined || String(value).trim() === "";
      });
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Missing required template fields: ${missing.join(", ")}` },
          { status: 400 },
        );
      }
    }

    const dictionaryRows = await prisma.productAttributeDictionary.findMany({
      where: {
        isActive: true,
        ...(template ? { OR: [{ categoryId: template.categoryId }, { categoryId: null }] } : {}),
      },
      select: { attribute: true, value: true, code: true },
    });

    const templateData = {
      brand,
      collection,
      model,
      material,
      type,
      style,
      screen_type: screenType,
      screen: screenType,
      color,
      finish,
      size_w: sizeW,
      size_h: sizeH,
      thickness_mm: thicknessMm,
      glass,
      rating,
      swing,
      handing,
      w: sizeW,
      h: sizeH,
      thk: thicknessMm,
      hand: handing,
    };

    const autoSku = template ? renderTemplateSku(template.skuTemplate, templateData, dictionaryRows) : "";
    const finalTitle = titleOverride ? titleInput || null : titleInput || name || null;
    const widthInt = toIntPart(sizeW);
    const heightInt = toIntPart(sizeH);
    const autoNoHyphenSku =
      skuPrefixInput && widthInt !== null && heightInt !== null
        ? generateVariantSku({
            skuPrefix: skuPrefixInput,
            width: widthInt,
            height: heightInt,
            color,
            glassFinish: glassFinishDefault,
          }).effectiveSku
        : "";
    const preferredSku = variantSkuOverrideInput ?? normalizeSkuValue(autoNoHyphenSku || autoSku || "");

    const primaryVariant = variantsInput[0];
    const fallbackCostPrice = variantsInput.length > 0 ? primaryVariant.cost : costPrice;
    const fallbackSalePrice = variantsInput.length > 0 ? primaryVariant.salePrice : salePrice;

    try {
      const product = await prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({
          data: {
            name,
            barcode: barcode || null,
            specification: specification || null,
            category,
            customCategoryName: category === "OTHER" ? customCategoryName : null,
            categoryId: template?.id ?? categoryId,
            brand,
            collection,
            model,
            material,
            type,
            style,
            screenType,
            color,
            finish,
            sizeW,
            sizeH,
            thicknessMm,
            glass,
            glassTypeDefault,
            glassFinishDefault,
            screenDefault,
            openingTypeDefault,
            rating,
            swing,
            handing,
            uom,
            price,
            cost,
            sku: null,
            title: finalTitle,
            titleOverride,
            skuOverride: false,
            defaultDescription,
            notes,
            unit,
            costPrice: fallbackCostPrice,
            salePrice: fallbackSalePrice,
            warehouseId,
            supplierId: supplierId || null,
            groupId: groupId || null,
          },
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
              },
            },
            supplier: true,
            group: true,
          },
        });

        const salesProductData = {
          id: createdProduct.id,
          name: name,
          title: finalTitle || name,
          defaultDescription,
          glassTypeDefault,
          glassFinishDefault,
          screenDefault,
          openingTypeDefault,
          brand,
          collection,
          skuPrefix: effectiveSkuPrefix || null,
          availableStock: 0,
          unit,
          price: fallbackSalePrice,
          cost: fallbackCostPrice,
          active: true,
        };
        await tx.salesProduct.upsert({
          where: { id: createdProduct.id },
          update: {
            name: salesProductData.name,
            title: salesProductData.title,
            defaultDescription: salesProductData.defaultDescription,
            glassTypeDefault: salesProductData.glassTypeDefault,
            glassFinishDefault: salesProductData.glassFinishDefault,
            screenDefault: salesProductData.screenDefault,
            openingTypeDefault: salesProductData.openingTypeDefault,
            brand: salesProductData.brand,
            collection: salesProductData.collection,
            skuPrefix: salesProductData.skuPrefix,
            availableStock: salesProductData.availableStock,
            unit: salesProductData.unit,
            price: salesProductData.price,
            cost: salesProductData.cost,
            active: salesProductData.active,
          },
          create: salesProductData,
        });

        if (variantsInput.length > 0) {
          for (const variant of variantsInput) {
            const createdVariant = await tx.productVariant.create({
              data: {
                productId: createdProduct.id,
                sku: variant.sku,
                description: variantDescription,
                width: variant.width > 0 ? variant.width : null,
                height: variant.height > 0 ? variant.height : null,
                color: variant.color || null,
                glassTypeOverride: null,
                glassFinishOverride: null,
                screenOverride: null,
                openingTypeOverride: null,
                variantType: type,
                thicknessMm,
                boxSqft: null,
                cost: variant.cost,
                price: variant.salePrice,
                reorderLevel: 0,
                reorderQty: 0,
                isStockItem: true,
              },
            });
            await tx.inventoryStock.create({
              data: {
                variantId: createdVariant.id,
                onHand: variant.openingStock,
                reserved: 0,
              },
            });
          }
        } else {
          await tx.productVariant.create({
            data: {
              productId: createdProduct.id,
              sku: preferredSku || `VAR-${createdProduct.id.slice(-8).toUpperCase()}`,
              description: variantDescription,
              width: sizeW,
              height: sizeH,
              color,
              glassTypeOverride: null,
              glassFinishOverride: null,
              screenOverride: null,
              openingTypeOverride: null,
              variantType: type,
              thicknessMm,
              boxSqft: null,
              cost: cost ?? fallbackCostPrice,
              price: price ?? fallbackSalePrice,
              reorderLevel: 0,
              reorderQty: 0,
              isStockItem: true,
            },
          });
        }
        return createdProduct;
      });

      return NextResponse.json({ data: product }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "SKU already exists. Please use a different SKU." }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to add product, please check input and retry." }, { status: 500 });
  }
}
