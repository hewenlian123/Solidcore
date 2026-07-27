import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withSalesOrderDepositSummary } from "@/lib/deposit-summary";
import {
  recalculateSalesOrder,
  syncInventoryReservationForSalesOrder,
} from "@/lib/sales-orders";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";

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
          specialOrderInteractions: {
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 20,
          },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    } catch (detailError) {
      console.error(
        "GET /api/sales-orders/[id] full include failed, falling back:",
        detailError,
      );
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
          specialOrderInteractions: {
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 20,
          },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Sales order not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { data: withSalesOrderDepositSummary(data) },
      { status: 200 },
    );
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
    const requestUser = getRequestUser(request);

    const { id } = await params;
    const payload = await request.json();
    if (payload.customerPromiseDate !== undefined) {
      return NextResponse.json(
        {
          error:
            "Customer Promise Date cannot be edited directly. Propose a date, then obtain Owner/Manager confirmation.",
        },
        { status: 400 },
      );
    }
    const parseDateField = (value: unknown) => {
      if (value === null || value === "") return null;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    };
    const supplierEta =
      payload.etaDate !== undefined
        ? parseDateField(payload.etaDate)
        : undefined;
    const proposedPromiseDate =
      payload.proposedCustomerPromiseDate !== undefined
        ? parseDateField(payload.proposedCustomerPromiseDate)
        : undefined;
    const followUpDueAt =
      payload.specialFollowUpDueAt !== undefined
        ? parseDateField(payload.specialFollowUpDueAt)
        : undefined;
    if (
      (payload.etaDate !== undefined && supplierEta === undefined) ||
      (payload.proposedCustomerPromiseDate !== undefined &&
        proposedPromiseDate === undefined) ||
      (payload.specialFollowUpDueAt !== undefined &&
        followUpDueAt === undefined)
    ) {
      return NextResponse.json(
        { error: "One or more Special Order dates are invalid." },
        { status: 400 },
      );
    }
    const promiseDateReason = String(payload.promiseDateReason ?? "").trim();
    const confirmCustomerPromiseDate = Boolean(
      payload.confirmCustomerPromiseDate,
    );
    if (
      (payload.proposedCustomerPromiseDate !== undefined ||
        confirmCustomerPromiseDate) &&
      !promiseDateReason
    ) {
      return NextResponse.json(
        { error: "Promise Date changes require a reason." },
        { status: 400 },
      );
    }
    if (confirmCustomerPromiseDate && role !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Only Owner/Manager may confirm a Customer Promise Date change.",
        },
        { status: 403 },
      );
    }
    const followUpOwner =
      payload.specialFollowUpOwner !== undefined
        ? String(payload.specialFollowUpOwner ?? "").trim()
        : undefined;
    const hasFollowUpOwner = Boolean(followUpOwner);
    const hasFollowUpDueAt = Boolean(followUpDueAt);
    if (
      (payload.specialFollowUpOwner !== undefined ||
        payload.specialFollowUpDueAt !== undefined) &&
      hasFollowUpOwner !== hasFollowUpDueAt
    ) {
      return NextResponse.json(
        {
          error:
            "Special Order Follow-Up owner and due date are both required.",
        },
        { status: 400 },
      );
    }
    if (
      payload.depositRequired !== undefined &&
      toNumber(payload.depositRequired, 0) < 0
    ) {
      return NextResponse.json(
        { error: "Deposit required must be 0 or greater." },
        { status: 400 },
      );
    }
    if (
      payload.taxRate !== undefined &&
      payload.taxRate !== null &&
      payload.taxRate !== ""
    ) {
      const parsedTaxRate = Number(payload.taxRate);
      if (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0) {
        return NextResponse.json(
          { error: "Tax rate must be 0 or greater." },
          { status: 400 },
        );
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
      payload.fulfillmentMethod !== undefined ||
      payload.deliveryMethod !== undefined
        ? String(
            payload.fulfillmentMethod ?? payload.deliveryMethod ?? "PICKUP",
          ).toUpperCase()
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
      payload.deliveryAddress1 !== undefined
        ? String(payload.deliveryAddress1 || "").trim()
        : undefined;
    const deliveryCity =
      payload.deliveryCity !== undefined
        ? String(payload.deliveryCity || "").trim()
        : undefined;
    const deliveryState =
      payload.deliveryState !== undefined
        ? String(payload.deliveryState || "").trim()
        : undefined;
    const deliveryZip =
      payload.deliveryZip !== undefined
        ? String(payload.deliveryZip || "").trim()
        : undefined;
    const nextMethod = fulfillmentMethod as "PICKUP" | "DELIVERY" | undefined;
    if (nextMethod === "DELIVERY") {
      if (
        !deliveryAddress1 ||
        !deliveryCity ||
        !deliveryState ||
        !deliveryZip
      ) {
        return NextResponse.json(
          { error: "Delivery requires address line1/city/state/zip." },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "sales_orders" WHERE id = ${id} FOR UPDATE`,
      );
      const existing = await tx.salesOrder.findUnique({
        where: { id },
        select: {
          id: true,
          proposedCustomerPromiseDate: true,
        },
      });
      if (!existing) throw new Error("SALES_ORDER_NOT_FOUND");
      const confirmedPromiseDate = confirmCustomerPromiseDate
        ? (proposedPromiseDate ?? existing.proposedCustomerPromiseDate)
        : undefined;
      if (confirmCustomerPromiseDate && !confirmedPromiseDate) {
        throw new Error("PROMISE_PROPOSAL_REQUIRED");
      }
      const row = await tx.salesOrder.update({
        where: { id },
        data: {
          customerId: payload.customerId
            ? String(payload.customerId)
            : undefined,
          docType:
            payload.docType !== undefined
              ? String(payload.docType).toUpperCase() === "QUOTE"
                ? "QUOTE"
                : "SALES_ORDER"
              : undefined,
          projectName:
            payload.projectName !== undefined
              ? String(payload.projectName || "") || null
              : undefined,
          specialOrder:
            payload.specialOrder !== undefined
              ? Boolean(payload.specialOrder)
              : undefined,
          supplierId:
            payload.supplierId !== undefined
              ? payload.supplierId
                ? String(payload.supplierId)
                : null
              : undefined,
          etaDate: payload.etaDate !== undefined ? supplierEta : undefined,
          proposedCustomerPromiseDate: confirmCustomerPromiseDate
            ? null
            : payload.proposedCustomerPromiseDate !== undefined
              ? proposedPromiseDate
              : undefined,
          customerPromiseDate: confirmCustomerPromiseDate
            ? confirmedPromiseDate
            : undefined,
          promiseDateApprovalActor: confirmCustomerPromiseDate
            ? `${requestUser?.name || role} (${requestUser?.userId || role})`
            : undefined,
          promiseDateReason:
            payload.proposedCustomerPromiseDate !== undefined ||
            confirmCustomerPromiseDate
              ? promiseDateReason
              : undefined,
          promiseDateUpdatedAt:
            payload.proposedCustomerPromiseDate !== undefined ||
            confirmCustomerPromiseDate
              ? new Date()
              : undefined,
          specialFollowUpOwner:
            payload.specialFollowUpOwner !== undefined
              ? followUpOwner || null
              : undefined,
          specialFollowUpDueAt:
            payload.specialFollowUpDueAt !== undefined
              ? followUpDueAt
              : undefined,
          specialOrderStatus,
          supplierNotes:
            payload.supplierNotes !== undefined
              ? String(payload.supplierNotes || "") || null
              : undefined,
          hidePrices:
            payload.hidePrices !== undefined
              ? Boolean(payload.hidePrices)
              : undefined,
          depositRequired:
            payload.depositRequired !== undefined
              ? toNumber(payload.depositRequired, 0)
              : undefined,
          discount:
            payload.discount !== undefined
              ? toNumber(payload.discount, 0)
              : undefined,
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
          fulfillmentMethod: fulfillmentMethod as
            "PICKUP" | "DELIVERY" | undefined,
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
          notes:
            payload.notes !== undefined
              ? String(payload.notes || "") || null
              : undefined,
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
            data: {
              timeWindow: timeWindowValue.length > 0 ? timeWindowValue : null,
            },
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
          specialOrderInteractions: {
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 20,
          },
          fulfillments: { orderBy: { scheduledDate: "desc" } },
          outboundQueue: true,
        },
      });
    });

    const warning =
      updated?.specialOrder && !updated?.supplierId
        ? "Special order is enabled but no supplier is selected."
        : null;
    return NextResponse.json(
      { data: withSalesOrderDepositSummary(updated), warning },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SALES_ORDER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Sales order not found." },
        { status: 404 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "PROMISE_PROPOSAL_REQUIRED"
    ) {
      return NextResponse.json(
        {
          error:
            "A proposed Customer Promise Date is required before confirmation.",
        },
        { status: 409 },
      );
    }
    console.error("PATCH /api/sales-orders/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update sales order." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing sales order ID." },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrder.findUnique({
        where: { id },
        select: { items: { select: { variantId: true } } },
      });
      if (!existing) throw new Error("SALES_ORDER_NOT_FOUND");
      const affectedVariantIds = existing.items.map((item) => item.variantId);
      await tx.salesOrder.delete({ where: { id } });
      await syncInventoryReservationForSalesOrder(tx, id, {
        affectedVariantIds,
      });
    });
    return NextResponse.json({ data: { id } }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "SALES_ORDER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Sales order not found." },
        { status: 404 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Sales order not found." },
          { status: 404 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "Cannot delete sales order because related invoices or records exist.",
          },
          { status: 400 },
        );
      }
    }
    console.error("DELETE /api/sales-orders/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete sales order." },
      { status: 500 },
    );
  }
}
