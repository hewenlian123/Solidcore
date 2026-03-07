import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recalculateSalesOrder } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SPECIAL_ORDER_STATUSES = [
  "REQUESTED",
  "ORDERED",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
] as const;
const FULFILLMENT_METHODS = ["PICKUP", "DELIVERY"] as const;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    let data: any = null;
    try {
      data = await prisma.salesOrder.findUnique({
        where: { id },
        include: {
          customer: true,
          supplier: {
            select: { id: true, name: true, contactName: true, phone: true },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  title: true,
                  brand: true,
                  collection: true,
                  availableStock: true,
                  unit: true,
                  price: true,
                  frameMaterialDefault: true,
                  slidingConfigDefault: true,
                  glassTypeDefault: true,
                  glassCoatingDefault: true,
                  glassThicknessMmDefault: true,
                  glassFinishDefault: true,
                  screenDefault: true,
                  openingTypeDefault: true,
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
                },
              },
              variant: {
                select: {
                  id: true,
                  sku: true,
                  displayName: true,
                  width: true,
                  height: true,
                  color: true,
                  glassTypeOverride: true,
                  slidingConfigOverride: true,
                  glassCoatingOverride: true,
                  glassThicknessMmOverride: true,
                  glassFinishOverride: true,
                  screenOverride: true,
                  openingTypeOverride: true,
                },
              },
              linkedPo: {
                select: {
                  id: true,
                  poNumber: true,
                  status: true,
                  orderDate: true,
                  expectedArrival: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          payments: { orderBy: { receivedAt: "desc" } },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    } catch (detailError) {
      console.error("GET /api/sales-orders/[id] full include failed, falling back:", detailError);
      // Additive fallback for legacy/broken relation rows:
      // return snapshot fields so detail page can still open.
      data = await prisma.salesOrder.findUnique({
        where: { id },
        include: {
          customer: true,
          supplier: {
            select: { id: true, name: true, contactName: true, phone: true },
          },
          items: {
            select: {
              id: true,
              salesOrderId: true,
              productId: true,
              variantId: true,
              productSku: true,
              productTitle: true,
              skuSnapshot: true,
              titleSnapshot: true,
              uomSnapshot: true,
              costSnapshot: true,
              discount: true,
              notes: true,
              description: true,
              lineDescription: true,
              quantity: true,
              unitPrice: true,
              lineDiscount: true,
              lineTotal: true,
              fulfillQty: true,
              isSpecialOrder: true,
              specialOrderStatus: true,
              linkedPoId: true,
              specialFollowupDate: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
          payments: { orderBy: { receivedAt: "desc" } },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    }

    if (!data) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales-orders/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales order detail." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    if (
      payload.depositRequired !== undefined &&
      toNumber(payload.depositRequired, 0) < 0
    ) {
      return NextResponse.json(
        { error: "Deposit required must be 0 or greater." },
        { status: 400 },
      );
    }
    if (payload.taxRate !== undefined && payload.taxRate !== null && payload.taxRate !== "") {
      const parsedTaxRate = Number(payload.taxRate);
      if (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0) {
        return NextResponse.json({ error: "Tax rate must be 0 or greater." }, { status: 400 });
      }
    }

    const specialOrderStatus =
      payload.specialOrderStatus !== undefined
        ? String(payload.specialOrderStatus || "").toUpperCase() || null
        : undefined;
    if (
      specialOrderStatus &&
      !SPECIAL_ORDER_STATUSES.includes(
        specialOrderStatus as (typeof SPECIAL_ORDER_STATUSES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Invalid special order status." },
        { status: 400 },
      );
    }
    const fulfillmentMethod =
      payload.fulfillmentMethod !== undefined || payload.deliveryMethod !== undefined
        ? String(payload.fulfillmentMethod ?? payload.deliveryMethod ?? "PICKUP").toUpperCase()
        : undefined;
    if (
      fulfillmentMethod &&
      !FULFILLMENT_METHODS.includes(
        fulfillmentMethod as (typeof FULFILLMENT_METHODS)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Invalid fulfillment method." },
        { status: 400 },
      );
    }
    const deliveryAddress1 =
      payload.deliveryAddress1 !== undefined ? String(payload.deliveryAddress1 || "").trim() : undefined;
    const deliveryCity =
      payload.deliveryCity !== undefined ? String(payload.deliveryCity || "").trim() : undefined;
    const deliveryState =
      payload.deliveryState !== undefined ? String(payload.deliveryState || "").trim() : undefined;
    const deliveryZip =
      payload.deliveryZip !== undefined ? String(payload.deliveryZip || "").trim() : undefined;
    const nextMethod = fulfillmentMethod as "PICKUP" | "DELIVERY" | undefined;
    if (nextMethod === "DELIVERY") {
      if (!deliveryAddress1 || !deliveryCity || !deliveryState || !deliveryZip) {
        return NextResponse.json(
          { error: "Delivery requires address line1/city/state/zip." },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.salesOrder.update({
        where: { id },
        data: {
          customerId: payload.customerId ? String(payload.customerId) : undefined,
          docType:
            payload.docType !== undefined
              ? String(payload.docType).toUpperCase() === "QUOTE"
                ? "QUOTE"
                : "SALES_ORDER"
              : undefined,
          projectName:
            payload.projectName !== undefined ? String(payload.projectName || "") || null : undefined,
          specialOrder:
            payload.specialOrder !== undefined ? Boolean(payload.specialOrder) : undefined,
          supplierId:
            payload.supplierId !== undefined
              ? payload.supplierId
                ? String(payload.supplierId)
                : null
              : undefined,
          etaDate:
            payload.etaDate !== undefined
              ? payload.etaDate
                ? new Date(payload.etaDate)
                : null
              : undefined,
          specialOrderStatus,
          supplierNotes:
            payload.supplierNotes !== undefined
              ? String(payload.supplierNotes || "") || null
              : undefined,
          hidePrices:
            payload.hidePrices !== undefined ? Boolean(payload.hidePrices) : undefined,
          depositRequired:
            payload.depositRequired !== undefined
              ? toNumber(payload.depositRequired, 0)
              : undefined,
          discount: payload.discount !== undefined ? toNumber(payload.discount, 0) : undefined,
          taxRate:
            payload.taxRate !== undefined
              ? payload.taxRate === null || payload.taxRate === ""
                ? null
                : toNumber(payload.taxRate, 0)
              : undefined,
          tax: payload.tax !== undefined ? toNumber(payload.tax, 0) : undefined,
          commissionRate:
            payload.commissionRate !== undefined
              ? toNumber(payload.commissionRate, 0)
              : undefined,
          fulfillmentMethod: fulfillmentMethod as "PICKUP" | "DELIVERY" | undefined,
          deliveryName:
            payload.deliveryName !== undefined
              ? String(payload.deliveryName || "") || null
              : undefined,
          deliveryPhone:
            payload.deliveryPhone !== undefined
              ? String(payload.deliveryPhone || "") || null
              : undefined,
          deliveryAddress1:
            payload.deliveryAddress1 !== undefined
              ? String(payload.deliveryAddress1 || "").trim() || null
              : undefined,
          deliveryAddress2:
            payload.deliveryAddress2 !== undefined
              ? String(payload.deliveryAddress2 || "") || null
              : undefined,
          deliveryCity:
            payload.deliveryCity !== undefined
              ? String(payload.deliveryCity || "").trim() || null
              : undefined,
          deliveryState:
            payload.deliveryState !== undefined
              ? String(payload.deliveryState || "").trim() || null
              : undefined,
          deliveryZip:
            payload.deliveryZip !== undefined
              ? String(payload.deliveryZip || "").trim() || null
              : undefined,
          deliveryNotes:
            payload.deliveryNotes !== undefined
              ? String(payload.deliveryNotes || "") || null
              : undefined,
          pickupNotes:
            payload.pickupNotes !== undefined
              ? String(payload.pickupNotes || "") || null
              : undefined,
          requestedDeliveryAt:
            payload.requestedDeliveryAt !== undefined
              ? payload.requestedDeliveryAt
                ? new Date(payload.requestedDeliveryAt)
                : null
              : undefined,
          orderDate:
            payload.orderDate !== undefined
              ? payload.orderDate
                ? new Date(payload.orderDate)
                : null
              : undefined,
          timeWindow:
            payload.timeWindow !== undefined
              ? (() => {
                  const v = String(payload.timeWindow ?? "").trim();
                  return v.length > 0 ? v : null;
                })()
              : undefined,
          salespersonName:
            payload.salespersonName !== undefined
              ? String(payload.salespersonName || "") || null
              : undefined,
          notes: payload.notes !== undefined ? String(payload.notes || "") || null : undefined,
        },
      });
      if (payload.timeWindow !== undefined) {
        const fulfillment = await tx.salesOrderFulfillment.findFirst({
          where: { salesOrderId: id },
          select: { id: true },
        });
        if (fulfillment) {
          const timeWindowValue = String(payload.timeWindow ?? "").trim();
          await tx.salesOrderFulfillment.update({
            where: { id: fulfillment.id },
            data: { timeWindow: timeWindowValue.length > 0 ? timeWindowValue : null },
          });
        }
      }
      await recalculateSalesOrder(tx, row.id);
      return tx.salesOrder.findUnique({
        where: { id: row.id },
        include: {
          customer: true,
          supplier: {
            select: { id: true, name: true, contactName: true, phone: true },
          },
          items: {
            include: {
              product: true,
              variant: true,
              linkedPo: {
                select: {
                  id: true,
                  poNumber: true,
                  status: true,
                  orderDate: true,
                  expectedArrival: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          payments: { orderBy: { receivedAt: "desc" } },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    });

    const warning =
      updated?.specialOrder && !updated?.supplierId
        ? "Special order is enabled but no supplier is selected."
        : null;
    return NextResponse.json({ data: updated, warning }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/sales-orders/[id] error:", error);
    return NextResponse.json({ error: "Failed to update sales order." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing sales order ID." }, { status: 400 });
    }

    await prisma.salesOrder.delete({ where: { id } });
    return NextResponse.json({ data: { id } }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Cannot delete sales order because related invoices or records exist." },
          { status: 400 },
        );
      }
    }
    console.error("DELETE /api/sales-orders/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete sales order." }, { status: 500 });
  }
}
