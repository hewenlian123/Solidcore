import { Prisma, ProductCategory, ProductUnit } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type ImportRowInput = {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  unit?: string;
  salePrice?: number | string | null;
  costPrice?: number | string | null;
  onHand?: number | string | null;
  reorderLevel?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  color?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
};

function normalizeSku(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "").trim();
}

function hasSkuAlphaNumeric(value: string) {
  return /[A-Z0-9]/.test(value);
}

function shouldSkipSku(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  return /^-+$/.test(raw);
}

function toNullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCategory(value: unknown): { category: ProductCategory; customCategoryName: string | null } {
  const raw = String(value ?? "").trim();
  const key = raw
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (key === "WINDOW" || key === "WINDOWS") {
    return { category: "WINDOW", customCategoryName: null };
  }
  if (key === "FLOOR" || key === "FLOORING") {
    return { category: "FLOOR", customCategoryName: null };
  }
  if (key === "MIRROR" || key === "MIRRORS" || key === "LED_MIRROR") {
    if (key === "LED_MIRROR") {
      return { category: "OTHER", customCategoryName: "LED Mirror" };
    }
    return { category: "MIRROR", customCategoryName: null };
  }
  if (key === "DOOR" || key === "DOORS" || key === "BATHROOM_SHOWER_GLASS_DOOR") {
    if (key === "BATHROOM_SHOWER_GLASS_DOOR") {
      return { category: "OTHER", customCategoryName: "Bathroom Shower Glass Door" };
    }
    return { category: "DOOR", customCategoryName: null };
  }
  if (key === "WAREHOUSE_SUPPLY" || key === "WAREHOUSE" || key === "SUPPLY") {
    return { category: "WAREHOUSE_SUPPLY", customCategoryName: null };
  }
  if (key === "FLOOR_ACCESSORIES") {
    return { category: "OTHER", customCategoryName: "Floor Accessories" };
  }
  if (key === "TILE_FINISH_EDGE") {
    return { category: "OTHER", customCategoryName: "Tile Finish Edge" };
  }
  if (key === "SHAMPOO_NICHE") {
    return { category: "OTHER", customCategoryName: "Shampoo Niche" };
  }
  if (key === "OTHER") {
    return { category: "OTHER", customCategoryName: null };
  }
  return { category: "OTHER", customCategoryName: raw || null };
}

