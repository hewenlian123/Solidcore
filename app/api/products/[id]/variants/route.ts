import { Prisma } from "@prisma/client";
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

function normalizeText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : null;
}

function buildVariantValidationWarnings(input: { sku: string | null | undefined; description: string | null | undefined }) {
  const warnings: string[] = [];
  if (!String(input.sku ?? "").trim()) warnings.push("SKU is empty for this inventory item.");
  if (!String(input.description ?? "").trim()) warnings.push("Description is empty for this inventory item.");
  return warnings;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id: productId } = await params;
    if (!productId) return NextResponse.json({ error: "Missing product ID." }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get("showArchived") === "true";
    const variants = await prisma.productVariant.findMany({
      where: {
        productId,
        ...(showArchived ? {} : { archivedAt: null }),
      },
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
        displayName: variant.displayName ?? null,
        imageUrl: variant.imageUrl ?? null,
        skuSuffix: variant.skuSuffix ?? null,
        description: variant.description ?? null,
        width: variant.width != null ? Number(variant.width) : null,
        height: variant.height != null ? Number(variant.height) : null,
        color: variant.color ?? null,
        glassTypeOverride: variant.glassTypeOverride ?? null,
        slidingConfigOverride: variant.slidingConfigOverride ?? null,
        glassCoatingOverride: variant.glassCoatingOverride ?? null,
        glassThicknessMmOverride:
          variant.glassThicknessMmOverride != null ? Number(variant.glassThicknessMmOverride) : null,
        glassFinishOverride: variant.glassFinishOverride ?? null,
        screenOverride: variant.screenOverride ?? null,
        openingTypeOverride: variant.openingTypeOverride ?? null,
        glassType: variant.glassType ?? null,
        screenType: variant.screenType ?? null,
        slideDirection: variant.slideDirection ?? null,
        variantType: variant.variantType ?? null,
        thicknessMm: variant.thicknessMm != null ? Number(variant.thicknessMm) : null,
        boxSqft: variant.boxSqft != null ? Number(variant.boxSqft) : null,
        archivedAt: variant.archivedAt ?? null,
        reorderLevel: Number(variant.reorderLevel ?? 0),
        reorderQty: Number(variant.reorderQty ?? 0),
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
    const bulkRows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (bulkRows.length > 0) {
      const glassFinishOverride = normalizeText(payload?.glassFinishOverride);
      const screenOverride = normalizeText(payload?.screenOverride);
      const openingTypeOverride = normalizeText(payload?.openingTypeOverride);
      const slidingConfigOverride = normalizeText(payload?.slidingConfigOverride);

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, category: true, type: true, thicknessMm: true },
      });
      if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
      const salesProduct = await prisma.salesProduct.findUnique({
        where: { id: productId },
        select: {
          skuPrefix: true,
          glassTypeDefault: true,
          glassCoatingDefault: true,
          glassThicknessMmDefault: true,
          glassFinishDefault: true,
          screenDefault: true,
          openingTypeDefault: true,
          frameMaterialDefault: true,
          slidingConfigDefault: true,
        },
      });

      const existingVariants = await prisma.productVariant.findMany({
        where: { productId },
        select: { width: true, height: true, color: true, sku: true },
      });
      const existingComboSet = new Set(
        existingVariants.map(
          (row) =>
            `${Math.trunc(Number(row.width ?? 0))}x${Math.trunc(Number(row.height ?? 0))}:${String(row.color ?? "")
              .trim()
              .toLowerCase()}`,
        ),
      );
      const existingSkuSet = new Set(existingVariants.map((row) => normalizeSkuValue(row.sku)));

      type BulkPreparedRow = {
        index: number;
        width: number;
        height: number;
        color: string;
        price: number | null;
        cost: number | null;
        openingStock: number;
        description: string | null;
      };
      const normalizedRows: BulkPreparedRow[] = bulkRows.map((row: any, index: number) => {
        const width = Number(row?.width);
        const height = Number(row?.height);
        const color = String(row?.color ?? "").trim();
        const price = row?.price !== undefined && row?.price !== null && row?.price !== "" ? Number(row.price) : null;
        const cost = row?.cost !== undefined && row?.cost !== null && row?.cost !== "" ? Number(row.cost) : null;
        const openingStock =
          row?.openingStock !== undefined && row?.openingStock !== null && row?.openingStock !== ""
            ? Number(row.openingStock)
            : 0;
        const description = String(row?.description ?? "").trim() || null;
        return { index, width, height, color, price, cost, openingStock, description };
      });
      const invalidRow = normalizedRows.find(
        (row) =>
          !Number.isFinite(row.width) ||
          row.width <= 0 ||
          !Number.isFinite(row.height) ||
          row.height <= 0 ||
          !row.color ||
          (row.price !== null && (!Number.isFinite(row.price) || row.price < 0)) ||
          (row.cost !== null && (!Number.isFinite(row.cost) || row.cost < 0)) ||
          !Number.isFinite(row.openingStock) ||
          row.openingStock < 0,
      );
      if (invalidRow) {
        return NextResponse.json(
          { error: `Invalid values in bulk row ${invalidRow.index + 1}.` },
          { status: 400 },
        );
      }

      const effectiveSpecs = getEffectiveSpecs(
        {
          glassTypeDefault: salesProduct?.glassTypeDefault ?? null,
          glassCoatingDefault: salesProduct?.glassCoatingDefault ?? null,
          glassThicknessMmDefault: salesProduct?.glassThicknessMmDefault ?? null,
          glassFinishDefault: salesProduct?.glassFinishDefault ?? null,
          screenDefault: salesProduct?.screenDefault ?? null,
          openingTypeDefault: salesProduct?.openingTypeDefault ?? null,
          frameMaterialDefault: salesProduct?.frameMaterialDefault ?? null,
          slidingConfigDefault: salesProduct?.slidingConfigDefault ?? null,
        },
        {
          glassFinishOverride,
          screenOverride,
          openingTypeOverride,
          slidingConfigOverride,
        },
      );

      const seenComboSet = new Set<string>();
      const seenSkuSet = new Set<string>();
      const preparedRows = normalizedRows.map((row) => {
        const width = Math.trunc(row.width);
        const height = Math.trunc(row.height);
        const comboKey = `${width}x${height}:${row.color.toLowerCase()}`;
        if (existingComboSet.has(comboKey) || seenComboSet.has(comboKey)) {
          throw new Error(`Duplicate variant combination in row ${row.index + 1}.`);
        }
        const sku = generateVariantSku({
          skuPrefix: String(salesProduct?.skuPrefix ?? ""),
          width,
          height,
          color: row.color,
          glassFinish: effectiveSpecs.glassFinish,
          manualSkuOverride: null,
        }).effectiveSku;
        if (!sku) throw new Error(`Failed to generate SKU for row ${row.index + 1}.`);
        if (sku.includes("-")) throw new Error(`SKU cannot contain hyphen (row ${row.index + 1}).`);
        if (existingSkuSet.has(sku) || seenSkuSet.has(sku)) {
          throw new Error(`SKU conflict for row ${row.index + 1}: ${sku}`);
        }
        seenComboSet.add(comboKey);
        seenSkuSet.add(sku);
        return { ...row, width, height, sku };
      });

      const createdRows = await prisma.$transaction(async (tx) => {
        const created = [];
        for (const row of preparedRows) {
          const variant = await tx.productVariant.create({
            data: {
              productId,
              sku: row.sku,
              description: row.description,
              width: row.width,
              height: row.height,
              color: row.color,
              glassTypeOverride: null,
              slidingConfigOverride:
                String(openingTypeOverride ?? "")
                  .trim()
                  .toLowerCase() === "sliding"
                  ? slidingConfigOverride
                  : null,
              glassCoatingOverride: null,
              glassThicknessMmOverride: null,
              glassFinishOverride,
              screenOverride,
              openingTypeOverride,
              variantType: product.type ?? null,
              thicknessMm: product.thicknessMm ?? null,
              boxSqft: null,
              cost: row.cost,
              price: row.price,
              reorderLevel: 0,
              reorderQty: 0,
              isStockItem: true,
            },
          });
          await tx.inventoryStock.create({
            data: {
              variantId: variant.id,
              onHand: row.openingStock,
              reserved: 0,
            },
          });
          created.push(variant);
        }
        return created;
      });

      const resultRows = await prisma.productVariant.findMany({
        where: { id: { in: createdRows.map((row) => row.id) } },
        include: { inventoryStock: { select: { onHand: true, reserved: true } } },
        orderBy: { createdAt: "asc" },
      });

      const missingDescriptionCount = normalizedRows.filter((row) => !String(row.description ?? "").trim()).length;
      const missingSkuCount = preparedRows.filter((row) => !String(row.sku ?? "").trim()).length;
      const validationWarnings: string[] = [];
      if (missingDescriptionCount > 0) {
        validationWarnings.push(
          `${missingDescriptionCount} bulk row(s) have empty Description.`,
        );
      }
      if (missingSkuCount > 0) {
        validationWarnings.push(`${missingSkuCount} bulk row(s) have empty SKU.`);
      }

      return NextResponse.json(
        {
          data: resultRows.map((variant) => {
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
              slidingConfigOverride: variant.slidingConfigOverride ?? null,
              glassCoatingOverride: variant.glassCoatingOverride ?? null,
              glassThicknessMmOverride:
                variant.glassThicknessMmOverride != null ? Number(variant.glassThicknessMmOverride) : null,
              glassFinishOverride: variant.glassFinishOverride ?? null,
              screenOverride: variant.screenOverride ?? null,
              openingTypeOverride: variant.openingTypeOverride ?? null,
              price: variant.price != null ? Number(variant.price) : null,
              cost: variant.cost != null ? Number(variant.cost) : null,
              reorderLevel: Number(variant.reorderLevel ?? 0),
              reorderQty: Number(variant.reorderQty ?? 0),
              onHand,
              reserved,
              available: onHand - reserved,
            };
          }),
          meta: {
            validationWarnings,
            validationSummary: {
              totalRows: normalizedRows.length,
              missingDescriptionCount,
              missingSkuCount,
            },
          },
        },
        { status: 201 },
      );
    }
    const displayName = normalizeText(payload?.displayName);
    const skuSuffix = normalizeSkuValue(String(payload?.skuSuffix ?? ""));
    const width =
      payload?.width !== undefined && payload?.width !== null && payload?.width !== ""
        ? Number(payload.width)
        : null;
    const height =
      payload?.height !== undefined && payload?.height !== null && payload?.height !== ""
        ? Number(payload.height)
        : null;
    const color = String(payload?.color ?? "").trim() || null;
    const glassTypeOverride = normalizeText(payload?.glassTypeOverride);
    const slidingConfigOverride = normalizeText(payload?.slidingConfigOverride);
    const glassCoatingOverride = normalizeText(payload?.glassCoatingOverride);
    const glassThicknessMmOverride = normalizePositiveInt(payload?.glassThicknessMmOverride);
    const glassFinishOverride = normalizeText(payload?.glassFinishOverride);
    const screenOverride = normalizeText(payload?.screenOverride);
    const openingTypeOverride = normalizeText(payload?.openingTypeOverride);
    const manualSkuOverride = normalizeSkuValue(String(payload?.skuOverride ?? ""));
    const inputSku = normalizeSkuValue(String(payload?.sku ?? ""));
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
    const reorderLevel =
      payload?.reorderLevel !== undefined && payload?.reorderLevel !== null && payload?.reorderLevel !== ""
        ? Number(payload.reorderLevel)
        : 0;
    const reorderQty =
      payload?.reorderQty !== undefined && payload?.reorderQty !== null && payload?.reorderQty !== ""
        ? Number(payload.reorderQty)
        : 0;
    const variantType = normalizeText(payload?.variantType);
    const thicknessMm =
      payload?.thicknessMm !== undefined && payload?.thicknessMm !== null && payload?.thicknessMm !== ""
        ? Number(payload.thicknessMm)
        : null;
    const boxSqft =
      payload?.boxSqft !== undefined && payload?.boxSqft !== null && payload?.boxSqft !== ""
        ? Number(payload.boxSqft)
        : null;
    const screenType = normalizeText(payload?.screenType);
    const slideDirection = normalizeText(payload?.slideDirection);
    const description = String(payload?.description ?? "").trim() || null;

    if ((width !== null && !Number.isFinite(width)) || (height !== null && !Number.isFinite(height))) {
      return NextResponse.json({ error: "Invalid size values." }, { status: 400 });
    }
    if ((price !== null && !Number.isFinite(price)) || (cost !== null && !Number.isFinite(cost))) {
      return NextResponse.json({ error: "Invalid numeric values." }, { status: 400 });
    }
    if ((thicknessMm !== null && !Number.isFinite(thicknessMm)) || (boxSqft !== null && !Number.isFinite(boxSqft))) {
      return NextResponse.json({ error: "Invalid thickness or box coverage values." }, { status: 400 });
    }
    if (!Number.isFinite(openingStock) || openingStock < 0) {
      return NextResponse.json({ error: "Opening stock must be 0 or greater." }, { status: 400 });
    }
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0 || !Number.isFinite(reorderQty) || reorderQty < 0) {
      return NextResponse.json({ error: "Reorder Level and Reorder Qty must be 0 or greater." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, category: true, type: true, thicknessMm: true },
    });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (product.category === "WINDOW") {
      if (!width || !height) return NextResponse.json({ error: "Size is required." }, { status: 400 });
      if (!color) return NextResponse.json({ error: "Color is required." }, { status: 400 });
    }

    const duplicateCandidates = await prisma.productVariant.findMany({
      where: { productId, width, height },
      select: { id: true, color: true },
    });
    if (product.category === "WINDOW") {
      const duplicate = duplicateCandidates.find(
        (row) => String(row.color ?? "").trim().toLowerCase() === String(color).toLowerCase(),
      );
      if (duplicate) {
        return NextResponse.json({ error: "Duplicate variant combination." }, { status: 400 });
      }
    }

    const salesProduct = await prisma.salesProduct.findUnique({
      where: { id: productId },
      select: {
        skuPrefix: true,
        glassTypeDefault: true,
        glassCoatingDefault: true,
        glassThicknessMmDefault: true,
        glassFinishDefault: true,
        screenDefault: true,
        openingTypeDefault: true,
        frameMaterialDefault: true,
        slidingConfigDefault: true,
      },
    });
    const effectiveSpecs = getEffectiveSpecs(
      {
        glassTypeDefault: salesProduct?.glassTypeDefault ?? null,
        glassCoatingDefault: salesProduct?.glassCoatingDefault ?? null,
        glassThicknessMmDefault: salesProduct?.glassThicknessMmDefault ?? null,
        glassFinishDefault: salesProduct?.glassFinishDefault ?? null,
        screenDefault: salesProduct?.screenDefault ?? null,
        openingTypeDefault: salesProduct?.openingTypeDefault ?? null,
        frameMaterialDefault: salesProduct?.frameMaterialDefault ?? null,
        slidingConfigDefault: salesProduct?.slidingConfigDefault ?? null,
      },
      {
        glassTypeOverride,
        slidingConfigOverride,
        glassCoatingOverride,
        glassThicknessMmOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
      },
    );
    const normalizedSkuPrefix = normalizeSkuValue(String(salesProduct?.skuPrefix ?? ""));
    const skuSuffixFromInput =
      inputSku && normalizedSkuPrefix && inputSku.startsWith(normalizedSkuPrefix)
        ? inputSku.slice(normalizedSkuPrefix.length)
        : "";
    const effectiveFloorSkuSuffix = skuSuffix || skuSuffixFromInput;
    const sku =
      product.category === "FLOOR"
        ? manualSkuOverride || inputSku || normalizeSkuValue(`${normalizedSkuPrefix}${effectiveFloorSkuSuffix}`)
        : generateVariantSku({
            skuPrefix: String(salesProduct?.skuPrefix ?? ""),
            width: width ?? 0,
            height: height ?? 0,
            color,
            glassFinish: effectiveSpecs.glassFinish,
            manualSkuOverride: manualSkuOverride || null,
          }).effectiveSku;
    if (!sku) return NextResponse.json({ error: "Failed to generate SKU." }, { status: 400 });
    if (sku.includes("-")) return NextResponse.json({ error: "SKU cannot contain hyphen." }, { status: 400 });
    if (!displayName) {
      return NextResponse.json({ error: "Display Name is required." }, { status: 400 });
    }
    if (product.category === "FLOOR") {
      if (!manualSkuOverride && !inputSku && !effectiveFloorSkuSuffix) {
        return NextResponse.json({ error: "SKU is required for Flooring variant." }, { status: 400 });
      }
      if (!manualSkuOverride && !inputSku && !String(salesProduct?.skuPrefix ?? "").trim()) {
        return NextResponse.json({ error: "SKU Prefix is required for Flooring product." }, { status: 400 });
      }
    }

    const created = await prisma.productVariant.create({
      data: {
        productId,
        sku,
        displayName,
        skuSuffix: effectiveFloorSkuSuffix || null,
        description,
        width,
        height,
        color,
        glassTypeOverride,
        slidingConfigOverride,
        glassCoatingOverride,
        glassThicknessMmOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
        screenType,
        slideDirection,
        variantType: variantType ?? product.type ?? null,
        thicknessMm: thicknessMm ?? product.thicknessMm ?? null,
        boxSqft,
        cost,
        price,
        reorderLevel,
        reorderQty,
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
    const validationWarnings = buildVariantValidationWarnings({ sku: created.sku, description: created.description });
    return NextResponse.json(
      {
        data: {
          id: created.id,
          productId: created.productId,
          sku: created.sku,
          displayName: created.displayName ?? null,
          skuSuffix: created.skuSuffix ?? null,
          width: created.width != null ? Number(created.width) : null,
          height: created.height != null ? Number(created.height) : null,
          color: created.color ?? null,
          glassTypeOverride: created.glassTypeOverride ?? null,
          slidingConfigOverride: created.slidingConfigOverride ?? null,
          glassCoatingOverride: created.glassCoatingOverride ?? null,
          glassThicknessMmOverride:
            created.glassThicknessMmOverride != null ? Number(created.glassThicknessMmOverride) : null,
          glassFinishOverride: created.glassFinishOverride ?? null,
          screenOverride: created.screenOverride ?? null,
          openingTypeOverride: created.openingTypeOverride ?? null,
          glassType: created.glassType ?? null,
          screenType: created.screenType ?? null,
          slideDirection: created.slideDirection ?? null,
          variantType: created.variantType ?? null,
          thicknessMm: created.thicknessMm != null ? Number(created.thicknessMm) : null,
          boxSqft: created.boxSqft != null ? Number(created.boxSqft) : null,
          price: created.price != null ? Number(created.price) : null,
          cost: created.cost != null ? Number(created.cost) : null,
          reorderLevel: Number(created.reorderLevel ?? 0),
          reorderQty: Number(created.reorderQty ?? 0),
          description: created.description ?? null,
          archivedAt: created.archivedAt ?? null,
          onHand,
          reserved,
          available: onHand - reserved,
        },
        meta: { validationWarnings },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && (error.message.includes("row") || error.message.includes("SKU"))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
    if (payload?.archive !== undefined) {
      const current = await prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });
      if (!current) return NextResponse.json({ error: "Variant not found." }, { status: 404 });
      const updated = await prisma.productVariant.update({
        where: { id: variantId },
        data: {
          archivedAt: payload.archive ? new Date() : null,
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
            displayName: updated.displayName ?? null,
            skuSuffix: updated.skuSuffix ?? null,
            width: updated.width != null ? Number(updated.width) : null,
            height: updated.height != null ? Number(updated.height) : null,
            color: updated.color ?? null,
            glassTypeOverride: updated.glassTypeOverride ?? null,
            slidingConfigOverride: updated.slidingConfigOverride ?? null,
            glassCoatingOverride: updated.glassCoatingOverride ?? null,
            glassThicknessMmOverride:
              updated.glassThicknessMmOverride != null ? Number(updated.glassThicknessMmOverride) : null,
            glassFinishOverride: updated.glassFinishOverride ?? null,
            screenOverride: updated.screenOverride ?? null,
            openingTypeOverride: updated.openingTypeOverride ?? null,
            price: updated.price != null ? Number(updated.price) : null,
            cost: updated.cost != null ? Number(updated.cost) : null,
            description: updated.description ?? null,
            archivedAt: updated.archivedAt ?? null,
            onHand,
            reserved,
            available: onHand - reserved,
          },
        },
        { status: 200 },
      );
    }

    const skuOverride = normalizeSkuValue(String(payload?.skuOverride ?? ""));
    const inputSku = normalizeSkuValue(String(payload?.sku ?? ""));
    const displayName = normalizeText(payload?.displayName);
    const skuSuffix = normalizeSkuValue(String(payload?.skuSuffix ?? ""));
    const width = payload?.width !== undefined && payload?.width !== null && payload?.width !== "" ? Number(payload.width) : null;
    const height = payload?.height !== undefined && payload?.height !== null && payload?.height !== "" ? Number(payload.height) : null;
    const color = String(payload?.color ?? "").trim() || null;
    const glassTypeOverride = normalizeText(payload?.glassTypeOverride);
    const slidingConfigOverride = normalizeText(payload?.slidingConfigOverride);
    const glassCoatingOverride = normalizeText(payload?.glassCoatingOverride);
    const glassThicknessMmOverride = normalizePositiveInt(payload?.glassThicknessMmOverride);
    const glassFinishOverride = normalizeText(payload?.glassFinishOverride);
    const screenOverride = normalizeText(payload?.screenOverride);
    const openingTypeOverride = normalizeText(payload?.openingTypeOverride);
    const price = payload?.price !== undefined && payload?.price !== null && payload?.price !== "" ? Number(payload.price) : null;
    const cost = payload?.cost !== undefined && payload?.cost !== null && payload?.cost !== "" ? Number(payload.cost) : null;
    const reorderLevel =
      payload?.reorderLevel !== undefined && payload?.reorderLevel !== null && payload?.reorderLevel !== ""
        ? Number(payload.reorderLevel)
        : undefined;
    const reorderQty =
      payload?.reorderQty !== undefined && payload?.reorderQty !== null && payload?.reorderQty !== ""
        ? Number(payload.reorderQty)
        : undefined;
    const description = String(payload?.description ?? "").trim() || null;
    const variantType = normalizeText(payload?.variantType);
    const thicknessMm =
      payload?.thicknessMm !== undefined && payload?.thicknessMm !== null && payload?.thicknessMm !== ""
        ? Number(payload.thicknessMm)
        : null;
    const boxSqft =
      payload?.boxSqft !== undefined && payload?.boxSqft !== null && payload?.boxSqft !== ""
        ? Number(payload.boxSqft)
        : null;
    const screenType = normalizeText(payload?.screenType);
    const slideDirection = normalizeText(payload?.slideDirection);

    const productDefaults = await prisma.salesProduct.findUnique({
      where: { id: productId },
      select: {
        skuPrefix: true,
        glassTypeDefault: true,
        glassCoatingDefault: true,
        glassThicknessMmDefault: true,
        glassFinishDefault: true,
        screenDefault: true,
        openingTypeDefault: true,
        frameMaterialDefault: true,
        slidingConfigDefault: true,
      },
    });
    const productMeta = await prisma.product.findUnique({
      where: { id: productId },
      select: { category: true },
    });
    const effectiveSpecs = getEffectiveSpecs(
      {
        glassTypeDefault: productDefaults?.glassTypeDefault ?? null,
        glassCoatingDefault: productDefaults?.glassCoatingDefault ?? null,
        glassThicknessMmDefault: productDefaults?.glassThicknessMmDefault ?? null,
        glassFinishDefault: productDefaults?.glassFinishDefault ?? null,
        screenDefault: productDefaults?.screenDefault ?? null,
        openingTypeDefault: productDefaults?.openingTypeDefault ?? null,
        frameMaterialDefault: productDefaults?.frameMaterialDefault ?? null,
        slidingConfigDefault: productDefaults?.slidingConfigDefault ?? null,
      },
      {
        glassTypeOverride,
        slidingConfigOverride,
        glassCoatingOverride,
        glassThicknessMmOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
      },
    );
    const normalizedSkuPrefix = normalizeSkuValue(String(productDefaults?.skuPrefix ?? ""));
    const skuSuffixFromInput =
      inputSku && normalizedSkuPrefix && inputSku.startsWith(normalizedSkuPrefix)
        ? inputSku.slice(normalizedSkuPrefix.length)
        : "";
    const effectiveFloorSkuSuffix = skuSuffix || skuSuffixFromInput;
    const generatedSku =
      productMeta?.category === "FLOOR"
        ? normalizeSkuValue(`${normalizedSkuPrefix}${effectiveFloorSkuSuffix}`)
        : generateVariantSku({
            skuPrefix: String(productDefaults?.skuPrefix ?? ""),
            width: width ?? 0,
            height: height ?? 0,
            color,
            glassFinish: effectiveSpecs.glassFinish,
            manualSkuOverride: skuOverride || null,
          }).effectiveSku;
    const sku =
      productMeta?.category === "FLOOR"
        ? skuOverride || inputSku || generatedSku
        : skuOverride || generatedSku || inputSku;
    if (!sku) return NextResponse.json({ error: "SKU is required." }, { status: 400 });
    if (sku.includes("-")) return NextResponse.json({ error: "SKU cannot contain hyphen." }, { status: 400 });
    if ((width !== null && !Number.isFinite(width)) || (height !== null && !Number.isFinite(height))) {
      return NextResponse.json({ error: "Invalid size values." }, { status: 400 });
    }
    if (productMeta?.category === "WINDOW") {
      if (!width || !height) return NextResponse.json({ error: "Size is required." }, { status: 400 });
      if (!color) return NextResponse.json({ error: "Color is required." }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: "Display Name is required." }, { status: 400 });
    }
    if (productMeta?.category === "FLOOR") {
      if (!skuOverride && !inputSku && !effectiveFloorSkuSuffix) {
        return NextResponse.json({ error: "SKU is required for Flooring variant." }, { status: 400 });
      }
      if (!skuOverride && !inputSku && !String(productDefaults?.skuPrefix ?? "").trim()) {
        return NextResponse.json({ error: "SKU Prefix is required for Flooring product." }, { status: 400 });
      }
    }
    if ((price !== null && !Number.isFinite(price)) || (cost !== null && !Number.isFinite(cost))) {
      return NextResponse.json({ error: "Invalid numeric values." }, { status: 400 });
    }
    if ((thicknessMm !== null && !Number.isFinite(thicknessMm)) || (boxSqft !== null && !Number.isFinite(boxSqft))) {
      return NextResponse.json({ error: "Invalid thickness or box coverage values." }, { status: 400 });
    }
    if (
      (reorderLevel !== undefined && (!Number.isFinite(reorderLevel) || reorderLevel < 0)) ||
      (reorderQty !== undefined && (!Number.isFinite(reorderQty) || reorderQty < 0))
    ) {
      return NextResponse.json({ error: "Reorder Level and Reorder Qty must be 0 or greater." }, { status: 400 });
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
        displayName,
        skuSuffix: effectiveFloorSkuSuffix || null,
        width,
        height,
        color,
        glassTypeOverride,
        slidingConfigOverride,
        glassCoatingOverride,
        glassThicknessMmOverride,
        glassFinishOverride,
        screenOverride,
        openingTypeOverride,
        screenType,
        slideDirection,
        variantType,
        thicknessMm,
        boxSqft,
        price,
        cost,
        reorderLevel,
        reorderQty,
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
    const validationWarnings = buildVariantValidationWarnings({ sku: updated.sku, description: updated.description });
    return NextResponse.json(
      {
        data: {
          id: updated.id,
          productId: updated.productId,
          sku: updated.sku,
          displayName: updated.displayName ?? null,
          skuSuffix: updated.skuSuffix ?? null,
          width: updated.width != null ? Number(updated.width) : null,
          height: updated.height != null ? Number(updated.height) : null,
          color: updated.color ?? null,
          glassTypeOverride: updated.glassTypeOverride ?? null,
          slidingConfigOverride: updated.slidingConfigOverride ?? null,
          glassCoatingOverride: updated.glassCoatingOverride ?? null,
          glassThicknessMmOverride:
            updated.glassThicknessMmOverride != null ? Number(updated.glassThicknessMmOverride) : null,
          glassFinishOverride: updated.glassFinishOverride ?? null,
          screenOverride: updated.screenOverride ?? null,
          openingTypeOverride: updated.openingTypeOverride ?? null,
          glassType: updated.glassType ?? null,
          screenType: updated.screenType ?? null,
          slideDirection: updated.slideDirection ?? null,
          variantType: updated.variantType ?? null,
          thicknessMm: updated.thicknessMm != null ? Number(updated.thicknessMm) : null,
          boxSqft: updated.boxSqft != null ? Number(updated.boxSqft) : null,
          price: updated.price != null ? Number(updated.price) : null,
          cost: updated.cost != null ? Number(updated.cost) : null,
          reorderLevel: Number(updated.reorderLevel ?? 0),
          reorderQty: Number(updated.reorderQty ?? 0),
          description: updated.description ?? null,
          archivedAt: updated.archivedAt ?? null,
          onHand,
          reserved,
          available: onHand - reserved,
        },
        meta: { validationWarnings },
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
