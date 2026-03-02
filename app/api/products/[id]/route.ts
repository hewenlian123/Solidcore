import { GlassFinish, GlassType, Prisma, ProductCategory, ProductUnit } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderTemplateSku } from "@/lib/product-template-engine";
import { ensureProductTemplateSeeds } from "@/lib/product-templates";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { normalizeNullableString } from "@/lib/normalize-nullable-string";
import { generateVariantSku } from "@/lib/sku/generateVariantSku";

type Params = {
  params: Promise<{ id: string }>;
};

function toMaybeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function toIntPart(value: number | null) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

type UpsertVariantInput = {
  id?: string;
  sku: string;
  width: number;
  height: number;
  color: string | null;
  salePrice: number;
  cost: number;
  openingStock: number;
};

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

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing product ID." }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true, category: true } },
        group: { select: { id: true, name: true, description: true } },
      },
    });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const salesProduct = await prisma.salesProduct.findUnique({
      where: { id: product.id },
      select: {
        skuPrefix: true,
        defaultDescription: true,
        glassTypeDefault: true,
        glassFinishDefault: true,
        screenDefault: true,
        openingTypeDefault: true,
      },
    });

    const data = {
      ...product,
      skuPrefix: salesProduct?.skuPrefix ?? null,
      defaultDescription: salesProduct?.defaultDescription ?? product.defaultDescription ?? null,
      glassTypeDefault: salesProduct?.glassTypeDefault ?? null,
      glassFinishDefault: salesProduct?.glassFinishDefault ?? null,
      screenDefault: salesProduct?.screenDefault ?? null,
      openingTypeDefault: salesProduct?.openingTypeDefault ?? null,
    };

    if (role === "ADMIN") return NextResponse.json({ data }, { status: 200 });
    if (role === "SALES") {
      return NextResponse.json({ data: { ...data, costPrice: null } }, { status: 200 });
    }
    return NextResponse.json({ data: { ...data, costPrice: null, salePrice: null } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch product detail." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json();

    const category = String(payload?.category ?? "").trim() as ProductCategory;
    const unit = String(payload?.unit ?? "").trim() as ProductUnit;
    if (!Object.values(ProductCategory).includes(category)) {
      return NextResponse.json({ error: "Invalid product category." }, { status: 400 });
    }
    if (!Object.values(ProductUnit).includes(unit)) {
      return NextResponse.json({ error: "Invalid product unit." }, { status: 400 });
    }

    const brand = String(payload?.brand ?? "").trim() || null;
    const collection = String(payload?.collection ?? "").trim() || null;
    const model = String(payload?.model ?? "").trim() || null;
    const material = String(payload?.material ?? "").trim() || null;
    const type = String(payload?.type ?? "").trim() || null;
    const style = String(payload?.style ?? "").trim() || null;
    const screenType = String(payload?.screenType ?? "").trim() || null;
    const color = String(payload?.color ?? "").trim() || null;
    const finish = String(payload?.finish ?? "").trim() || null;
    const glass = String(payload?.glass ?? "").trim() || null;
    const glassTypeDefault = parseGlassType(payload?.glassTypeDefault);
    const glassFinishDefault = parseGlassFinish(payload?.glassFinishDefault) ?? "CLEAR";
    const screenDefault = String(payload?.screenDefault ?? "").trim() || null;
    const openingTypeDefault = String(payload?.openingTypeDefault ?? "").trim() || null;
    const rating = String(payload?.rating ?? "").trim() || null;
    const swing = String(payload?.swing ?? "").trim() || null;
    const handing = String(payload?.handing ?? "").trim() || null;
    const notes = String(payload?.notes ?? "").trim() || null;
    const defaultDescription = String(payload?.defaultDescription ?? "").trim() || null;
    const variantDescription = String(payload?.variantDescription ?? "").trim() || null;
    const categoryId = String(payload?.categoryId ?? "").trim() || null;
    const customCategoryName = String(payload?.customCategoryName ?? "").trim() || null;
    const warehouseId = String(payload?.warehouseId ?? "").trim();
    const supplierId = String(payload?.supplierId ?? "").trim() || null;
    const groupId = String(payload?.groupId ?? "").trim() || null;
    const titleInput = String(payload?.title ?? "").trim();
    const titleOverride = Boolean(payload?.titleOverride);
    const skuPrefixInput = normalizeSkuValue(String(payload?.skuPrefix ?? ""));
    const variantSkuOverrideRaw = normalizeNullableString(payload?.variantSku);
    const variantSkuOverrideInput = variantSkuOverrideRaw
      ? normalizeSkuValue(variantSkuOverrideRaw)
      : null;
    const deprecatedSkuInput = normalizeNullableString(payload?.sku);
    const deprecatedSkuOverride = normalizeNullableString(payload?.skuOverride);
    const variantsInputRaw = Array.isArray(payload?.variants) ? payload.variants : [];
    const variantsInput: UpsertVariantInput[] = variantsInputRaw
      .map((item: any): UpsertVariantInput => ({
        id: String(item?.id ?? "").trim() || undefined,
        sku: normalizeSkuValue(String(item?.sku ?? "")),
        width: Number(item?.width ?? 0),
        height: Number(item?.height ?? 0),
        color: String(item?.color ?? "").trim() || null,
        salePrice: Number(item?.salePrice ?? 0),
        cost: Number(item?.cost ?? 0),
        openingStock: Number(item?.openingStock ?? 0),
      }))
      .filter((item: UpsertVariantInput) => item.sku);
    if (deprecatedSkuInput || deprecatedSkuOverride) {
      return NextResponse.json(
        { error: "Product-level SKU is deprecated. Please manage SKU on product variants only." },
        { status: 400 },
      );
    }

    const sizeW = toMaybeNumber(payload?.sizeW);
    const sizeH = toMaybeNumber(payload?.sizeH);
    const thicknessMm = toMaybeNumber(payload?.thicknessMm);
    const price = toMaybeNumber(payload?.price);
    const cost = toMaybeNumber(payload?.cost);
    const salePrice = Number(payload?.salePrice ?? 0);
    const costPrice = Number(payload?.costPrice ?? 0);
    if ([sizeW, sizeH, thicknessMm, price, cost].some((v) => v !== null && Number.isNaN(v))) {
      return NextResponse.json({ error: "Invalid numeric values." }, { status: 400 });
    }
    if (
      variantsInput.length === 0 &&
      (!Number.isFinite(salePrice) || !Number.isFinite(costPrice))
    ) {
      return NextResponse.json({ error: "Invalid numeric values." }, { status: 400 });
    }
    if (
      variantsInput.some(
        (item) =>
          Number.isNaN(item.salePrice) ||
          Number.isNaN(item.cost) ||
          Number.isNaN(item.openingStock) ||
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
    const effectiveSkuPrefix = skuPrefixInput;
    if (category === "WINDOW" && !effectiveSkuPrefix) {
      return NextResponse.json(
        { error: "SKU Prefix is required for Window products." },
        { status: 400 },
      );
    }
    const existingSalesProduct = await prisma.salesProduct.findUnique({
      where: { id },
      select: { skuPrefix: true },
    });
    const previousSkuPrefix = normalizeSkuValue(existingSalesProduct?.skuPrefix ?? "");
    const prefixChanged = category === "WINDOW" && previousSkuPrefix !== effectiveSkuPrefix;
    const existingVariants = await prisma.productVariant.findMany({
      where: { productId: id },
      select: {
        id: true,
        sku: true,
        width: true,
        height: true,
        color: true,
        glassFinishOverride: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const existingVariantById = new Map(existingVariants.map((item) => [item.id, item]));
    let prefixRegeneratedCount = 0;
    let resolvedVariantsInput = variantsInput;
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
      resolvedVariantsInput = variantsInput.map((item) => {
        const existingVariant = item.id ? existingVariantById.get(item.id) : null;
        const width = Number.isFinite(item.width) && item.width > 0 ? item.width : Number(existingVariant?.width ?? 0);
        const height =
          Number.isFinite(item.height) && item.height > 0 ? item.height : Number(existingVariant?.height ?? 0);
        const color = item.color ?? (existingVariant?.color ? String(existingVariant.color) : null);
        const effectiveFinish = (existingVariant?.glassFinishOverride as GlassFinish | null) ?? glassFinishDefault;
        const autoOld = generateVariantSku({
          skuPrefix: previousSkuPrefix,
          width,
          height,
          color: color ?? "",
          glassFinish: effectiveFinish,
        }).effectiveSku;
        const autoNew = generateVariantSku({
          skuPrefix: effectiveSkuPrefix,
          width,
          height,
          color: color ?? "",
          glassFinish: effectiveFinish,
        }).effectiveSku;
        const currentSku = normalizeSkuValue(item.sku || existingVariant?.sku || "");
        const hasManualOverride = Boolean(currentSku && autoOld && currentSku !== autoOld && currentSku !== autoNew);
        const nextSku =
          prefixChanged && !hasManualOverride
            ? autoNew || currentSku
            : currentSku || autoNew;
        if (nextSku && nextSku !== currentSku && prefixChanged && !hasManualOverride) {
          prefixRegeneratedCount += 1;
        }
        return {
          ...item,
          width,
          height,
          color,
          sku: nextSku,
        };
      });
    }
    if (resolvedVariantsInput.some((item) => !item.sku || item.sku.includes("-"))) {
      return NextResponse.json(
        { error: "Each variant requires valid size, SKU (no hyphen), sale price, cost, and opening stock." },
        { status: 400 },
      );
    }
    if (resolvedVariantsInput.length > 0) {
      const skuSet = new Set(resolvedVariantsInput.map((item) => item.sku));
      if (skuSet.size !== resolvedVariantsInput.length) {
        return NextResponse.json({ error: "Variant SKUs must be unique." }, { status: 400 });
      }
    }
    if (!warehouseId) {
      return NextResponse.json({ error: "Product name and warehouse are required." }, { status: 400 });
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
            select: { id: true, categoryId: true, titleTemplate: true, skuTemplate: true },
          })
        : null;
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
      glass_type_default: glassTypeDefault,
      glass_finish_default: glassFinishDefault,
      screen_default: screenDefault,
      opening_type_default: openingTypeDefault,
      rating,
      swing,
      handing,
      w: sizeW,
      h: sizeH,
      thk: thicknessMm,
      hand: handing,
    };
    const autoSku = template ? renderTemplateSku(template.skuTemplate, templateData, dictionaryRows) : "";
    const finalTitle =
      titleOverride ? titleInput || null : titleInput || String(payload?.name ?? "").trim() || null;
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
    const primaryVariant = resolvedVariantsInput[0];
    const resolvedSalePrice = primaryVariant ? primaryVariant.salePrice : salePrice;
    const resolvedCostPrice = primaryVariant ? primaryVariant.cost : costPrice;

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: String(payload?.name ?? "").trim() || "Product",
        barcode: String(payload?.barcode ?? "").trim() || null,
        specification: String(payload?.specification ?? "").trim() || null,
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
        uom: String(payload?.uom ?? "").trim() || null,
        price,
        cost,
        sku: null,
        title: finalTitle,
        titleOverride,
        skuOverride: false,
        defaultDescription,
        notes,
        unit,
        costPrice: resolvedCostPrice,
        salePrice: resolvedSalePrice,
        warehouseId,
        supplierId,
        groupId,
      },
    });

    const salesProductData = {
      id: updated.id,
      name: updated.name,
      title: finalTitle || updated.name,
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
      price: resolvedSalePrice,
      cost: resolvedCostPrice,
      active: true,
    };
    await prisma.salesProduct.upsert({
      where: { id: updated.id },
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

    const existingVariantSkuById = new Map(existingVariants.map((item) => [item.id, item.sku]));

    const generatedSku = normalizeSkuValue(autoNoHyphenSku || autoSku || "");
    const fallbackExistingSku = existingVariants[0]?.sku || "";
    const targetSku = variantSkuOverrideInput ?? (generatedSku || fallbackExistingSku || "");

    try {
      if (resolvedVariantsInput.length > 0) {
        for (const variant of resolvedVariantsInput) {
          const variantData = {
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
          };

          if (variant.id && existingVariantSkuById.has(variant.id)) {
            await prisma.productVariant.update({
              where: { id: variant.id },
              data: variantData,
            });
            await prisma.inventoryStock.upsert({
              where: { variantId: variant.id },
              update: {
                onHand: variant.openingStock,
              },
              create: {
                variantId: variant.id,
                onHand: variant.openingStock,
                reserved: 0,
              },
            });
          } else {
            const createdVariant = await prisma.productVariant.create({
              data: {
                ...variantData,
                productId: updated.id,
              },
            });
            await prisma.inventoryStock.create({
              data: {
                variantId: createdVariant.id,
                onHand: variant.openingStock,
                reserved: 0,
              },
            });
          }
        }
      } else if (existingVariants[0]) {
        await prisma.productVariant.update({
          where: { id: existingVariants[0].id },
          data: {
            sku: targetSku || existingVariants[0].sku,
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
            cost: cost ?? resolvedCostPrice,
            price: price ?? resolvedSalePrice,
            reorderLevel: 0,
            reorderQty: 0,
            isStockItem: true,
          },
        });
      } else {
        const createdVariant = await prisma.productVariant.create({
          data: {
            productId: updated.id,
            sku: targetSku || `VAR-${updated.id.slice(-8).toUpperCase()}`,
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
            cost: cost ?? resolvedCostPrice,
            price: price ?? resolvedSalePrice,
            reorderLevel: 0,
            reorderQty: 0,
            isStockItem: true,
          },
        });
        await prisma.inventoryStock.create({
          data: {
            variantId: createdVariant.id,
            onHand: 0,
            reserved: 0,
          },
        });
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "SKU already exists. Please use a different SKU." }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json(
      {
        data: updated,
        meta: {
          prefixChanged,
          prefixRegeneratedCount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing product ID." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.salesProduct.deleteMany({
        where: { id },
      });
      await tx.product.delete({
        where: { id },
      });
    });

    return NextResponse.json({ data: { id } }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Product not found." }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Cannot delete this product because it is referenced by existing records." },
          { status: 400 },
        );
      }
    }
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete product." }, { status: 500 });
  }
}
