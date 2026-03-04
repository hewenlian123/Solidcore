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

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function toIntPart(value: number | null) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

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

type CreateVariantInput = {
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
            frameMaterialDefault: true,
            openingTypeDefault: true,
            slidingConfigDefault: true,
            glassTypeDefault: true,
            glassCoatingDefault: true,
            glassThicknessMmDefault: true,
            glassFinishDefault: true,
            screenDefault: true,
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
        })
      : [];
    const salesProductMetaById = salesProductRows.reduce<
      Record<
        string,
        {
          skuPrefix: string | null;
          defaultDescription: string | null;
          frameMaterialDefault: string | null;
          openingTypeDefault: string | null;
          slidingConfigDefault: string | null;
          glassTypeDefault: string | null;
          glassCoatingDefault: string | null;
          glassThicknessMmDefault: number | null;
          glassFinishDefault: string | null;
          screenDefault: string | null;
          flooringBrand: string | null;
          flooringSeries: string | null;
          flooringMaterial: string | null;
          flooringWearLayer: string | null;
          flooringThicknessMm: number | null;
          flooringPlankLengthIn: number | null;
          flooringPlankWidthIn: number | null;
          flooringCoreThicknessMm: number | null;
          flooringFinish: string | null;
          flooringEdge: string | null;
          flooringInstallation: string | null;
          flooringUnderlayment: string | null;
          flooringUnderlaymentType: string | null;
          flooringUnderlaymentMm: number | null;
          flooringWaterResistance: string | null;
          flooringWaterproof: boolean | null;
          flooringWarrantyResidentialYr: number | null;
          flooringWarrantyCommercialYr: number | null;
          flooringPiecesPerBox: number | null;
          flooringBoxCoverageSqft: number | null;
          flooringLowStockThreshold: number | null;
        }
      >
    >((acc, row) => {
      acc[row.id] = {
        skuPrefix: row.skuPrefix ?? null,
        defaultDescription: row.defaultDescription ?? null,
        frameMaterialDefault: row.frameMaterialDefault ?? null,
        openingTypeDefault: row.openingTypeDefault ?? null,
        slidingConfigDefault: row.slidingConfigDefault ?? null,
        glassTypeDefault: row.glassTypeDefault ?? null,
        glassCoatingDefault: row.glassCoatingDefault ?? null,
        glassThicknessMmDefault:
          row.glassThicknessMmDefault != null ? Number(row.glassThicknessMmDefault) : null,
        glassFinishDefault: row.glassFinishDefault ?? null,
        screenDefault: row.screenDefault ?? null,
        flooringBrand: row.flooringBrand ?? null,
        flooringSeries: row.flooringSeries ?? null,
        flooringMaterial: row.flooringMaterial ?? null,
        flooringWearLayer: row.flooringWearLayer ?? null,
        flooringThicknessMm: row.flooringThicknessMm != null ? Number(row.flooringThicknessMm) : null,
        flooringPlankLengthIn:
          row.flooringPlankLengthIn != null ? Number(row.flooringPlankLengthIn) : null,
        flooringPlankWidthIn: row.flooringPlankWidthIn != null ? Number(row.flooringPlankWidthIn) : null,
        flooringCoreThicknessMm:
          row.flooringCoreThicknessMm != null ? Number(row.flooringCoreThicknessMm) : null,
        flooringFinish: row.flooringFinish ?? null,
        flooringEdge: row.flooringEdge ?? null,
        flooringInstallation: row.flooringInstallation ?? null,
        flooringUnderlayment: row.flooringUnderlayment ?? null,
        flooringUnderlaymentType: row.flooringUnderlaymentType ?? null,
        flooringUnderlaymentMm:
          row.flooringUnderlaymentMm != null ? Number(row.flooringUnderlaymentMm) : null,
        flooringWaterResistance: row.flooringWaterResistance ?? null,
        flooringWaterproof:
          row.flooringWaterproof === null || row.flooringWaterproof === undefined
            ? null
            : Boolean(row.flooringWaterproof),
        flooringWarrantyResidentialYr:
          row.flooringWarrantyResidentialYr != null ? Number(row.flooringWarrantyResidentialYr) : null,
        flooringWarrantyCommercialYr:
          row.flooringWarrantyCommercialYr != null ? Number(row.flooringWarrantyCommercialYr) : null,
        flooringPiecesPerBox:
          row.flooringPiecesPerBox != null ? Number(row.flooringPiecesPerBox) : null,
        flooringBoxCoverageSqft:
          row.flooringBoxCoverageSqft != null ? Number(row.flooringBoxCoverageSqft) : null,
        flooringLowStockThreshold:
          row.flooringLowStockThreshold != null ? Number(row.flooringLowStockThreshold) : null,
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
            displayName: true,
            skuSuffix: true,
            description: true,
            cost: true,
            price: true,
            width: true,
            height: true,
            color: true,
            reorderLevel: true,
            reorderQty: true,
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
          displayName: string | null;
          skuSuffix: string | null;
          description: string | null;
          cost: number | null;
          price: number | null;
          width: number | null;
          height: number | null;
          color: string | null;
          reorderLevel: number;
          reorderQty: number;
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
        displayName: variant.displayName ?? null,
        skuSuffix: variant.skuSuffix ?? null,
        description: variant.description ?? null,
        cost: variant.cost != null ? Number(variant.cost) : null,
        price: variant.price != null ? Number(variant.price) : null,
        width: variant.width != null ? Number(variant.width) : null,
        height: variant.height != null ? Number(variant.height) : null,
        color: variant.color ?? null,
        reorderLevel: Number(variant.reorderLevel ?? 0),
        reorderQty: Number(variant.reorderQty ?? 0),
        onHand,
        reserved,
        available: onHand - reserved,
      };
      if (!acc[variant.productId]) acc[variant.productId] = [];
      acc[variant.productId].push(row);
      return acc;
    }, {});
    const lowStockVariantCount = variants.filter((variant) => {
      const onHand = Number(variant.inventoryStock?.onHand ?? 0);
      const reserved = Number(variant.inventoryStock?.reserved ?? 0);
      const available = onHand - reserved;
      return available <= Number(variant.reorderLevel ?? 0);
    }).length;
    const lowStockProductIdSet = new Set(
      variants
        .filter((variant) => {
          const onHand = Number(variant.inventoryStock?.onHand ?? 0);
          const reserved = Number(variant.inventoryStock?.reserved ?? 0);
          const available = onHand - reserved;
          return available <= Number(variant.reorderLevel ?? 0);
        })
        .map((variant) => variant.productId),
    );
    const filteredProducts = lowStockOnly
      ? products.filter((item) => lowStockProductIdSet.has(item.id))
      : products;

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
        frameMaterialDefault: salesProductMetaById[item.id]?.frameMaterialDefault ?? null,
        openingTypeDefault: salesProductMetaById[item.id]?.openingTypeDefault ?? null,
        slidingConfigDefault: salesProductMetaById[item.id]?.slidingConfigDefault ?? null,
        glassTypeDefault: salesProductMetaById[item.id]?.glassTypeDefault ?? null,
        glassCoatingDefault: salesProductMetaById[item.id]?.glassCoatingDefault ?? null,
        glassThicknessMmDefault: salesProductMetaById[item.id]?.glassThicknessMmDefault ?? null,
        glassFinishDefault: salesProductMetaById[item.id]?.glassFinishDefault ?? null,
        screenDefault: salesProductMetaById[item.id]?.screenDefault ?? null,
        flooringBrand: salesProductMetaById[item.id]?.flooringBrand ?? null,
        flooringSeries: salesProductMetaById[item.id]?.flooringSeries ?? null,
        flooringMaterial: salesProductMetaById[item.id]?.flooringMaterial ?? null,
        flooringWearLayer: salesProductMetaById[item.id]?.flooringWearLayer ?? null,
        flooringThicknessMm: salesProductMetaById[item.id]?.flooringThicknessMm ?? null,
        flooringPlankLengthIn: salesProductMetaById[item.id]?.flooringPlankLengthIn ?? null,
        flooringPlankWidthIn: salesProductMetaById[item.id]?.flooringPlankWidthIn ?? null,
        flooringCoreThicknessMm: salesProductMetaById[item.id]?.flooringCoreThicknessMm ?? null,
        flooringFinish: salesProductMetaById[item.id]?.flooringFinish ?? null,
        flooringEdge: salesProductMetaById[item.id]?.flooringEdge ?? null,
        flooringInstallation: salesProductMetaById[item.id]?.flooringInstallation ?? null,
        flooringUnderlayment: salesProductMetaById[item.id]?.flooringUnderlayment ?? null,
        flooringUnderlaymentType: salesProductMetaById[item.id]?.flooringUnderlaymentType ?? null,
        flooringUnderlaymentMm: salesProductMetaById[item.id]?.flooringUnderlaymentMm ?? null,
        flooringWaterResistance: salesProductMetaById[item.id]?.flooringWaterResistance ?? null,
        flooringWaterproof: salesProductMetaById[item.id]?.flooringWaterproof ?? null,
        flooringWarrantyResidentialYr:
          salesProductMetaById[item.id]?.flooringWarrantyResidentialYr ?? null,
        flooringWarrantyCommercialYr:
          salesProductMetaById[item.id]?.flooringWarrantyCommercialYr ?? null,
        flooringPiecesPerBox: salesProductMetaById[item.id]?.flooringPiecesPerBox ?? null,
        flooringBoxCoverageSqft: salesProductMetaById[item.id]?.flooringBoxCoverageSqft ?? null,
        flooringLowStockThreshold: salesProductMetaById[item.id]?.flooringLowStockThreshold ?? null,
        variants: productVariants,
        stockSummary,
        variantCount: productVariants.length,
        lowStockVariantCount: productVariants.filter((variant) => variant.available <= variant.reorderLevel).length,
        hasLowStock: productVariants.some((variant) => variant.available <= variant.reorderLevel),
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
          lowStockCount: lowStockVariantCount,
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
    const frameMaterialDefault = normalizeDefaultText(body?.frameMaterialDefault);
    const openingTypeDefault = normalizeDefaultText(body?.openingTypeDefault);
    const slidingConfigDefault = normalizeDefaultText(body?.slidingConfigDefault);
    const glassTypeDefault = normalizeDefaultText(body?.glassTypeDefault);
    const glassCoatingDefault = normalizeDefaultText(body?.glassCoatingDefault);
    const glassThicknessMmDefault = normalizeDefaultInt(body?.glassThicknessMmDefault);
    const glassFinishDefault = normalizeDefaultText(body?.glassFinishDefault);
    const screenDefault = normalizeDefaultText(body?.screenDefault);
    const flooringBrand = normalizeDefaultText(body?.flooringBrand);
    const flooringSeries = normalizeDefaultText(body?.flooringSeries);
    const flooringMaterial = normalizeEnumChoice(
      body?.flooringMaterial,
      safeEnumValues(FlooringMaterial as Record<string, string> | undefined, [
        "SPC",
        "LVP",
        "LAMINATE",
        "HARDWOOD",
      ]),
    ) as FlooringMaterial | null;
    const flooringWearLayer = normalizeDefaultText(body?.flooringWearLayer);
    const flooringThicknessMm = normalizeDefaultDecimal(body?.flooringThicknessMm);
    const flooringPlankLengthIn = normalizeDefaultDecimal(body?.flooringPlankLengthIn);
    const flooringPlankWidthIn = normalizeDefaultDecimal(body?.flooringPlankWidthIn);
    const flooringCoreThicknessMm = normalizeDefaultDecimal(body?.flooringCoreThicknessMm);
    const flooringFinish = normalizeEnumChoice(
      body?.flooringFinish,
      safeEnumValues(FlooringFinish as Record<string, string> | undefined, ["MATTE", "GLOSS", "EMBOSSED"]),
    ) as FlooringFinish | null;
    const flooringEdge = normalizeEnumChoice(
      body?.flooringEdge,
      safeEnumValues(FlooringEdge as Record<string, string> | undefined, ["BEVEL", "MICRO_BEVEL", "SQUARE"]),
    ) as FlooringEdge | null;
    const flooringInstallation = normalizeEnumChoice(
      body?.flooringInstallation,
      safeEnumValues(FlooringInstallation as Record<string, string> | undefined, ["CLICK", "GLUE_DOWN"]),
    ) as FlooringInstallation | null;
    const flooringUnderlayment = normalizeEnumChoice(
      body?.flooringUnderlayment,
      safeEnumValues(FlooringUnderlayment as Record<string, string> | undefined, ["ATTACHED", "NONE"]),
    ) as FlooringUnderlayment | null;
    const flooringUnderlaymentType = normalizeDefaultText(body?.flooringUnderlaymentType);
    const flooringUnderlaymentMm = normalizeDefaultDecimal(body?.flooringUnderlaymentMm);
    const flooringWaterproof =
      body?.flooringWaterproof === true || String(body?.flooringWaterproof ?? "").trim().toLowerCase() === "true"
        ? true
        : body?.flooringWaterproof === false ||
            String(body?.flooringWaterproof ?? "").trim().toLowerCase() === "false"
          ? false
          : null;
    const flooringWaterResistance = normalizeEnumChoice(
      body?.flooringWaterResistance,
      safeEnumValues(FlooringWaterResistance as Record<string, string> | undefined, [
        "WATERPROOF",
        "WATER_RESISTANT",
      ]),
    ) as FlooringWaterResistance | null;
    const flooringWarrantyResidentialYr = normalizeDefaultInt(body?.flooringWarrantyResidentialYr);
    const flooringWarrantyCommercialYr = normalizeDefaultInt(body?.flooringWarrantyCommercialYr);
    const flooringPiecesPerBox = normalizeDefaultInt(body?.flooringPiecesPerBox);
    const flooringBoxCoverageSqft = normalizeDefaultDecimal(body?.flooringBoxCoverageSqft);
    const flooringLowStockThreshold = normalizeDefaultDecimal(body?.flooringLowStockThreshold);
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
          Number.isNaN(item.reorderLevel) ||
          item.sku.includes("-") ||
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
    if (category === "FLOOR" && !effectiveSkuPrefix) {
      return NextResponse.json(
        { error: "SKU Prefix is required for Flooring products." },
        { status: 400 },
      );
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
            glassFinish: String(glassFinishDefault ?? "").trim().toUpperCase() === "FROSTED" ? "FROSTED" : "CLEAR",
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
            glassCoatingDefault,
            glassThicknessMmDefault,
            glassFinishDefault,
            screenDefault,
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
            openingTypeDefault,
            frameMaterialDefault,
            slidingConfigDefault,
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
          frameMaterialDefault,
          slidingConfigDefault,
          glassTypeDefault,
          glassCoatingDefault,
          glassThicknessMmDefault,
          glassFinishDefault,
          screenDefault,
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
            frameMaterialDefault: salesProductData.frameMaterialDefault,
            slidingConfigDefault: salesProductData.slidingConfigDefault,
            glassTypeDefault: salesProductData.glassTypeDefault,
            glassCoatingDefault: salesProductData.glassCoatingDefault,
            glassThicknessMmDefault: salesProductData.glassThicknessMmDefault,
            glassFinishDefault: salesProductData.glassFinishDefault,
            screenDefault: salesProductData.screenDefault,
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
              slidingConfigOverride: null,
              glassCoatingOverride: null,
              glassThicknessMmOverride: null,
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

      return NextResponse.json(
        {
          data: product,
          meta: {
            validationWarnings: buildProductValidationWarnings({
              defaultDescription,
              variantDescription,
              variantsInput,
            }),
          },
        },
        { status: 201 },
      );
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
