import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeLineTotal,
  generateNextSalesOrderNumber,
  recalculateSalesOrder,
} from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SALES_ORDER_STATUS_VALUES = [
  "DRAFT",
  "QUOTED",
  "CONFIRMED",
  "READY",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
] as const;

const SALES_DOC_TYPES = ["QUOTE", "SALES_ORDER"] as const;
const SPECIAL_ORDER_STATUSES = [
  "REQUESTED",
  "ORDERED",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
] as const;

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();
    const statusParam = String(searchParams.get("status") ?? "").trim().toUpperCase();
    const docTypeParam = String(searchParams.get("doc_type") ?? "").trim().toUpperCase();
    const specialOrderParam = String(searchParams.get("special_order") ?? "").trim();
    const specialStatusParam = String(searchParams.get("special_status") ?? "").trim().toUpperCase();
    const status = SALES_ORDER_STATUS_VALUES.includes(statusParam as (typeof SALES_ORDER_STATUS_VALUES)[number])
      ? statusParam
      : null;
    const docType = SALES_DOC_TYPES.includes(docTypeParam as (typeof SALES_DOC_TYPES)[number])
      ? docTypeParam
      : null;
    const specialOrder =
      specialOrderParam === "true"
        ? true
        : specialOrderParam === "false"
          ? false
          : null;
    const specialStatus = SPECIAL_ORDER_STATUSES.includes(
      specialStatusParam as (typeof SPECIAL_ORDER_STATUSES)[number],
    )
      ? specialStatusParam
      : null;

    const where: any = {
      ...(status ? { status } : {}),
      ...(docType ? { docType } : {}),
      ...(specialOrder !== null ? { specialOrder } : {}),
      ...(specialStatus ? { specialOrderStatus: specialStatus } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q } },
              { customer: { name: { contains: q } } },
              { customer: { phone: { contains: q } } },
              { projectName: { contains: q } },
            ],
          }
        : {}),
    };

    const data = await prisma.salesOrder.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
        fulfillments: {
          select: { id: true, type: true },
          orderBy: { scheduledDate: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales-orders error:", error);
    return NextResponse.json({ error: "Failed to fetch sales orders." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const payload = await request.json();
    const customerId = String(payload.customerId ?? "").trim();
    if (!customerId) {
      return NextResponse.json({ error: "Customer is required." }, { status: 400 });
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.some((item: any) => !item?.variantId)) {
      return NextResponse.json({ error: "Each item must select a variant." }, { status: 400 });
    }
    const discount = toNumber(payload.discount, 0);
    const tax = toNumber(payload.tax, 0);
    const docType =
      String(payload.docType ?? "SALES_ORDER").toUpperCase() === "QUOTE"
        ? "QUOTE"
        : "SALES_ORDER";

    const created = await prisma.$transaction(async (tx) => {
      const orderNumber = await generateNextSalesOrderNumber(tx, docType);
      const order = await tx.salesOrder.create({
        data: {
          orderNumber,
          customerId,
          docType,
          projectName: payload.projectName ? String(payload.projectName) : null,
          status: "DRAFT",
          specialOrder: Boolean(payload.specialOrder ?? false),
          supplierId: payload.supplierId ? String(payload.supplierId) : null,
          etaDate: payload.etaDate ? new Date(payload.etaDate) : null,
          specialOrderStatus: payload.specialOrderStatus
            ? String(payload.specialOrderStatus).toUpperCase()
            : null,
          supplierNotes: payload.supplierNotes ? String(payload.supplierNotes) : null,
          hidePrices: Boolean(payload.hidePrices ?? false),
          depositRequired: toNumber(payload.depositRequired, 0),
          discount,
          tax,
          commissionRate: toNumber(payload.commissionRate, 0),
          salespersonName: payload.salespersonName ? String(payload.salespersonName) : null,
          notes: payload.notes ? String(payload.notes) : null,
        },
      });

      if (items.length > 0) {
        await tx.salesOrderItem.createMany({
          data: items.map((item: any) => {
            const quantity = toNumber(item.quantity, 0);
            const unitPrice = toNumber(item.unitPrice, 0);
            const lineDiscount = toNumber(item.lineDiscount, 0);
            return {
              salesOrderId: order.id,
              productId: item.productId ? String(item.productId) : null,
              variantId: String(item.variantId),
              productSku: item.productSku ? String(item.productSku) : null,
              productTitle: item.productTitle ? String(item.productTitle) : null,
              skuSnapshot: item.skuSnapshot ? String(item.skuSnapshot) : item.productSku ? String(item.productSku) : null,
              titleSnapshot: item.titleSnapshot ? String(item.titleSnapshot) : item.productTitle ? String(item.productTitle) : null,
              uomSnapshot: item.uomSnapshot ? String(item.uomSnapshot) : null,
              costSnapshot: item.costSnapshot !== undefined ? toNumber(item.costSnapshot, 0) : null,
              discount: lineDiscount,
              notes: item.notes ? String(item.notes) : null,
              description:
                item.description !== undefined
                  ? String(item.description || "") || null
                  : String(item.lineDescription || "") || null,
              lineDescription: String(item.lineDescription ?? ""),
              quantity,
              unitPrice,
              lineDiscount,
              lineTotal: computeLineTotal(quantity, unitPrice, lineDiscount),
              isSpecialOrder: Boolean(item.isSpecialOrder ?? false),
              specialOrderStatus: item.specialOrderStatus ? String(item.specialOrderStatus) : null,
              linkedPoId: item.linkedPoId ? String(item.linkedPoId) : null,
              specialFollowupDate: item.specialFollowupDate ? new Date(item.specialFollowupDate) : null,
            };
          }),
        });
      }

      const updated = await recalculateSalesOrder(tx, order.id);
      return updated;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales-orders error:", error);
    return NextResponse.json({ error: "Failed to create sales order." }, { status: 500 });
  }
}
