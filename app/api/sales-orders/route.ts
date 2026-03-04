import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeLineTotal,
  generateNextSalesOrderNumber,
  recalculateSalesOrder,
} from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { resolveSellingUnit } from "@/lib/selling-unit";
import { getDefaultTaxRate } from "@/lib/settings";

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
const FULFILLMENT_METHODS = ["PICKUP", "DELIVERY"] as const;

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
    const requestedCustomerId = String(payload.customerId ?? "").trim();

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.some((item: any) => !item?.variantId)) {
      return NextResponse.json({ error: "Each item must select a variant." }, { status: 400 });
    }
    const discount = toNumber(payload.discount, 0);
    const requestedTaxAmount = toNumber(payload.tax, 0);
    const requestedTaxRateRaw =
      payload?.taxRate === null || payload?.taxRate === undefined || payload?.taxRate === ""
        ? null
        : Number(payload.taxRate);
    if (requestedTaxRateRaw !== null && (!Number.isFinite(requestedTaxRateRaw) || requestedTaxRateRaw < 0)) {
      return NextResponse.json({ error: "Tax rate must be a non-negative number." }, { status: 400 });
    }
    const docType =
      String(payload.docType ?? "SALES_ORDER").toUpperCase() === "QUOTE"
        ? "QUOTE"
        : "SALES_ORDER";
    const fulfillmentMethodRaw = String(payload.fulfillmentMethod ?? "PICKUP").toUpperCase();
    const fulfillmentMethod = FULFILLMENT_METHODS.includes(
      fulfillmentMethodRaw as (typeof FULFILLMENT_METHODS)[number],
    )
      ? (fulfillmentMethodRaw as "PICKUP" | "DELIVERY")
      : "PICKUP";
    const deliveryAddress1 = String(payload.deliveryAddress1 ?? "").trim();
    const deliveryCity = String(payload.deliveryCity ?? "").trim();
    const deliveryState = String(payload.deliveryState ?? "").trim();
    const deliveryZip = String(payload.deliveryZip ?? "").trim();
    if (fulfillmentMethod === "DELIVERY" && !deliveryAddress1) {
      return NextResponse.json(
        { error: "Delivery address is required when delivery is selected." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      let customerId = requestedCustomerId;
      let customerTaxExempt = false;
      let customerTaxRate: number | null = null;
      if (!customerId) {
        const existingFallback = await tx.salesCustomer.findFirst({
          where: { name: "Walk-in Customer" },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
        if (existingFallback) {
          customerId = existingFallback.id;
        } else {
          const createdFallback = await tx.salesCustomer.create({
            data: {
              name: "Walk-in Customer",
              phone: null,
              email: null,
              address: null,
              notes: "Auto-created default customer for quick draft creation.",
            },
            select: { id: true },
          });
          customerId = createdFallback.id;
        }
      }
      if (customerId) {
        const customer = await tx.salesCustomer.findUnique({
          where: { id: customerId },
          select: { taxExempt: true, taxRate: true },
        });
        customerTaxExempt = Boolean(customer?.taxExempt ?? false);
        customerTaxRate = customer?.taxRate != null ? Number(customer.taxRate) : null;
      }
      const defaultTaxRate = await getDefaultTaxRate(tx);
      const resolvedTaxRate = customerTaxExempt
        ? 0
        : requestedTaxRateRaw ?? customerTaxRate ?? defaultTaxRate;
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
          taxRate: resolvedTaxRate,
          tax: 0,
          commissionRate: toNumber(payload.commissionRate, 0),
          fulfillmentMethod,
          deliveryAddress1: fulfillmentMethod === "DELIVERY" ? deliveryAddress1 : null,
          deliveryCity: fulfillmentMethod === "DELIVERY" ? deliveryCity || null : null,
          deliveryState: fulfillmentMethod === "DELIVERY" ? deliveryState || null : null,
          deliveryZip: fulfillmentMethod === "DELIVERY" ? deliveryZip || null : null,
          salespersonName: payload.salespersonName ? String(payload.salespersonName) : null,
          notes: payload.notes ? String(payload.notes) : null,
        },
      });

      if (items.length > 0) {
        const variantIds: string[] = Array.from(
          new Set(
            items
              .map((item: any) => String(item?.variantId ?? "").trim())
              .filter((value: string): value is string => Boolean(value)),
          ),
        ) as string[];
        const variants =
          variantIds.length > 0
            ? await tx.productVariant.findMany({
                where: { id: { in: variantIds } },
                select: {
                  id: true,
                  product: {
                    select: {
                      unit: true,
                      flooringBoxCoverageSqft: true,
                    },
                  },
                },
              })
            : [];
        const variantById = new Map(variants.map((row) => [row.id, row]));
        await tx.salesOrderItem.createMany({
          data: items.map((item: any) => {
            const quantity = toNumber(item.quantity, 0);
            const unitPrice = toNumber(item.unitPrice, 0);
            const lineDiscount = toNumber(item.lineDiscount, 0);
            const variantId = String(item.variantId);
            const variant = variantById.get(variantId);
            if (!variant) {
              throw new Error("VARIANT_NOT_FOUND");
            }
            const derivedCategory =
              Number(variant.product.flooringBoxCoverageSqft ?? 0) > 0 ? "FLOOR" : null;
            const expectedUnit = resolveSellingUnit(derivedCategory, variant.product.unit);
            const incomingUnit = String(item.uomSnapshot ?? "").trim().toUpperCase();
            if (incomingUnit && incomingUnit !== expectedUnit) {
              throw new Error(`UNIT_MISMATCH:${expectedUnit}`);
            }
            return {
              salesOrderId: order.id,
              productId: item.productId ? String(item.productId) : null,
              variantId,
              productSku: item.productSku ? String(item.productSku) : null,
              productTitle: item.productTitle ? String(item.productTitle) : null,
              skuSnapshot: item.skuSnapshot ? String(item.skuSnapshot) : item.productSku ? String(item.productSku) : null,
              titleSnapshot: item.titleSnapshot ? String(item.titleSnapshot) : item.productTitle ? String(item.productTitle) : null,
              uomSnapshot: expectedUnit,
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

      let updated = await recalculateSalesOrder(tx, order.id);
      const appliedTax =
        requestedTaxRateRaw !== null || customerTaxRate !== null || !customerTaxExempt
          ? (Number(updated.subtotal ?? 0) - Number(discount || 0)) * (resolvedTaxRate / 100)
          : requestedTaxAmount;
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { taxRate: resolvedTaxRate, tax: Math.max(0, appliedTax) },
      });
      updated = await recalculateSalesOrder(tx, order.id);
      return updated;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "VARIANT_NOT_FOUND") {
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("UNIT_MISMATCH:")) {
      const expected = error.message.split(":")[1] ?? "PIECE";
      return NextResponse.json(
        { error: `Unit mismatch. Expected ${expected} for this product.` },
        { status: 400 },
      );
    }
    console.error("POST /api/sales-orders error:", error);
    return NextResponse.json({ error: "Failed to create sales order." }, { status: 500 });
  }
}
