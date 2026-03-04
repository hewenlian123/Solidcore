import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();
    const params = request.nextUrl.searchParams;
    const lowOnly = params.get("lowOnly") !== "false";
    const supplierIdFilter = String(params.get("supplierId") ?? "").trim();
    const query = String(params.get("q") ?? "").trim().toLowerCase();

    let variants: Array<{
      id: string;
      sku: string;
      description: string | null;
      displayName?: string | null;
      reorderLevel: unknown;
      reorderQty: unknown;
      cost: unknown;
      boxSqft: unknown;
      product: { id: string; name: string; title: string | null };
      inventoryStock: { onHand: unknown; reserved: unknown } | null;
    }> = [];

    try {
      variants = await prisma.productVariant.findMany({
        where: { isStockItem: true },
        select: {
          id: true,
          sku: true,
          description: true,
          displayName: true,
          reorderLevel: true,
          reorderQty: true,
          cost: true,
          boxSqft: true,
          product: { select: { id: true, name: true, title: true } },
          inventoryStock: { select: { onHand: true, reserved: true } },
        },
      });
    } catch {
      variants = await prisma.productVariant.findMany({
        where: { isStockItem: true },
        select: {
          id: true,
          sku: true,
          description: true,
          reorderLevel: true,
          reorderQty: true,
          cost: true,
          boxSqft: true,
          product: { select: { id: true, name: true, title: true } },
          inventoryStock: { select: { onHand: true, reserved: true } },
        },
      });
    }

    const productIds = Array.from(new Set(variants.map((v) => v.product.id)));
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, category: true, supplierId: true },
        })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));
    const supplierIds = Array.from(
      new Set(products.map((p) => p.supplierId).filter((id): id is string => Boolean(id))),
    );
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true, contactName: true, phone: true },
        })
      : [];
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));

    const rows = variants
      .map((variant) => {
        const product = productById.get(variant.product.id);
        const onHand = Number(variant.inventoryStock?.onHand ?? 0);
        const reserved = Number(variant.inventoryStock?.reserved ?? 0);
        const available = onHand - reserved;
        const reorderLevel = Number(variant.reorderLevel ?? 0);
        const reorderQty = Number(variant.reorderQty ?? 0);
        const suggestedQtyBoxes =
          reorderQty > 0 ? Math.ceil(reorderQty) : Math.max(Math.ceil(reorderLevel * 2 - available), 0);
        const sqftPerBox = Number(variant.boxSqft ?? 0);
        const isFlooring = product?.category === "FLOOR";
        const supplierId = product?.supplierId ?? null;
        const supplierName = supplierId ? (supplierById.get(supplierId)?.name ?? "Unknown Supplier") : "Unassigned";
        const supplierContactName = supplierId ? (supplierById.get(supplierId)?.contactName ?? null) : null;
        const supplierPhone = supplierId ? (supplierById.get(supplierId)?.phone ?? null) : null;
        const variantLabel = isFlooring
          ? String(variant.displayName ?? variant.description ?? "").trim() ||
            String(variant.product.title ?? variant.product.name)
          : String(variant.description ?? "").trim() || String(variant.product.title ?? variant.product.name);
        return {
          id: variant.id,
          sku: variant.sku,
          variantName: variantLabel,
          productId: variant.product.id,
          supplierId,
          supplierName,
          supplierContactName,
          supplierPhone,
          isFlooring,
          availableBoxes: available,
          reorderLevelBoxes: reorderLevel,
          reorderQtyBoxes: reorderQty,
          suggestedQtyBoxes,
          sqftPerBox,
          suggestedQtySqft: isFlooring && sqftPerBox > 0 ? suggestedQtyBoxes * sqftPerBox : null,
          unitCost: Number(variant.cost ?? 0),
          lowStock: available <= reorderLevel,
        };
      })
      .filter((row) => (lowOnly ? row.lowStock : true))
      .filter((row) => (supplierIdFilter ? row.supplierId === supplierIdFilter : true))
      .filter((row) => {
        if (!query) return true;
        return row.sku.toLowerCase().includes(query) || row.variantName.toLowerCase().includes(query);
      });

    return NextResponse.json(
      {
        data: rows,
        meta: {
          supplierOptions: suppliers.map((item) => ({
            id: item.id,
            name: item.name,
            contactName: item.contactName,
            phone: item.phone,
          })),
          total: rows.length,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/inventory/reorder error:", error);
    return NextResponse.json({ error: "Failed to load reorder list." }, { status: 500 });
  }
}

