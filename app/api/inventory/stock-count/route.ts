import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function normalizeMovementUnit(rawUnit: string | null | undefined, hasBoxCoverage: boolean) {
  if (hasBoxCoverage) return "box";
  const unit = String(rawUnit ?? "").trim().toLowerCase();
  if (unit.includes("sqft") || unit === "sf" || unit === "ft2" || unit === "sqm") return "sqft";
  if (unit.includes("piece") || unit.includes("pcs") || unit === "pc") return "piece";
  return unit || "piece";
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const body = await request.json();
    const variantId = String(body?.variantId ?? "").trim();
    const actualCount = Number(body?.actualCount);
    const note = String(body?.note ?? "").trim();

    if (!variantId) {
      return NextResponse.json({ error: "variantId is required." }, { status: 400 });
    }
    if (!Number.isFinite(actualCount) || actualCount < 0) {
      return NextResponse.json({ error: "actualCount must be a valid number >= 0." }, { status: 400 });
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        product: { select: { unit: true } },
        boxSqft: true,
        inventoryStock: { select: { onHand: true, reserved: true } },
      },
    });
    if (!variant) {
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }

    const movementUnit = normalizeMovementUnit(
      variant.product?.unit ?? null,
      Number(variant.boxSqft ?? 0) > 0,
    );

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findUnique({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      const currentOnHand = Number(stock?.onHand ?? 0);
      const reserved = Number(stock?.reserved ?? 0);
      if (actualCount < reserved) {
        throw new Error("COUNT_BELOW_RESERVED");
      }

      const delta = actualCount - currentOnHand;
      if (delta === 0) {
        return {
          ok: true,
          delta: 0,
          newOnHand: currentOnHand,
          onHand: currentOnHand,
          reserved,
          available: currentOnHand - reserved,
        };
      }

      const updated = await tx.inventoryStock.upsert({
        where: { variantId },
        update: { onHand: actualCount },
        create: { variantId, onHand: actualCount, reserved },
        select: { onHand: true, reserved: true },
      });

      await tx.inventoryMovement.create({
        data: {
          variantId,
          type: "ADJUST",
          qty: delta,
          unit: movementUnit,
          note: note || `Stock count set to ${actualCount}`,
        },
      });

      return {
        ok: true,
        delta,
        newOnHand: Number(updated.onHand),
        onHand: Number(updated.onHand),
        reserved: Number(updated.reserved),
        available: Number(updated.onHand) - Number(updated.reserved),
      };
    });

    return NextResponse.json({ ...result, data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "COUNT_BELOW_RESERVED") {
      return NextResponse.json(
        { error: "Actual count cannot be less than reserved quantity." },
        { status: 400 },
      );
    }
    console.error("POST /api/inventory/stock-count error:", error);
    return NextResponse.json({ error: "Failed to apply stock count." }, { status: 500 });
  }
}