function parseUnit(value: unknown): ProductUnit {
  const key = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (key === "SQM" || key === "SQFT") return "SQM";
  if (key === "SET") return "SET";
  if (key === "PIECE" || key === "PCS") return "PIECE";
  if (key === "SHEET") return "SHEET";
  return "PIECE";
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRowInput[]) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "rows is required." }, { status: 400 });
    }

    const [warehouses, suppliers] = await Promise.all([
      prisma.warehouse.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const defaultWarehouseId = warehouses[0]?.id ?? null;
    const warehouseByName = new Map(warehouses.map((row) => [row.name.trim().toLowerCase(), row.id]));
    const supplierByName = new Map(suppliers.map((row) => [row.name.trim().toLowerCase(), row.id]));

    const errors: Array<{ row: number; sku: string; error: string }> = [];
    const warnings: Array<{ row: number; sku: string; warning: string }> = [];
    const failureReasonCounts = new Map<string, number>();
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNo = i + 1;
      if (shouldSkipSku(row.sku)) {
        skippedCount += 1;
        continue;
      }
      const sku = normalizeSku(row.sku);
      let debugContext: Record<string, unknown> = {
        skuRaw: row.sku ?? null,
        nameRaw: row.name ?? null,
        categoryRaw: row.category ?? null,
        unitRaw: row.unit ?? null,
        warehouseIdRaw: row.warehouseId ?? null,
        warehouseNameRaw: row.warehouseName ?? null,
        supplierIdRaw: row.supplierId ?? null,
        supplierNameRaw: row.supplierName ?? null,
      };
      try {
        if (!sku) throw new Error("SKU is required.");
        if (!hasSkuAlphaNumeric(sku)) {
          throw new Error("SKU must contain at least one letter or number.");
        }

        const name = String(row.name ?? "").trim() || sku;
        const description = toNullableText(row.description);
        const salePrice = Math.max(0, Number(toNumberOrNull(row.salePrice) ?? 0));
        const costPrice = Math.max(0, Number(toNumberOrNull(row.costPrice) ?? 0));
        const onHand = Math.max(0, Number(toNumberOrNull(row.onHand) ?? 0));
        const reorderLevel = Math.max(0, Number(toNumberOrNull(row.reorderLevel) ?? 0));
        const width = toNumberOrNull(row.width);
        const height = toNumberOrNull(row.height);
        const color = toNullableText(row.color);
        const categoryInfo = parseCategory(row.category);
        const category = categoryInfo.category;
        const customCategoryName = categoryInfo.customCategoryName;
        const unit = parseUnit(row.unit);
        const warehouseId =
          toNullableText(row.warehouseId) ||
          warehouseByName.get(String(row.warehouseName ?? "").trim().toLowerCase()) ||
          defaultWarehouseId;
        if (!warehouseId) throw new Error("No warehouse available for import.");
        const supplierId =
          toNullableText(row.supplierId) ||
          supplierByName.get(String(row.supplierName ?? "").trim().toLowerCase()) ||
          null;
        debugContext = {
          ...debugContext,
          skuNormalized: sku,
          name,
          category,
          customCategoryName,
          unit,
          salePrice,
          costPrice,
          onHand,
          reorderLevel,
          width,
          height,
          color,
          warehouseResolved: warehouseId,
          supplierResolved: supplierId,
        };

        if (!description) {
          warnings.push({ row: rowNo, sku, warning: "Description is empty." });
        }

        const existingVariant = await prisma.productVariant.findUnique({
          where: { sku },
          select: { id: true, productId: true },
        });

        if (existingVariant) {
          await prisma.$transaction(async (tx) => {
            await tx.product.update({
              where: { id: existingVariant.productId },
              data: {
                name,
                category,
                customCategoryName,
                unit,
                salePrice,
                costPrice,
                warehouseId,
                supplierId,
                defaultDescription: description,
              },
            });
            await tx.salesProduct.upsert({
              where: { id: existingVariant.productId },
              update: {
                name,
                title: name,
                defaultDescription: description,
                unit,
                price: salePrice,
                cost: costPrice,
              },
              create: {
                id: existingVariant.productId,
                name,
                title: name,
                defaultDescription: description,
                unit,
                price: salePrice,
                cost: costPrice,
              },
            });
            await tx.productVariant.update({
              where: { id: existingVariant.id },
              data: {
                description,
                width,
                height,
                color,
                price: salePrice,
                cost: costPrice,
                reorderLevel,
              },
            });
            await tx.inventoryStock.upsert({
              where: { variantId: existingVariant.id },
              update: { onHand },
              create: { variantId: existingVariant.id, onHand, reserved: 0 },
            });
          });
          updatedCount += 1;
        } else {
          await prisma.$transaction(async (tx) => {
            // Re-import safety: reuse product by name if present; otherwise create once.
            const matchedProduct = await tx.product.findFirst({
              where: { name },
              select: { id: true },
            });
            const product = matchedProduct
              ? await tx.product.update({
                  where: { id: matchedProduct.id },
                  data: {
                    category,
                    customCategoryName,
                    unit,
                    costPrice,
                    salePrice,
                    warehouseId,
                    supplierId,
                    defaultDescription: description,
                  },
                })
              : await tx.product.create({
                  data: {
                    name,
                    category,
                    customCategoryName,
                    unit,
                    costPrice,
                    salePrice,
                    warehouseId,
                    supplierId,
                    defaultDescription: description,
                    barcode: null,
                    specification: null,
                  },
                });
            await tx.salesProduct.upsert({
              where: { id: product.id },
              update: {
                name,
                title: name,
                defaultDescription: description,
                unit,
                price: salePrice,
                cost: costPrice,
              },
              create: {
                id: product.id,
                name,
                title: name,
                defaultDescription: description,
                unit,
                price: salePrice,
                cost: costPrice,
              },
            });
            const variant = await tx.productVariant.create({
              data: {
                productId: product.id,
                sku,
                description,
                width,
                height,
                color,
                price: salePrice,
                cost: costPrice,
                reorderLevel,
                reorderQty: 0,
                isStockItem: true,
              },
            });
            await tx.inventoryStock.create({
              data: { variantId: variant.id, onHand, reserved: 0 },
            });
          });
          createdCount += 1;
        }
      } catch (error) {
        const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
          ? "SKU already exists."
          : error instanceof Error
            ? error.message
            : "Unknown import error.";
        errors.push({ row: rowNo, sku, error: message });
        failureReasonCounts.set(message, (failureReasonCounts.get(message) ?? 0) + 1);
        console.error("POST /api/products/import row failed:", {
          row: rowNo,
          sku,
          reason: message,
          context: debugContext,
          rowData: row,
        });
      }
    }

    const topFailureReasons = Array.from(failureReasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    return NextResponse.json(
      {
        data: {
          summary: {
            totalRows: rows.length,
            createdCount,
            updatedCount,
            skippedCount,
            failedCount: errors.length,
            warningCount: warnings.length,
          },
          topFailureReasons,
          errors,
          warnings,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/products/import error:", error);
    return NextResponse.json({ error: "Failed to import products." }, { status: 500 });
  }
}
