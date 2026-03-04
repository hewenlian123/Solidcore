import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();
    return NextResponse.json(
      {
        error:
          "Deprecated endpoint. Procurement draft is paused until variant-level purchasing is implemented.",
      },
      { status: 410 },
    );
  } catch (error) {
    console.error("GET /api/procurements/draft error:", error);
    return NextResponse.json({ error: "Failed to generate purchase draft." }, { status: 500 });
  }
}

function buildDraftPoNumber(index: number) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const t = String(now.getTime()).slice(-6);
  return `PO-DRAFT-${y}${m}${d}-${t}-${index + 1}`;
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const payload = await request.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Please select at least one reorder item." }, { status: 400 });
    }

    type DraftItem = {
      variantId: string;
      supplierId: string;
      sku: string;
      variantName: string;
      suggestedQtyBoxes: number;
      suggestedQtySqft: number | null;
      unitCost: number;
      lineNotes: string | null;
    };

    const normalized: DraftItem[] = items
      .map((item: any) => ({
        variantId: String(item?.variantId ?? "").trim(),
        supplierId: String(item?.supplierId ?? "").trim(),
        sku: String(item?.sku ?? "").trim(),
        variantName: String(item?.variantName ?? "").trim(),
        suggestedQtyBoxes: Math.max(Number(item?.suggestedQtyBoxes ?? 0), 0),
        suggestedQtySqft:
          item?.suggestedQtySqft === null || item?.suggestedQtySqft === undefined
            ? null
            : Math.max(Number(item?.suggestedQtySqft ?? 0), 0),
        unitCost: Math.max(Number(item?.unitCost ?? 0), 0),
        lineNotes: item?.lineNotes ? String(item.lineNotes) : null,
      }))
      .filter((item: DraftItem) => item.variantId && item.supplierId && item.suggestedQtyBoxes > 0);

    if (normalized.length === 0) {
      return NextResponse.json(
        { error: "No valid supplier-linked items with suggested quantity were selected." },
        { status: 400 },
      );
    }

    const grouped = new Map<string, typeof normalized>();
    for (const item of normalized) {
      grouped.set(item.supplierId, [...(grouped.get(item.supplierId) ?? []), item]);
    }

    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: Array.from(grouped.keys()) } },
      select: { id: true },
    });
    const validSupplierIds = new Set(suppliers.map((s) => s.id));
    const validEntries = Array.from(grouped.entries()).filter(([supplierId]) => validSupplierIds.has(supplierId));
    if (validEntries.length === 0) {
      return NextResponse.json({ error: "No valid suppliers were found for selected items." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (let index = 0; index < validEntries.length; index++) {
        const [supplierId, supplierItems] = validEntries[index];
        const totalCost = supplierItems.reduce(
          (sum, item) => sum + Math.max(Number(item.suggestedQtyBoxes), 0) * Math.max(Number(item.unitCost), 0),
          0,
        );
        const totalBoxes = supplierItems.reduce(
          (sum, item) => sum + Math.max(Number(item.suggestedQtyBoxes), 0),
          0,
        );

        const po = await tx.purchaseOrder.create({
          data: {
            poNumber: buildDraftPoNumber(index),
            supplierId,
            status: "DRAFT",
            orderDate: new Date(),
            expectedArrival: null,
            totalCost,
            notes: JSON.stringify({
              source: "REORDER_LIST",
              totalBoxes,
              items: supplierItems,
            }),
          },
          select: {
            id: true,
            poNumber: true,
            supplierId: true,
            status: true,
            totalCost: true,
            orderDate: true,
          },
        });
        rows.push(po);
      }
      return rows;
    });

    return NextResponse.json(
      { data: { createdCount: created.length, purchaseOrders: created } },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/procurements/draft error:", error);
    return NextResponse.json({ error: "Failed to generate purchase draft." }, { status: 500 });
  }
}
