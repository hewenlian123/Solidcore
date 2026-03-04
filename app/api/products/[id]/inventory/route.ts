import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeMovementUnit(rawUnit: string | null | undefined, hasBoxCoverage: boolean) {
  if (hasBoxCoverage) return "box";
  const unit = String(rawUnit ?? "").trim().toLowerCase();
  if (unit.includes("sqft") || unit === "sf" || unit === "ft2" || unit === "sqm") return "sqft";
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc") return "piece";
  return unit || "piece";
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) {
      return deny();
    }

    const { id: productId } = await params;
    if (!productId) {
      return NextResponse.json({ error: "Missing product ID." }, { status: 400 });
    }

    const body = await request.json();
    const variantId = String(body?.variantId ?? "").trim();
    const adjustmentQty = Number(body?.adjustmentQty);
    const adjustmentNote = String(body?.note ?? "").trim() || "Manual adjustment";

    if (!Number.isFinite(adjustmentQty) || adjustmentQty === 0) {
      return NextResponse.json({ error: "Adjustment qty must be a non-zero number." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      select: {
        id: true,
        sku: true,
        boxSqft: true,
        product: {
          select: {
            unit: true,
          },
        },
        inventoryStock: {
          select: {
            onHand: true,
            reserved: true,
          },
        },
      },
    });

    const selectedVariant =
      variants.find((item) => item.id === variantId) ?? (variants.length === 1 ? variants[0] : null);

    if (!selectedVariant) {
      return NextResponse.json(
        { error: "Please select a variant for stock adjustment." },
        { status: 400 },
      );
    }

    const currentOnHand = Number(selectedVariant.inventoryStock?.onHand ?? 0);
    const currentReserved = Number(selectedVariant.inventoryStock?.reserved ?? 0);
    const nextOnHand = currentOnHand + adjustmentQty;

    if (nextOnHand < 0) {
      return NextResponse.json({ error: "Stock cannot go below 0." }, { status: 400 });
    }
    if (nextOnHand < currentReserved) {
      return NextResponse.json(
        { error: "Stock cannot be less than reserved quantity." },
        { status: 400 },
      );
    }

    const movementUnit = normalizeMovementUnit(
      selectedVariant.product?.unit ?? null,
      Number(selectedVariant.boxSqft ?? 0) > 0,
    );

    const stock = await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryStock.findUnique({
        where: { variantId: selectedVariant.id },
        select: {
          onHand: true,
          reserved: true,
        },
      });

      const txCurrentOnHand = Number(existing?.onHand ?? 0);
      const txCurrentReserved = Number(existing?.reserved ?? currentReserved);
      const txNextOnHand = txCurrentOnHand + adjustmentQty;
      if (txNextOnHand < 0) {
        throw new Error("STOCK_BELOW_ZERO");
      }
      if (txNextOnHand < txCurrentReserved) {
        throw new Error("STOCK_BELOW_RESERVED");
      }

      const updated = await tx.inventoryStock.upsert({
        where: { variantId: selectedVariant.id },
        update: { onHand: txNextOnHand },
        create: {
          variantId: selectedVariant.id,
          onHand: txNextOnHand,
          reserved: txCurrentReserved,
        },
        select: {
          variantId: true,
          onHand: true,
          reserved: true,
        },
      });

      const delta = txNextOnHand - txCurrentOnHand;
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            variantId: selectedVariant.id,
            type: "ADJUST",
            qty: delta,
            unit: movementUnit,
            note: adjustmentNote,
          },
        });
      }

      return updated;
    });

    return NextResponse.json(
      {
        data: {
          productId: product.id,
          variantId: stock.variantId,
          onHand: Number(stock.onHand),
          reserved: Number(stock.reserved),
          available: Number(stock.onHand) - Number(stock.reserved),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "STOCK_BELOW_ZERO") {
      return NextResponse.json({ error: "Stock cannot go below 0." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "STOCK_BELOW_RESERVED") {
      return NextResponse.json(
        { error: "Stock cannot be less than reserved quantity." },
        { status: 400 },
      );
    }
    console.error("POST /api/products/[id]/inventory error:", error);
    return NextResponse.json({ error: "Failed to adjust stock." }, { status: 500 });
  }
}
