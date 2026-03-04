import {
  Prisma,
  ProductCategory,
  ProductUnit,
  FlooringMaterial,
  FlooringFinish,
  FlooringEdge,
  FlooringInstallation,
  FlooringUnderlayment,
  FlooringWaterResistance,
} from "@prisma/client";
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
  displayName: string | null;
  skuSuffix: string | null;
  width: number;
  height: number;
  color: string | null;
  salePrice: number;
  cost: number;
  openingStock: number;
  reorderLevel: number;
};

function normalizeDefaultText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDefaultInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer >= 0 ? integer : null;
}

function normalizeDefaultDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric >= 0 ? numeric : null;
}

function buildProductValidationWarnings(input: {
  defaultDescription: string | null;
  variantDescription: string | null;
  variantsInput: Array<{ sku: string }>;
}) {
  const warnings: string[] = [];
  if (!String(input.defaultDescription ?? "").trim()) {
    warnings.push("Description is empty for this product.");
  }
  if (input.variantsInput.length > 0) {
    const missingSkuCount = input.variantsInput.filter((row) => !String(row.sku ?? "").trim()).length;
    if (missingSkuCount > 0) warnings.push(`${missingSkuCount} inventory item(s) have empty SKU.`);
    if (!String(input.variantDescription ?? "").trim()) {
      warnings.push("Description is empty for product variants.");
    }
  }
  return warnings;
}

function safeEnumValues<T extends string>(
  enumObj: Record<string, T> | undefined,
  fallback: readonly T[],
) {
  if (enumObj && typeof enumObj === "object") {
    const values = Object.values(enumObj).filter((value): value is T => typeof value === "string");
    if (values.length > 0) return values;
  }
  return [...fallback];
}

