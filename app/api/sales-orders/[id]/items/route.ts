import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderDescription } from "@/lib/description/renderDescription";
import { ensureDescriptionTemplateSeeds } from "@/lib/description/templates";
import { formatLineItemTitle } from "@/lib/display";
import { getEffectiveSpecs, getInternalSpecLine } from "@/lib/specs/glass";
import {
  computeLineTotal,
  recalculateSalesOrder,
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

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

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const quantity = toNumber(payload.quantity, 0);
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
              },
            })
          : null;
      if (variantId && !variant) throw new Error("VARIANT_NOT_FOUND");
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
                glassFinishDefault: true,
                screenDefault: true,
                openingTypeDefault: true,
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
                  glassFinishOverride: variant.glassFinishOverride,
                  screenOverride: variant.screenOverride,
                  openingTypeOverride: variant.openingTypeOverride,
                  glassType: variant.glassType,
                  screenType: variant.screenType,
                  slideDirection: variant.slideDirection,
                }),
              )
            : renderDescription({
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
        ? formatLineItemTitle({
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
            payload.uomSnapshot !== undefined
              ? payload.uomSnapshot
                ? String(payload.uomSnapshot)
                : null
              : variant?.product.unit ?? null,
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
    console.error("POST /api/sales-orders/[id]/items error:", error);
    return NextResponse.json({ error: "Failed to add item." }, { status: 500 });
  }
}
