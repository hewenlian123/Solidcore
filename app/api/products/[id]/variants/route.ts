import { GlassFinish, GlassType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { generateVariantSku } from "@/lib/sku/generateVariantSku";
import { getEffectiveSpecs } from "@/lib/specs/glass";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeSkuValue(value: string) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
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

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id: productId } = await params;
    if (!productId) return NextResponse.json({ error: "Missing product ID." }, { status: 400 });

    const variants = await prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
      include: {
        inventoryStock: {
          select: { onHand: true, reserved: true },
        },
      },
    });

    const data = variants.map((variant) => {
      const onHand = Number(variant.inventoryStock?.onHand ?? 0);
      const reserved = Number(variant.inventoryStock?.reserved ?? 0);
      return {
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        description: variant.description ?? null,
        width: variant.width != null ? Number(variant.width) : null,
        height: variant.height != null ? Number(variant.height) : null,
        color: variant.color ?? null,
        glassTypeOverride: variant.glassTypeOverride ?? null,
        glassFinishOverride: variant.glassFinishOverride ?? null,
        screenOverride: variant.screenOverride ?? null,
        openingTypeOverride: variant.openingTypeOverride ?? null,
        glassType: variant.glassType ?? null,
        screenType: variant.screenType ?? null,
        slideDirection: variant.slideDirection ?? null,
        variantType: variant.variantType ?? null,
        thicknessMm: variant.thicknessMm != null ? Number(variant.thicknessMm) : null,
        cost: variant.cost != null ? Number(variant.cost) : null,
        price: variant.price != null ? Number(variant.price) : null,
        onHand,
        reserved,
        available: onHand - reserved,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/products/[id]/variants error:", error);
    return NextResponse.json({ error: "Failed to fetch product variants." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id: productId } = await params;
    if (!productId) return NextResponse.json({ error: "Missing product ID." }, { status: 400 });

    const payload = await request.json();
    const width =
      payload?.width !== undefined && payload?.width !== null && payload?.width !== ""
        ? Number(payload.width)
        : null;
    const height =
      payload?.height !== undefined && payload?.height !== null && payload?.height !== ""
        ? Number(payload.height)
        : null;
    const color = String(payload?.color ?? "").trim() || null;
    const glassTypeOverride = parseGlassType(payload?.glassTypeOverride);
    const glassFinishOverride = parseGlassFinish(payload?.glassFinishOverride);
    const screenOverride = String(payload?.screenOverride ?? "").trim() || null;
    const openingTypeOverride = String(payload?.openingTypeOverride ?? "").trim() || null;
    const manualSkuOverride = normalizeSkuValue(String(payload?.skuOverride ?? ""));
    const price =
      payload?.price !== undefined && payload?.price !== null && payload?.price !== ""
        ? Number(payload.price)
        : null;
    const cost =
      payload?.cost !== undefined && payload?.cost !== null && payload?.cost !== ""
        ? Number(payload.cost)
        : null;
    const openingStock =
      payload?.openingStock !== undefined && payload?.openingStock !== null && payload?.openingStock !== ""
        ? Number(payload.openingStock)
        : 0;
    const description = String(payload?.description ?? "").trim() || null;

    if ((width !== null && !Number.isFinite(width)) || (height !== null && !Number.isFinite(height))) {
      return NextResponse.json({ error: "Size is required." }, { status: 400 });
    }
    if (!width || !height) {
      return NextResponse.json({ error: "Size is required." }, { status: 400 });
    }
    if (!color) return NextResponse.json({ error: "Color is required." }, { status: 400 });
    if ((price !== null && !Number.isFinite(price)) || (cost !== null && !Number.isFinite(cost))) {
      return NextResponse.json({ error: "Invalid numeric values." }, { status: 400 });
    }
    if (!Number.isFinite(openingStock) || openingStock < 0) {
      return NextResponse.json({ error: "Opening stock must be 0 or greater." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, category: true, type: true, thicknessMm: true },
    });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const duplicateCandidates = await prisma.productVariant.findMany({
      where: { productId, width, height },
      select: { id: true, color: true },
    });
    const duplicate = duplicateCandidates.find(
      (row) => String(row.color ?? "").trim().toLowerCase() === String(color).toLowerCase(),
    );
    if (duplicate) {
      return NextResponse.json({ error: "Duplicate variant combination." }, { status: 400 });
    }

    const salesProduct = await prisma.salesProduct.findUnique({
      where: { id: productId },
      select: {
        skuPrefix: true,
        glassTypeDefault: true,
        glassFinishDefault: true,
        screenDefault: true,
        openingTypeDefault: true,
      },
    });
    const effectiveSpecs = getEffectiveSpecs(
      {
        glassTypeDefault: salesProduct?.glassTypeDefault ?? null,
        glassFinishDefault: salesProduct?.glassFinishDefault ?? null,
        screenDefault: salesProduct?.screenDefault ?? null,
        openingTypeDefault: salesProduct?.openingTypeDefault ?? null,
      },
      {
        glassTypeOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
      },
    );
    const sku = generateVariantSku({
      skuPrefix: String(salesProduct?.skuPrefix ?? ""),
      width,
      height,
      color,
      glassFinish: effectiveSpecs.glassFinish,
      manualSkuOverride: manualSkuOverride || null,
    }).effectiveSku;
    if (!sku) return NextResponse.json({ error: "Failed to generate SKU." }, { status: 400 });
    if (sku.includes("-")) return NextResponse.json({ error: "SKU cannot contain hyphen." }, { status: 400 });

    const created = await prisma.productVariant.create({
      data: {
        productId,
        sku,
        description,
        width,
        height,
        color,
        glassTypeOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
        variantType: product.type ?? null,
        thicknessMm: product.thicknessMm ?? null,
        boxSqft: null,
        cost,
        price,
        reorderLevel: 0,
        reorderQty: 0,
        isStockItem: true,
        inventoryStock: {
          create: {
            onHand: openingStock,
            reserved: 0,
          },
        },
      },
      include: {
        inventoryStock: {
          select: { onHand: true, reserved: true },
        },
      },
    });

    const onHand = Number(created.inventoryStock?.onHand ?? 0);
    const reserved = Number(created.inventoryStock?.reserved ?? 0);
    return NextResponse.json(
      {
        data: {
          id: created.id,
          productId: created.productId,
          sku: created.sku,
          width: created.width != null ? Number(created.width) : null,
          height: created.height != null ? Number(created.height) : null,
          color: created.color ?? null,
          glassTypeOverride: created.glassTypeOverride ?? null,
          glassFinishOverride: created.glassFinishOverride ?? null,
          screenOverride: created.screenOverride ?? null,
          openingTypeOverride: created.openingTypeOverride ?? null,
          glassType: created.glassType ?? null,
          screenType: created.screenType ?? null,
          slideDirection: created.slideDirection ?? null,
          price: created.price != null ? Number(created.price) : null,
          cost: created.cost != null ? Number(created.cost) : null,
          description: created.description ?? null,
          onHand,
          reserved,
          available: onHand - reserved,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU already exists." }, { status: 400 });
    }
    console.error("POST /api/products/[id]/variants error:", error);
    return NextResponse.json({ error: "Failed to create variant." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id: productId } = await params;
    if (!productId) return NextResponse.json({ error: "Missing product ID." }, { status: 400 });

    const payload = await request.json();
    const variantId = String(payload?.variantId ?? "").trim();
    if (!variantId) return NextResponse.json({ error: "Missing variant ID." }, { status: 400 });

    const skuOverride = normalizeSkuValue(String(payload?.skuOverride ?? ""));
    const inputSku = normalizeSkuValue(String(payload?.sku ?? ""));
    const width = payload?.width !== undefined && payload?.width !== null && payload?.width !== "" ? Number(payload.width) : null;
    const height = payload?.height !== undefined && payload?.height !== null && payload?.height !== "" ? Number(payload.height) : null;
    const color = String(payload?.color ?? "").trim() || null;
    const glassTypeOverride = parseGlassType(payload?.glassTypeOverride);
    const glassFinishOverride = parseGlassFinish(payload?.glassFinishOverride);
    const screenOverride = String(payload?.screenOverride ?? "").trim() || null;
    const openingTypeOverride = String(payload?.openingTypeOverride ?? "").trim() || null;
    const price = payload?.price !== undefined && payload?.price !== null && payload?.price !== "" ? Number(payload.price) : null;
    const cost = payload?.cost !== undefined && payload?.cost !== null && payload?.cost !== "" ? Number(payload.cost) : null;
    const description = String(payload?.description ?? "").trim() || null;

    const productDefaults = await prisma.salesProduct.findUnique({
      where: { id: productId },
      select: {
        skuPrefix: true,
        glassTypeDefault: true,
        glassFinishDefault: true,
        screenDefault: true,
        openingTypeDefault: true,
      },
    });
    const effectiveSpecs = getEffectiveSpecs(
      {
        glassTypeDefault: productDefaults?.glassTypeDefault ?? null,
        glassFinishDefault: productDefaults?.glassFinishDefault ?? null,
        screenDefault: productDefaults?.screenDefault ?? null,
        openingTypeDefault: productDefaults?.openingTypeDefault ?? null,
      },
      {
        glassTypeOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
      },
    );
    const generatedSku = generateVariantSku({
      skuPrefix: String(productDefaults?.skuPrefix ?? ""),
      width: width ?? 0,
      height: height ?? 0,
      color,
      glassFinish: effectiveSpecs.glassFinish,
      manualSkuOverride: skuOverride || null,
    }).effectiveSku;
    const sku = skuOverride || inputSku || generatedSku;
    if (!sku) return NextResponse.json({ error: "SKU is required." }, { status: 400 });
    if (sku.includes("-")) return NextResponse.json({ error: "SKU cannot contain hyphen." }, { status: 400 });
    if ((width !== null && !Number.isFinite(width)) || (height !== null && !Number.isFinite(height))) {
      return NextResponse.json({ error: "Invalid size values." }, { status: 400 });
    }
    if ((price !== null && !Number.isFinite(price)) || (cost !== null && !Number.isFinite(cost))) {
      return NextResponse.json({ error: "Invalid numeric values." }, { status: 400 });
    }

    const current = await prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });
    if (!current) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku,
        width,
        height,
        color,
        glassTypeOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
        price,
        cost,
        description,
      },
      include: {
        inventoryStock: {
          select: { onHand: true, reserved: true },
        },
      },
    });

    const onHand = Number(updated.inventoryStock?.onHand ?? 0);
    const reserved = Number(updated.inventoryStock?.reserved ?? 0);
    return NextResponse.json(
      {
        data: {
          id: updated.id,
          productId: updated.productId,
          sku: updated.sku,
          width: updated.width != null ? Number(updated.width) : null,
          height: updated.height != null ? Number(updated.height) : null,
          color: updated.color ?? null,
          glassTypeOverride: updated.glassTypeOverride ?? null,
          glassFinishOverride: updated.glassFinishOverride ?? null,
          screenOverride: updated.screenOverride ?? null,
          openingTypeOverride: updated.openingTypeOverride ?? null,
          glassType: updated.glassType ?? null,
          screenType: updated.screenType ?? null,
          slideDirection: updated.slideDirection ?? null,
          price: updated.price != null ? Number(updated.price) : null,
          cost: updated.cost != null ? Number(updated.cost) : null,
          description: updated.description ?? null,
          onHand,
          reserved,
          available: onHand - reserved,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU already exists." }, { status: 400 });
    }
    console.error("PATCH /api/products/[id]/variants error:", error);
    return NextResponse.json({ error: "Failed to update variant." }, { status: 500 });
  }
}