function normalizeEnumChoice<T extends string>(value: unknown, allowed: readonly T[]) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_") as T;
  if (!normalized) return null;
  return allowed.includes(normalized) ? normalized : null;
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
        frameMaterialDefault: true,
        slidingConfigDefault: true,
        glassTypeDefault: true,
        glassCoatingDefault: true,
        glassThicknessMmDefault: true,
        glassFinishDefault: true,
        screenDefault: true,
        openingTypeDefault: true,
        flooringBrand: true,
        flooringSeries: true,
        flooringMaterial: true,
        flooringWearLayer: true,
        flooringThicknessMm: true,
        flooringPlankLengthIn: true,
        flooringPlankWidthIn: true,
        flooringCoreThicknessMm: true,
        flooringFinish: true,
        flooringEdge: true,
        flooringInstallation: true,
        flooringUnderlayment: true,
        flooringUnderlaymentType: true,
        flooringUnderlaymentMm: true,
        flooringWaterResistance: true,
        flooringWaterproof: true,
        flooringWarrantyResidentialYr: true,
        flooringWarrantyCommercialYr: true,
        flooringPiecesPerBox: true,
        flooringBoxCoverageSqft: true,
        flooringLowStockThreshold: true,
      },
    });

    const data = {
      ...product,
      skuPrefix: salesProduct?.skuPrefix ?? null,
      defaultDescription: salesProduct?.defaultDescription ?? product.defaultDescription ?? null,
      frameMaterialDefault: salesProduct?.frameMaterialDefault ?? null,
      slidingConfigDefault: salesProduct?.slidingConfigDefault ?? null,
      glassTypeDefault: salesProduct?.glassTypeDefault ?? null,
      glassCoatingDefault: salesProduct?.glassCoatingDefault ?? null,
      glassThicknessMmDefault:
        salesProduct?.glassThicknessMmDefault != null
          ? Number(salesProduct.glassThicknessMmDefault)
          : null,
      glassFinishDefault: salesProduct?.glassFinishDefault ?? null,
      screenDefault: salesProduct?.screenDefault ?? null,
      openingTypeDefault: salesProduct?.openingTypeDefault ?? null,
      flooringBrand: salesProduct?.flooringBrand ?? null,
      flooringSeries: salesProduct?.flooringSeries ?? null,
      flooringMaterial: salesProduct?.flooringMaterial ?? null,
      flooringWearLayer: salesProduct?.flooringWearLayer ?? null,
      flooringThicknessMm: salesProduct?.flooringThicknessMm != null ? Number(salesProduct.flooringThicknessMm) : null,
      flooringPlankLengthIn:
        salesProduct?.flooringPlankLengthIn != null ? Number(salesProduct.flooringPlankLengthIn) : null,
      flooringPlankWidthIn:
        salesProduct?.flooringPlankWidthIn != null ? Number(salesProduct.flooringPlankWidthIn) : null,
      flooringCoreThicknessMm:
        salesProduct?.flooringCoreThicknessMm != null ? Number(salesProduct.flooringCoreThicknessMm) : null,
      flooringFinish: salesProduct?.flooringFinish ?? null,
      flooringEdge: salesProduct?.flooringEdge ?? null,
      flooringInstallation: salesProduct?.flooringInstallation ?? null,
      flooringUnderlayment: salesProduct?.flooringUnderlayment ?? null,
      flooringUnderlaymentType: salesProduct?.flooringUnderlaymentType ?? null,
      flooringUnderlaymentMm:
        salesProduct?.flooringUnderlaymentMm != null ? Number(salesProduct.flooringUnderlaymentMm) : null,
      flooringWaterResistance: salesProduct?.flooringWaterResistance ?? null,
      flooringWaterproof:
        salesProduct?.flooringWaterproof === null || salesProduct?.flooringWaterproof === undefined
          ? null
          : Boolean(salesProduct.flooringWaterproof),
      flooringWarrantyResidentialYr:
        salesProduct?.flooringWarrantyResidentialYr != null
          ? Number(salesProduct.flooringWarrantyResidentialYr)
          : null,
      flooringWarrantyCommercialYr:
        salesProduct?.flooringWarrantyCommercialYr != null
          ? Number(salesProduct.flooringWarrantyCommercialYr)
          : null,
      flooringPiecesPerBox:
        salesProduct?.flooringPiecesPerBox != null ? Number(salesProduct.flooringPiecesPerBox) : null,
      flooringBoxCoverageSqft:
        salesProduct?.flooringBoxCoverageSqft != null ? Number(salesProduct.flooringBoxCoverageSqft) : null,
      flooringLowStockThreshold:
        salesProduct?.flooringLowStockThreshold != null ? Number(salesProduct.flooringLowStockThreshold) : null,
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
    const frameMaterialDefault = normalizeDefaultText(payload?.frameMaterialDefault);
    const openingTypeDefault = normalizeDefaultText(payload?.openingTypeDefault);
    const slidingConfigDefault = normalizeDefaultText(payload?.slidingConfigDefault);
    const glassTypeDefault = normalizeDefaultText(payload?.glassTypeDefault);
    const glassCoatingDefault = normalizeDefaultText(payload?.glassCoatingDefault);
    const glassThicknessMmDefault = normalizeDefaultInt(payload?.glassThicknessMmDefault);
    const glassFinishDefault = normalizeDefaultText(payload?.glassFinishDefault);
    const screenDefault = normalizeDefaultText(payload?.screenDefault);
    const flooringBrand = normalizeDefaultText(payload?.flooringBrand);
    const flooringSeries = normalizeDefaultText(payload?.flooringSeries);
    const flooringMaterial = normalizeEnumChoice(
      payload?.flooringMaterial,
      safeEnumValues(FlooringMaterial as Record<string, string> | undefined, [
        "SPC",
        "LVP",
        "LAMINATE",
        "HARDWOOD",
      ]),
    ) as FlooringMaterial | null;
    const flooringWearLayer = normalizeDefaultText(payload?.flooringWearLayer);
    const flooringThicknessMm = normalizeDefaultDecimal(payload?.flooringThicknessMm);
    const flooringPlankLengthIn = normalizeDefaultDecimal(payload?.flooringPlankLengthIn);
    const flooringPlankWidthIn = normalizeDefaultDecimal(payload?.flooringPlankWidthIn);
    const flooringCoreThicknessMm = normalizeDefaultDecimal(payload?.flooringCoreThicknessMm);
    const flooringFinish = normalizeEnumChoice(
      payload?.flooringFinish,
      safeEnumValues(FlooringFinish as Record<string, string> | undefined, ["MATTE", "GLOSS", "EMBOSSED"]),
    ) as FlooringFinish | null;
    const flooringEdge = normalizeEnumChoice(
      payload?.flooringEdge,
      safeEnumValues(FlooringEdge as Record<string, string> | undefined, ["BEVEL", "MICRO_BEVEL", "SQUARE"]),
    ) as FlooringEdge | null;
    const flooringInstallation = normalizeEnumChoice(
      payload?.flooringInstallation,
      safeEnumValues(FlooringInstallation as Record<string, string> | undefined, ["CLICK", "GLUE_DOWN"]),
    ) as FlooringInstallation | null;
    const flooringUnderlayment = normalizeEnumChoice(
      payload?.flooringUnderlayment,
      safeEnumValues(FlooringUnderlayment as Record<string, string> | undefined, ["ATTACHED", "NONE"]),
    ) as FlooringUnderlayment | null;
    const flooringUnderlaymentType = normalizeDefaultText(payload?.flooringUnderlaymentType);
    const flooringUnderlaymentMm = normalizeDefaultDecimal(payload?.flooringUnderlaymentMm);
    const flooringWaterproof =
      payload?.flooringWaterproof === true ||
      String(payload?.flooringWaterproof ?? "").trim().toLowerCase() === "true"
        ? true
        : payload?.flooringWaterproof === false ||
            String(payload?.flooringWaterproof ?? "").trim().toLowerCase() === "false"
          ? false
          : null;
    const flooringWaterResistance = normalizeEnumChoice(
      payload?.flooringWaterResistance,
      safeEnumValues(FlooringWaterResistance as Record<string, string> | undefined, [
        "WATERPROOF",
        "WATER_RESISTANT",
      ]),
    ) as FlooringWaterResistance | null;
    const flooringWarrantyResidentialYr = normalizeDefaultInt(payload?.flooringWarrantyResidentialYr);
    const flooringWarrantyCommercialYr = normalizeDefaultInt(payload?.flooringWarrantyCommercialYr);
    const flooringPiecesPerBox = normalizeDefaultInt(payload?.flooringPiecesPerBox);
    const flooringBoxCoverageSqft = normalizeDefaultDecimal(payload?.flooringBoxCoverageSqft);
    const flooringLowStockThreshold = normalizeDefaultDecimal(payload?.flooringLowStockThreshold);
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
    const removedVariantIds = Array.isArray(payload?.removedVariantIds)
      ? payload.removedVariantIds
          .map((value: unknown) => String(value ?? "").trim())
          .filter((value: string) => value.length > 0)
      : [];
    const variantsInputRaw = Array.isArray(payload?.variants) ? payload.variants : [];
    const variantsInput: UpsertVariantInput[] = variantsInputRaw
      .map((item: any): UpsertVariantInput => ({
        id: String(item?.id ?? "").trim() || undefined,
        sku: normalizeSkuValue(String(item?.sku ?? "")),
        displayName: String(item?.displayName ?? "").trim() || null,
        skuSuffix: normalizeSkuValue(String(item?.skuSuffix ?? "")) || null,
        width: Number(item?.width ?? 0),
        height: Number(item?.height ?? 0),
        color: String(item?.color ?? "").trim() || null,
        salePrice: Number(item?.salePrice ?? 0),
        cost: Number(item?.cost ?? 0),
        openingStock: Number(item?.openingStock ?? 0),
        reorderLevel: Number(item?.reorderLevel ?? 0),
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
          Number.isNaN(item.reorderLevel) ||
          item.salePrice < 0 ||
          item.cost < 0 ||
          item.openingStock < 0 ||
          item.reorderLevel < 0,
      )
    ) {
      return NextResponse.json(
        { error: "Each variant requires valid SKU (no hyphen), sale price, cost, and non-negative stock/reorder values." },
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
    if (category === "FLOOR" && !effectiveSkuPrefix) {
      return NextResponse.json(
        { error: "SKU Prefix is required for Flooring products." },
        { status: 400 },
      );
    }
    if (category === "WINDOW") {
      if (!openingTypeDefault || !glassTypeDefault || !glassThicknessMmDefault || !screenDefault) {
        return NextResponse.json(
          {
            error:
              "Window defaults required: Opening Type, Glass Type, Glass Thickness (mm), and Screen.",
          },
          { status: 400 },
        );
      }
    }
    if (category === "FLOOR") {
      if (
        !flooringMaterial ||
        !flooringPlankLengthIn ||
        !flooringPlankWidthIn ||
        !flooringThicknessMm ||
        !flooringWearLayer ||
        !flooringCoreThicknessMm ||
        !flooringUnderlaymentType ||
        !flooringUnderlaymentMm ||
        !flooringBoxCoverageSqft
      ) {
        return NextResponse.json(
          {
            error:
              "Flooring defaults required: Type, Plank L/W, Total Thickness, Wear Layer, Core Thickness, Underlayment Type, Underlayment Thickness, and Sqft/Box.",
          },
          { status: 400 },
        );
      }
    }
    if (category === "FLOOR") {
      const missingDisplayName = variantsInput.some((item) => !String(item.displayName ?? "").trim());
      if (missingDisplayName) {
        return NextResponse.json({ error: "Display Name is required for Flooring variants." }, { status: 400 });
      }
      const missingSuffix = variantsInput.some(
        (item) =>
          !String(item.skuSuffix ?? "").trim() &&
          !String(item.sku ?? "").trim(),
      );
      if (missingSuffix) {
        return NextResponse.json({ error: "SKU Suffix is required for Flooring variants." }, { status: 400 });
      }
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
    const removedVariantIdSet = new Set(removedVariantIds);
    const effectiveExistingVariants = existingVariants.filter(
      (item) => !removedVariantIdSet.has(item.id),
    );
    const existingVariantById = new Map(effectiveExistingVariants.map((item) => [item.id, item]));
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
        const effectiveFinish =
          String(existingVariant?.glassFinishOverride ?? glassFinishDefault ?? "")
            .trim()
            .toUpperCase() === "FROSTED"
            ? "FROSTED"
            : "CLEAR";
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
      glass_coating_default: glassCoatingDefault,
      glass_thickness_mm_default: glassThicknessMmDefault,
      glass_finish_default: glassFinishDefault,
      screen_default: screenDefault,
      opening_type_default: openingTypeDefault,
      frame_material_default: frameMaterialDefault,
      sliding_config_default: slidingConfigDefault,
      flooring_brand: flooringBrand,
      flooring_series: flooringSeries,
      flooring_material: flooringMaterial,
      flooring_wear_layer: flooringWearLayer,
      flooring_thickness_mm: flooringThicknessMm,
      flooring_plank_length_in: flooringPlankLengthIn,
      flooring_plank_width_in: flooringPlankWidthIn,
      flooring_finish: flooringFinish,
      flooring_edge: flooringEdge,
      flooring_installation: flooringInstallation,
      flooring_underlayment: flooringUnderlayment,
      flooring_underlayment_mm: flooringUnderlaymentMm,
      flooring_water_resistance: flooringWaterResistance,
      flooring_warranty_residential_yr: flooringWarrantyResidentialYr,
      flooring_warranty_commercial_yr: flooringWarrantyCommercialYr,
      flooring_box_coverage_sqft: flooringBoxCoverageSqft,
      flooring_low_stock_threshold: flooringLowStockThreshold,
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
            glassFinish:
              String(glassFinishDefault ?? "").trim().toUpperCase() === "FROSTED"
                ? "FROSTED"
                : "CLEAR",
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
        frameMaterialDefault,
        slidingConfigDefault,
        glassTypeDefault,
        glassCoatingDefault,
        glassThicknessMmDefault,
        glassFinishDefault,
        screenDefault,
        openingTypeDefault,
        flooringBrand,
        flooringSeries,
        flooringMaterial,
        flooringWearLayer,
        flooringThicknessMm,
        flooringPlankLengthIn,
        flooringPlankWidthIn,
        flooringCoreThicknessMm,
        flooringFinish,
        flooringEdge,
        flooringInstallation,
        flooringUnderlayment,
        flooringUnderlaymentType,
        flooringUnderlaymentMm,
        flooringWaterResistance,
        flooringWaterproof,
        flooringWarrantyResidentialYr,
        flooringWarrantyCommercialYr,
        flooringPiecesPerBox,
        flooringBoxCoverageSqft,
        flooringLowStockThreshold,
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
      frameMaterialDefault,
      slidingConfigDefault,
      glassTypeDefault,
      glassCoatingDefault,
      glassThicknessMmDefault,
      glassFinishDefault,
      screenDefault,
      openingTypeDefault,
      flooringBrand,
      flooringSeries,
      flooringMaterial,
      flooringWearLayer,
      flooringThicknessMm,
      flooringPlankLengthIn,
      flooringPlankWidthIn,
      flooringCoreThicknessMm,
      flooringFinish,
      flooringEdge,
      flooringInstallation,
      flooringUnderlayment,
      flooringUnderlaymentType,
      flooringUnderlaymentMm,
      flooringWaterResistance,
      flooringWaterproof,
      flooringWarrantyResidentialYr,
      flooringWarrantyCommercialYr,
      flooringPiecesPerBox,
      flooringBoxCoverageSqft,
      flooringLowStockThreshold,
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
        frameMaterialDefault: salesProductData.frameMaterialDefault,
        slidingConfigDefault: salesProductData.slidingConfigDefault,
        glassTypeDefault: salesProductData.glassTypeDefault,
        glassCoatingDefault: salesProductData.glassCoatingDefault,
        glassThicknessMmDefault: salesProductData.glassThicknessMmDefault,
        glassFinishDefault: salesProductData.glassFinishDefault,
        screenDefault: salesProductData.screenDefault,
        openingTypeDefault: salesProductData.openingTypeDefault,
        flooringBrand: salesProductData.flooringBrand,
        flooringSeries: salesProductData.flooringSeries,
        flooringMaterial: salesProductData.flooringMaterial,
        flooringWearLayer: salesProductData.flooringWearLayer,
        flooringThicknessMm: salesProductData.flooringThicknessMm,
        flooringPlankLengthIn: salesProductData.flooringPlankLengthIn,
        flooringPlankWidthIn: salesProductData.flooringPlankWidthIn,
        flooringCoreThicknessMm: salesProductData.flooringCoreThicknessMm,
        flooringFinish: salesProductData.flooringFinish,
        flooringEdge: salesProductData.flooringEdge,
        flooringInstallation: salesProductData.flooringInstallation,
        flooringUnderlayment: salesProductData.flooringUnderlayment,
        flooringUnderlaymentType: salesProductData.flooringUnderlaymentType,
        flooringUnderlaymentMm: salesProductData.flooringUnderlaymentMm,
        flooringWaterResistance: salesProductData.flooringWaterResistance,
        flooringWaterproof: salesProductData.flooringWaterproof,
        flooringWarrantyResidentialYr: salesProductData.flooringWarrantyResidentialYr,
        flooringWarrantyCommercialYr: salesProductData.flooringWarrantyCommercialYr,
        flooringPiecesPerBox: salesProductData.flooringPiecesPerBox,
        flooringBoxCoverageSqft: salesProductData.flooringBoxCoverageSqft,
        flooringLowStockThreshold: salesProductData.flooringLowStockThreshold,
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

    const existingVariantSkuById = new Map(
      effectiveExistingVariants.map((item) => [item.id, item.sku]),
    );

    const generatedSku = normalizeSkuValue(autoNoHyphenSku || autoSku || "");
    const fallbackExistingSku = effectiveExistingVariants[0]?.sku || "";
    const targetSku = variantSkuOverrideInput ?? (generatedSku || fallbackExistingSku || "");

    try {
      if (removedVariantIds.length > 0) {
        await prisma.productVariant.deleteMany({
          where: {
            productId: id,
            id: { in: removedVariantIds },
          },
        });
      }
      if (resolvedVariantsInput.length > 0) {
        for (const variant of resolvedVariantsInput) {
          const variantData = {
            sku: variant.sku,
            displayName: variant.displayName,
            skuSuffix: variant.skuSuffix,
            description: variantDescription,
            width: variant.width > 0 ? variant.width : null,
            height: variant.height > 0 ? variant.height : null,
            color: variant.color || null,
            glassTypeOverride: null,
            slidingConfigOverride: null,
            glassCoatingOverride: null,
            glassThicknessMmOverride: null,
            glassFinishOverride: null,
            screenOverride: null,
            openingTypeOverride: null,
            variantType: type,
            thicknessMm,
            boxSqft: null,
            cost: variant.cost,
            price: variant.salePrice,
            reorderLevel: variant.reorderLevel,
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
      } else if (effectiveExistingVariants[0]) {
        await prisma.productVariant.update({
          where: { id: effectiveExistingVariants[0].id },
          data: {
            sku: targetSku || effectiveExistingVariants[0].sku,
            description: variantDescription,
            width: sizeW,
            height: sizeH,
            color,
            glassTypeOverride: null,
            slidingConfigOverride: null,
            glassCoatingOverride: null,
            glassThicknessMmOverride: null,
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
            slidingConfigOverride: null,
            glassCoatingOverride: null,
            glassThicknessMmOverride: null,
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
          validationWarnings: buildProductValidationWarnings({
            defaultDescription,
            variantDescription,
            variantsInput: resolvedVariantsInput.map((row) => ({ sku: row.sku })),
          }),
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
