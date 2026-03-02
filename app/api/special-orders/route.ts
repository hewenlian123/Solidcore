import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.max(Math.floor(ms / (24 * 60 * 60 * 1000)), 0);
}

function isCompletedStatus(status: string | null | undefined) {
  return String(status ?? "").toUpperCase() === "COMPLETED";
}

function isDelayed(expectedArrival: Date | null | undefined, status: string | null | undefined) {
  if (!expectedArrival) return false;
  const today = startOfTodayUtc();
  const normalized = String(status ?? "").toUpperCase();
  return expectedArrival < today && normalized !== "ARRIVED" && normalized !== "COMPLETED";
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const rows = await prisma.salesOrderItem.findMany({
      where: {
        isSpecialOrder: true,
      },
      orderBy: { createdAt: "desc" },
      include: {
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            etaDate: true,
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        },
        linkedPo: {
          select: {
            id: true,
            poNumber: true,
            orderDate: true,
            expectedArrival: true,
            status: true,
            supplier: { select: { name: true } },
          },
        },
      },
      take: 500,
    });

    const today = new Date();
    const data = rows
      .filter((row) => !isCompletedStatus(row.specialOrderStatus))
      .map((row) => {
        const po = row.linkedPo;
        const orderDate = po?.orderDate ?? row.salesOrder.createdAt;
        const eta = po?.expectedArrival ?? row.salesOrder.etaDate ?? null;
        const supplierName = po?.supplier?.name ?? row.salesOrder.supplier?.name ?? null;
        const status = row.specialOrderStatus ?? po?.status ?? "REQUESTED";
        const delayed = isDelayed(eta, status);
        return {
          id: row.id,
          salesOrderId: row.salesOrder.id,
          salesOrderNumber: row.salesOrder.orderNumber,
          customer: row.salesOrder.customer?.name ?? "-",
          product: row.titleSnapshot ?? row.productTitle ?? row.lineDescription,
          qty: Number(row.quantity),
          supplier: supplierName,
          poId: po?.id ?? null,
          poNumber: po?.poNumber ?? null,
          eta,
          orderDate,
          daysWaiting: daysBetween(orderDate, today),
          status,
          alert: delayed ? "DELAYED" : null,
          delayed,
          specialFollowupDate: row.specialFollowupDate,
        };
      });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/special-orders error:", error);
    return NextResponse.json({ error: "Failed to fetch special orders." }, { status: 500 });
  }
}

