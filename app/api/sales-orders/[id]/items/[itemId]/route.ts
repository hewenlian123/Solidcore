import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderDescription } from "@/lib/description/renderDescription";
import { ensureDescriptionTemplateSeeds } from "@/lib/description/templates";
import {
  computeLineTotal,
  recalculateSalesOrder,
  syncInventoryReservationForSalesOrder,
  syncSalesOutboundQueue,
} from "@/lib/sales-orders";
import {
  assertSufficientVariantInventory,
  InsufficientInventoryError,
} from "@/lib/inventory-safety";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { formatLineItemTitle } from "@/lib/display";
import { getEffectiveSpecs, getInternalSpecLine } from "@/lib/specs/glass";

type Params = {
  params: Promise<{ id: string; itemId: string }>;
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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id, itemId } = await params;
    const payload = await request.json();
    await ensureDescriptionTemplateSeeds();

    await prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrderItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.salesOrderId !== id) {
        throw new Error("ITEM_NOT_FOUND");
      }
      const quantity = payload.quantity !== undefined ? toNumber(payload.quantity, Number(existing.quantity)) : Number(existing.quantity);
      const unitPrice = payload.unitPrice !== undefined ? toNumber(payload.unitPrice, Number(existing.unitPrice)) : Number(existing.unitPrice);
      const lineDiscount =
        payload.lineDiscount !== undefined
          ? toNumber(payload.lineDiscount, Number(existing.lineDiscount))
          : Number(existing.lineDiscount);
      const fulfillQty =
        payload.fulfillQty !== undefined
          ? toNumber(payload.fulfillQty, Number(existing.fulfillQty))
          : Number(existing.fulfillQty);

      const nextProductId =
        payload.productId !== undefined
          ? payload.productId
            ? String(payload.productId)
            : null
          : existing.productId;
      const nextVariantId =
        payload.variantId !== undefined
          ? payload.variantId
            ? String(payload.variantId)
            : null
          : existing.variantId;
      const variant =
        nextVariantId
          ? await tx.productVariant.findUnique({
              where: { id: nextVariantId },
              include: {
                product: {
                  select: { id: true, name: true, title: true, defaultDescription: true, unit: true },
                },
              },
            })
          : null;
      if (!variant) {
        throw new Error("VARIANT_REQUIRED");
      }
      const productMeta = await tx.product.findUnique({
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
      });
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
      const templateRow = await tx.descriptionTemplate.findUnique({
        where: { category: categoryName },
        select: { templateJson: true },
      });
      const generatedDescription = renderDescription({
        category: categoryName,
        product: productMeta as unknown as Record<string, unknown>,
        variant: {
          ...variant,
          type: variant.variantType,
        } as unknown as Record<string, unknown>,
        templateJson: templateRow?.templateJson ?? null,
      });
      const normalizedDescription =
        productMeta?.category === "WINDOW"
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
          : generatedDescription;
      const fulfillIncrease = Math.max(fulfillQty - Number(existing.fulfillQty), 0);
      if (fulfillIncrease > 0 && nextVariantId) {
        await assertSufficientVariantInventory(tx, {
          variantId: nextVariantId,
          deductionQty: fulfillIncrease,
        });
      }
      const nextLineDescription =
        payload.lineDescription !== undefined
          ? String(payload.lineDescription ?? "")
          : payload.productId !== undefined || payload.variantId !== undefined
            ? normalizedDescription || ""
            : existing.lineDescription;
      const nextDescription =
        payload.description !== undefined
          ? String(payload.description || "") || null
          : payload.lineDescription !== undefined
            ? nextLineDescription || null
            : payload.productId !== undefined || payload.variantId !== undefined
              ? nextLineDescription || null
              : existing.description;
      const lineItemTitle =
        payload.productId !== undefined || payload.variantId !== undefined
          ? formatLineItemTitle({
              productName: variant?.product?.name ?? null,
              variant: {
                width: variant?.width != null ? Number(variant.width) : null,
                height: variant?.height != null ? Number(variant.height) : null,
                color: variant?.color,
                title: variant?.description ?? null,
                sku: variant?.sku ?? null,
                detailText: normalizedDescription || "",
              },
            })
          : undefined;
      await tx.salesOrderItem.update({
        where: { id: itemId },
        data: {
          productId:
            payload.productId !== undefined || payload.variantId !== undefined
              ? variant?.productId ?? nextProductId
              : undefined,
          variantId: nextVariantId,
          productSku:
            payload.productSku !== undefined
              ? payload.productSku
                ? String(payload.productSku)
                : null
              : payload.productId !== undefined || payload.variantId !== undefined
                ? variant?.sku ?? null
                : undefined,
          productTitle:
            payload.productTitle !== undefined
              ? payload.productTitle
                ? String(payload.productTitle)
                : null
              : payload.productId !== undefined || payload.variantId !== undefined
                ? lineItemTitle ?? null
                : undefined,
          skuSnapshot:
            payload.skuSnapshot !== undefined
              ? payload.skuSnapshot
                ? String(payload.skuSnapshot)
                : null
              : payload.productId !== undefined || payload.variantId !== undefined
                ? variant?.sku ?? null
                : undefined,
          titleSnapshot:
            payload.titleSnapshot !== undefined
              ? payload.titleSnapshot
                ? String(payload.titleSnapshot)
                : null
              : payload.productId !== undefined || payload.variantId !== undefined
                ? lineItemTitle ?? null
                : undefined,
          uomSnapshot:
            payload.uomSnapshot !== undefined
              ? payload.uomSnapshot
                ? String(payload.uomSnapshot)
                : null
              : payload.productId !== undefined || payload.variantId !== undefined
                ? variant?.product.unit ?? null
                : undefined,
          costSnapshot:
            payload.costSnapshot !== undefined
              ? toNumber(payload.costSnapshot, Number(existing.costSnapshot ?? 0))
              : payload.productId !== undefined || payload.variantId !== undefined
                ? variant?.cost
                  ? Number(variant.cost)
                  : null
                : undefined,
          discount: lineDiscount,
          notes:
            payload.notes !== undefined
              ? payload.notes
                ? String(payload.notes)
                : null
              : undefined,
          description: nextDescription,
          lineDescription: nextLineDescription,
          quantity,
          unitPrice:
            payload.unitPrice !== undefined
              ? unitPrice
              : payload.productId !== undefined || payload.variantId !== undefined
                ? Number(variant?.price ?? 0)
                : unitPrice,
          lineDiscount,
          fulfillQty,
          lineTotal: computeLineTotal(
            quantity,
            payload.unitPrice !== undefined
              ? unitPrice
              : payload.productId !== undefined || payload.variantId !== undefined
                ? Number(variant?.price ?? 0)
                : unitPrice,
            lineDiscount,
          ),
          isSpecialOrder:
            payload.isSpecialOrder !== undefined
              ? Boolean(payload.isSpecialOrder)
              : undefined,
          specialOrderStatus:
            payload.specialOrderStatus !== undefined
              ? payload.specialOrderStatus
                ? String(payload.specialOrderStatus)
                : null
              : undefined,
          linkedPoId:
            payload.linkedPoId !== undefined
              ? payload.linkedPoId
                ? String(payload.linkedPoId)
                : null
              : undefined,
          specialFollowupDate:
            payload.specialFollowupDate !== undefined
              ? toDateOrNull(payload.specialFollowupDate)
              : undefined,
        },
      });
      if (payload.fulfillQty !== undefined && fulfillQty > Number(existing.fulfillQty)) {
        // TODO: decrement inventory when fulfill_qty increases (if mapped product inventory exists).
      }
      const allItems = await tx.salesOrderItem.findMany({
        where: { salesOrderId: id },
        select: { quantity: true, fulfillQty: true },
      });
      const allFulfilled =
        allItems.length > 0 &&
        allItems.every((item) => Number(item.fulfillQty) >= Number(item.quantity));
      const anyFulfilled = allItems.some((item) => Number(item.fulfillQty) > 0);
      const order = await tx.salesOrder.findUnique({
        where: { id },
        select: { status: true },
      });
      const hasFulfillment = !!(await tx.salesOrderFulfillment.findFirst({
        where: {
          salesOrderId: id,
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
        select: { id: true },
      }));
      if (allFulfilled) {
        await tx.salesOrder.update({ where: { id }, data: { status: "FULFILLED" } });
      } else if (anyFulfilled) {
        await tx.salesOrder.update({
          where: { id },
          data: { status: "PARTIALLY_FULFILLED" },
        });
      } else if (
        order &&
        ["READY", "PARTIALLY_FULFILLED", "FULFILLED"].includes(order.status)
      ) {
        await tx.salesOrder.update({
          where: { id },
          data: { status: hasFulfillment ? "READY" : "CONFIRMED" },
        });
      }
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
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "VARIANT_REQUIRED") {
      return NextResponse.json({ error: "Variant is required." }, { status: 400 });
    }
    if (error instanceof InsufficientInventoryError) {
      return NextResponse.json(
        {
          error: "Insufficient inventory",
          detail: {
            variantId: error.variantId,
            available: error.available,
            requested: error.requested,
          },
        },
        { status: 400 },
      );
    }
    console.error("PATCH /api/sales-orders/[id]/items/[itemId] error:", error);
    return NextResponse.json({ error: "Failed to update item." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id, itemId } = await params;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrderItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.salesOrderId !== id) {
        throw new Error("ITEM_NOT_FOUND");
      }
      await tx.salesOrderItem.delete({ where: { id: itemId } });
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
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    console.error("DELETE /api/sales-orders/[id]/items/[itemId] error:", error);
    return NextResponse.json({ error: "Failed to delete item." }, { status: 500 });
  }
}
