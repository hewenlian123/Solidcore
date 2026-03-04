import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderDescription } from "@/lib/description/renderDescription";
import { ensureDescriptionTemplateSeeds } from "@/lib/description/templates";
import { formatLineItemTitle } from "@/lib/display";
import { getEffectiveSpecs, getInternalSpecLine } from "@/lib/specs/glass";
import { formatFlooringSubtitle } from "@/lib/specs/effective";
import {
  computeLineTotal,
  FlooringAllocationError,
  recalculateSalesOrder,
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { resolveSellingUnit } from "@/lib/selling-unit";

type Params = {
  params: Promise<{ id: string }>;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFlooringShipmentPlan(quantitySqft: number, sqftPerBox: number) {
  if (!Number.isFinite(quantitySqft) || quantitySqft <= 0) return null;
  if (!Number.isFinite(sqftPerBox) || sqftPerBox <= 0) return null;
  const requiredBoxes = Math.ceil(quantitySqft / sqftPerBox);
  const coversSqft = requiredBoxes * sqftPerBox;
  const overageSqft = coversSqft - quantitySqft;
  return { requiredBoxes, coversSqft, overageSqft };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    let quantity = toNumber(payload.quantity, 0);
    const unitPrice = toNumber(payload.unitPrice, 0);
    const lineDiscount = toNumber(payload.lineDiscount, 0);
    const variantId = payload.variantId ? String(payload.variantId) : null;
    if (quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than 0." }, { status: 400 });
    }
    await ensureDescriptionTemplateSeeds();

    await prisma.$transaction(async (tx) => {
      const productId = payload.productId ? String(payload.productId) : null;
      const variant =
        variantId
          ? await tx.productVariant.findUnique({
              where: { id: variantId },
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    title: true,
                    defaultDescription: true,
                    unit: true,
                  },
                },
                inventoryStock: {
                  select: { onHand: true, reserved: true },
                },
              },
            })
          : null;
      if (variantId && !variant) throw new Error("VARIANT_NOT_FOUND");
      const selectedProductUnit =
        variant?.product?.unit ??
        (productId
          ? (
              await tx.salesProduct.findUnique({
                where: { id: productId },
                select: { unit: true },
              })
            )?.unit ??
            null
          : null);
      const productMeta =
        variant?.productId
          ? await tx.product.findUnique({
              where: { id: variant.productId },
              select: {
                category: true,
                material: true,
                color: true,
                sizeW: true,
                sizeH: true,
                glass: true,
                glassTypeDefault: true,
                glassCoatingDefault: true,
                glassThicknessMmDefault: true,
                glassFinishDefault: true,
                screenDefault: true,
                openingTypeDefault: true,
                frameMaterialDefault: true,
                slidingConfigDefault: true,
                flooringMaterial: true,
                flooringWearLayer: true,
                flooringThicknessMm: true,
                flooringPlankLengthIn: true,
                flooringPlankWidthIn: true,
                flooringCoreThicknessMm: true,
                flooringInstallation: true,
                flooringUnderlayment: true,
                flooringUnderlaymentType: true,
                flooringUnderlaymentMm: true,
                flooringBoxCoverageSqft: true,
                type: true,
                style: true,
                rating: true,
                finish: true,
                swing: true,
                handing: true,
                name: true,
                thicknessMm: true,
              },
            })
          : null;
      const categoryName =
        productMeta?.category === "WINDOW"
          ? "Windows"
          : productMeta?.category === "FLOOR"
            ? "Flooring"
            : productMeta?.category === "DOOR"
              ? "Doors"
              : productMeta?.category === "MIRROR"
                ? "Mirrors"
                : String(productMeta?.category ?? "");
      const templateRow =
        categoryName
          ? await tx.descriptionTemplate.findUnique({
              where: { category: categoryName },
              select: { templateJson: true },
            })
          : null;
      const generatedDescription =
        variant && productMeta
          ? productMeta.category === "WINDOW"
            ? getInternalSpecLine(
                getEffectiveSpecs(productMeta, {
                  glassTypeOverride: variant.glassTypeOverride,
                  slidingConfigOverride: variant.slidingConfigOverride,
                  glassCoatingOverride: variant.glassCoatingOverride,
                  glassThicknessMmOverride: variant.glassThicknessMmOverride,
                  glassFinishOverride: variant.glassFinishOverride,
                  screenOverride: variant.screenOverride,
                  openingTypeOverride: variant.openingTypeOverride,
                  glassType: variant.glassType,
                  screenType: variant.screenType,
                  slideDirection: variant.slideDirection,
                }),
              )
            : formatFlooringSubtitle({
                flooringMaterial: productMeta.flooringMaterial,
                flooringWearLayer: productMeta.flooringWearLayer,
                flooringThicknessMm:
                  productMeta.flooringThicknessMm != null ? Number(productMeta.flooringThicknessMm) : null,
                flooringPlankLengthIn:
                  productMeta.flooringPlankLengthIn != null ? Number(productMeta.flooringPlankLengthIn) : null,
                flooringPlankWidthIn:
                  productMeta.flooringPlankWidthIn != null ? Number(productMeta.flooringPlankWidthIn) : null,
                flooringCoreThicknessMm:
                  productMeta.flooringCoreThicknessMm != null
                    ? Number(productMeta.flooringCoreThicknessMm)
                    : null,
                flooringInstallation: productMeta.flooringInstallation,
                flooringUnderlayment: productMeta.flooringUnderlayment,
                flooringUnderlaymentType: productMeta.flooringUnderlaymentType,
                flooringUnderlaymentMm:
                  productMeta.flooringUnderlaymentMm != null
                    ? Number(productMeta.flooringUnderlaymentMm)
                    : null,
                flooringBoxCoverageSqft:
                  productMeta.flooringBoxCoverageSqft != null
                    ? Number(productMeta.flooringBoxCoverageSqft)
                    : null,
              }) ||
              renderDescription({
                category: categoryName,
                product: productMeta as unknown as Record<string, unknown>,
                variant: {
                  ...variant,
                  type: variant.variantType,
                } as unknown as Record<string, unknown>,
                templateJson: templateRow?.templateJson ?? null,
              })
          : "";
      const lineDescription =
        payload.lineDescription !== undefined
          ? String(payload.lineDescription ?? "")
          : generatedDescription || "";
      const description =
        payload.description !== undefined
          ? String(payload.description || "") || null
          : lineDescription || null;
      const lineItemTitle = variant
        ? productMeta?.category === "FLOOR"
          ? String(variant.displayName ?? variant.description ?? variant.product?.name ?? "").trim() || null
          : formatLineItemTitle({
              productName: variant.product?.name ?? null,
              variant: {
                width: variant.width != null ? Number(variant.width) : null,
                height: variant.height != null ? Number(variant.height) : null,
                color: variant.color,
                title: variant.description ?? null,
                sku: variant.sku ?? null,
                detailText: generatedDescription || "",
              },
            })
        : null;
      const isFlooringProduct =
        String(productMeta?.category ?? "").toUpperCase() === "FLOOR" ||
        Number(productMeta?.flooringBoxCoverageSqft ?? 0) > 0;
      const sellingUnit = resolveSellingUnit(isFlooringProduct ? "FLOOR" : null, selectedProductUnit);
      const incomingUnit =
        payload.uomSnapshot !== undefined
          ? String(payload.uomSnapshot ?? "").trim().toUpperCase()
          : "";
      if (incomingUnit && incomingUnit !== sellingUnit) {
        throw new Error(`UNIT_MISMATCH:${sellingUnit}`);
      }
      if (isFlooringProduct) {
        const sqftPerBox = Number(productMeta?.flooringBoxCoverageSqft ?? 0);
        const plan = getFlooringShipmentPlan(quantity * sqftPerBox, sqftPerBox);
        if (plan) {
          const boxesAvailable =
            Number(variant?.inventoryStock?.onHand ?? 0) - Number(variant?.inventoryStock?.reserved ?? 0);
          if (plan.requiredBoxes > boxesAvailable) {
            throw new Error(
              `FLOORING_OVRSELL:${plan.requiredBoxes}:${Math.max(0, Math.floor(boxesAvailable))}`,
            );
          }
        }
      }
      await tx.salesOrderItem.create({
        data: {
          salesOrderId: id,
          productId: variant?.productId ?? productId,
          variantId: variant?.id ?? variantId,
          productSku: payload.productSku ? String(payload.productSku) : variant?.sku ?? null,
          productTitle:
            variant
              ? lineItemTitle ?? null
              : payload.productTitle
                ? String(payload.productTitle)
                : null,
          skuSnapshot:
            payload.skuSnapshot !== undefined
              ? payload.skuSnapshot
                ? String(payload.skuSnapshot)
                : null
              : payload.productSku
                ? String(payload.productSku)
                : variant?.sku ?? null,
          titleSnapshot:
            payload.titleSnapshot !== undefined
              ? payload.titleSnapshot
                ? String(payload.titleSnapshot)
                : null
              : payload.productTitle
                ? String(payload.productTitle)
                : variant
                  ? lineItemTitle ?? null
                  : null,
          uomSnapshot:
            sellingUnit,
          costSnapshot:
            payload.costSnapshot !== undefined
              ? toNumber(payload.costSnapshot, Number(variant?.cost ?? 0))
              : variant?.cost
                ? Number(variant.cost)
                : null,
          discount: lineDiscount,
          notes: payload.notes ? String(payload.notes) : null,
          description,
          lineDescription,
          quantity,
          unitPrice: unitPrice > 0 ? unitPrice : Number(variant?.price ?? 0),
          lineDiscount,
          lineTotal: computeLineTotal(
            quantity,
            unitPrice > 0 ? unitPrice : Number(variant?.price ?? 0),
            lineDiscount,
          ),
          isSpecialOrder: Boolean(payload.isSpecialOrder ?? false),
          specialOrderStatus: payload.specialOrderStatus
            ? String(payload.specialOrderStatus)
            : null,
          linkedPoId: payload.linkedPoId ? String(payload.linkedPoId) : null,
          specialFollowupDate: toDateOrNull(payload.specialFollowupDate),
        },
      });
      await recalculateSalesOrder(tx, id);
      await syncSalesOutboundQueue(tx, id);
      await syncInventoryReservationForSalesOrder(tx, id);
    });

    const data = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: true }, orderBy: { createdAt: "asc" } },
        payments: { orderBy: { receivedAt: "desc" } },
        customer: true,
        fulfillments: { orderBy: { scheduledDate: "desc" } },
        outboundQueue: true,
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "VARIANT_NOT_FOUND") {
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("FLOORING_OVRSELL:")) {
      const [, need, available] = error.message.split(":");
      return NextResponse.json(
        { error: `Insufficient stock: need ${need} boxes, available ${available} boxes.` },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.startsWith("UNIT_MISMATCH:")) {
      const expected = error.message.split(":")[1] ?? "PIECE";
      return NextResponse.json(
        { error: `Unit mismatch. Expected ${expected} for this product.` },
        { status: 400 },
      );
    }
    if (error instanceof FlooringAllocationError) {
      return NextResponse.json(
        {
          error: `Insufficient stock for ${error.variantName}: need ${error.requiredBoxes} boxes, available ${error.availableBoxes} boxes.`,
        },
        { status: 400 },
      );
    }
    console.error("POST /api/sales-orders/[id]/items error:", error);
    return NextResponse.json({ error: "Failed to add item." }, { status: 500 });
  }
}
