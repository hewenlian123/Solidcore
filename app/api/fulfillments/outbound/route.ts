import { NextRequest, NextResponse } from "next/server";
import type { SalesFulfillmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { CLOSED_WAREHOUSE_STATUSES } from "@/lib/warehouse-queue";

const CLOSED_STATUSES = Array.from(CLOSED_WAREHOUSE_STATUSES) as SalesFulfillmentStatus[];

function decimalString(value: unknown) {
  return String(value ?? "0");
}

function decimalNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const rows = await prisma.salesOrderFulfillment.findMany({
      where: {
        status: { notIn: CLOSED_STATUSES },
      },
      select: {
        id: true,
        type: true,
        status: true,
        scheduledAt: true,
        scheduledDate: true,
        timeWindow: true,
        driverName: true,
        pickupContact: true,
        shiptoPhone: true,
        shiptoNotes: true,
        notes: true,
        shiptoAddress1: true,
        shiptoAddress2: true,
        shiptoCity: true,
        shiptoState: true,
        shiptoZip: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            sku: true,
            unit: true,
            orderedQty: true,
            fulfilledQty: true,
            salesOrderItem: {
              select: {
                isSpecialOrder: true,
                specialOrderStatus: true,
                specialFollowupDate: true,
                linkedPo: {
                  select: {
                    poNumber: true,
                    status: true,
                    expectedArrival: true,
                    supplier: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            specialOrder: true,
            specialOrderStatus: true,
            etaDate: true,
            supplier: { select: { name: true } },
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    });

    const data = rows
      .map((row) => {
        const scheduledAt = row.scheduledAt ?? row.scheduledDate;
        const address =
          row.type === "DELIVERY"
            ? [row.shiptoAddress1, row.shiptoAddress2, row.shiptoCity, row.shiptoState, row.shiptoZip]
                .map((part) => String(part ?? "").trim())
                .filter(Boolean)
                .join(", ")
            : "";

        const itemCount = row.items.length;
        const itemsCompleted = row.items.filter(
          (item) => Number(item.fulfilledQty ?? 0) >= Number(item.orderedQty ?? 0),
        ).length;
        const itemsAnyFulfilled = row.items.some((item) => Number(item.fulfilledQty ?? 0) > 0);
        const itemsAllCompleted = itemCount > 0 && itemsCompleted === itemCount;
        const orderedQty = row.items.reduce((sum, item) => sum + decimalNumber(item.orderedQty), 0);
        const fulfilledQty = row.items.reduce((sum, item) => sum + decimalNumber(item.fulfilledQty), 0);
        const remainingQty = Math.max(orderedQty - fulfilledQty, 0);
        const itemDetails = row.items.map((item) => {
          const itemOrdered = decimalNumber(item.orderedQty);
          const itemFulfilled = decimalNumber(item.fulfilledQty);
          return {
            id: item.id,
            title: item.title,
            sku: item.sku,
            unit: item.unit,
            orderedQty: decimalString(item.orderedQty),
            fulfilledQty: decimalString(item.fulfilledQty),
            remainingQty: String(Math.max(itemOrdered - itemFulfilled, 0)),
            isSpecialOrder: Boolean(item.salesOrderItem?.isSpecialOrder),
            specialOrderStatus: item.salesOrderItem?.specialOrderStatus ?? null,
            specialFollowupDate: item.salesOrderItem?.specialFollowupDate ?? null,
            linkedPoNumber: item.salesOrderItem?.linkedPo?.poNumber ?? null,
            linkedPoStatus: item.salesOrderItem?.linkedPo?.status ?? null,
            linkedPoEta: item.salesOrderItem?.linkedPo?.expectedArrival ?? null,
            supplierName: item.salesOrderItem?.linkedPo?.supplier?.name ?? null,
          };
        });
        const specialOrderLines = itemDetails.filter((item) => item.isSpecialOrder);
        const hasSpecialOrder = Boolean(row.salesOrder.specialOrder || specialOrderLines.length > 0);
        const specialOrderSummary = hasSpecialOrder
          ? {
              status:
                specialOrderLines.find((item) => item.specialOrderStatus)?.specialOrderStatus ??
                row.salesOrder.specialOrderStatus ??
                null,
              supplierName:
                specialOrderLines.find((item) => item.supplierName)?.supplierName ??
                row.salesOrder.supplier?.name ??
                null,
              eta:
                specialOrderLines.find((item) => item.linkedPoEta)?.linkedPoEta ??
                row.salesOrder.etaDate ??
                null,
              lineCount: specialOrderLines.length,
            }
          : null;

        return {
          id: row.id,
          type: row.type,
          status: row.status,
          scheduledAt,
          timeWindow: row.timeWindow ?? null,
          driverName: row.driverName ?? null,
          pickupContact: row.pickupContact ?? null,
          phone: row.shiptoPhone ?? null,
          shiptoNotes: row.shiptoNotes ?? null,
          notes: row.notes ?? null,
          salesOrderId: row.salesOrder.id,
          salesOrderNumber: row.salesOrder.orderNumber,
          customerName: row.salesOrder.customer?.name ?? "-",
          address: address || "-",
          itemCount,
          itemsCompleted,
          itemsAnyFulfilled,
          itemsAllCompleted,
          orderedQty: String(orderedQty),
          fulfilledQty: String(fulfilledQty),
          remainingQty: String(remainingQty),
          items: itemDetails,
          hasSpecialOrder,
          specialOrderSummary,
        };
      })
      .sort((a, b) => {
        if (!a.scheduledAt && !b.scheduledAt) return 0;
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/fulfillments/outbound error:", error);
    return NextResponse.json({ error: "Failed to load outbound fulfillments." }, { status: 500 });
  }
}
