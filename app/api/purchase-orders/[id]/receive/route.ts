import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

function normalizeMovementUnit(rawUnit: string | null | undefined, hasBoxCoverage: boolean) {
  if (hasBoxCoverage) return "box";
  const unit = String(rawUnit ?? "").trim().toLowerCase();
  if (unit.includes("sqft") || unit === "sf" || unit === "ft2" || unit === "sqm") return "sqft";
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc") return "piece";
  return unit || "piece";
}

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

type ReceiveRequestItem = { variantId: string; qty: number };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const itemsRaw = Array.isArray(payload?.items) ? payload.items : [];
    const operator = payload?.operator ? String(payload.operator) : null;

    const receiveItems: ReceiveRequestItem[] = itemsRaw
      .map((row: any) => ({
        variantId: String(row?.variantId ?? "").trim(),
        qty: Number(row?.qty ?? 0),
      }))
      .filter((row: ReceiveRequestItem) => row.variantId && Number.isFinite(row.qty) && row.qty >= 0);

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true } },
        },
      });
      if (!po) throw new Error("PO_NOT_FOUND");
      if (String(po.status ?? "").toUpperCase() === "RECEIVED") throw new Error("ALREADY_RECEIVED");

      const noteJson = safeJsonParse(po.notes ?? null);
      const draftItems = Array.isArray(noteJson?.items) ? noteJson.items : null;
      if (!draftItems || draftItems.length === 0) {
        throw new Error("NO_ITEMS");
      }

      const draftByVariantId = new Map<string, any>();
      for (const row of draftItems) {
        const variantId = String(row?.variantId ?? "").trim();
        if (!variantId) continue;
        draftByVariantId.set(variantId, row);
      }

      const targetVariantIds =
        receiveItems.length > 0 ? receiveItems.map((r) => r.variantId) : Array.from(draftByVariantId.keys());

      const variants = await tx.productVariant.findMany({
        where: { id: { in: targetVariantIds } },
        select: {
          id: true,
          sku: true,
          boxSqft: true,
          product: { select: { unit: true, name: true } },
        },
      });
      const variantById = new Map(variants.map((v) => [v.id, v]));

      const applied: Array<{ variantId: string; qty: number; unit: string; sku: string | null }> = [];
      let expectedTotal = 0;
      let receivedTotal = 0;

      for (const variantId of Array.from(draftByVariantId.keys())) {
        const draft = draftByVariantId.get(variantId);
        const expected = Math.max(Number(draft?.suggestedQtyBoxes ?? 0), 0);
        expectedTotal += expected;
      }

      const qtyByVariantId = new Map(receiveItems.map((r) => [r.variantId, r.qty]));

      for (const variantId of targetVariantIds) {
        const draft = draftByVariantId.get(variantId);
        if (!draft) continue;
        const expected = Math.max(Number(draft?.suggestedQtyBoxes ?? 0), 0);
        const qty = receiveItems.length > 0 ? Math.max(Number(qtyByVariantId.get(variantId) ?? 0), 0) : expected;
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const variant = variantById.get(variantId);
        if (!variant) continue;

        const movementUnit = normalizeMovementUnit(variant.product?.unit ?? null, Number(variant.boxSqft ?? 0) > 0);
        const delta = new Prisma.Decimal(qty);

        await tx.inventoryStock.upsert({
          where: { variantId },
          create: { variantId, onHand: delta, reserved: new Prisma.Decimal(0) },
          update: { onHand: { increment: delta } },
        });

        await tx.inventoryMovement.create({
          data: {
            variantId,
            type: "RECEIVE",
            qty: delta,
            unit: movementUnit,
            note: `PO ${po.poNumber} received${operator ? ` by ${operator}` : ""}`,
          },
        });

        receivedTotal += qty;
        applied.push({ variantId, qty, unit: movementUnit, sku: variant.sku ?? null });
      }

      const nextStatus = receivedTotal >= expectedTotal && expectedTotal > 0 ? "RECEIVED" : "PARTIAL";
      const nextNotes = {
        ...(noteJson ?? { source: "REORDER_LIST" }),
        receiving: {
          receivedAt: new Date().toISOString(),
          operator,
          status: nextStatus,
          expectedTotal,
          receivedTotal,
          applied,
        },
      };

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: nextStatus,
          notes: JSON.stringify(nextNotes),
        },
      });

      return { poId: po.id, poNumber: po.poNumber, status: nextStatus, expectedTotal, receivedTotal, applied };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PO_NOT_FOUND") {
        return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
      }
      if (error.message === "ALREADY_RECEIVED") {
        return NextResponse.json({ error: "Purchase order already received." }, { status: 409 });
      }
      if (error.message === "NO_ITEMS") {
        return NextResponse.json(
          { error: "This PO has no receivable items (missing draft items in notes)." },
          { status: 400 },
        );
      }
    }
    console.error("POST /api/purchase-orders/[id]/receive error:", error);
    return NextResponse.json({ error: "Failed to receive purchase order." }, { status: 500 });
  }
}

