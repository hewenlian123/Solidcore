import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function endOfTodayUtc() {
  const start = startOfTodayUtc();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

    const now = new Date();
    const todayStart = startOfTodayUtc();
    const todayEnd = endOfTodayUtc();

    const [
      todayDeliveries,
      outForDeliveryCount,
      overdueDeliveries,
      pendingFulfillmentCount,
      todayPickups,
    ] = await Promise.all([
      prisma.salesOrderFulfillment.findMany({
        where: {
          type: "DELIVERY",
          scheduledDate: { gte: todayStart, lt: todayEnd },
          status: { not: "CANCELLED" },
        },
        orderBy: { scheduledDate: "asc" },
        include: {
          salesOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.salesOrderFulfillment.count({
        where: { type: "DELIVERY", status: "IN_PROGRESS" },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: {
          type: "DELIVERY",
          scheduledDate: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        orderBy: { scheduledDate: "asc" },
        include: {
          salesOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.salesOrderFulfillment.count({
        where: { status: "SCHEDULED" },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: {
          type: "PICKUP",
          scheduledDate: { gte: todayStart, lt: todayEnd },
          status: { not: "CANCELLED" },
        },
        orderBy: { scheduledDate: "asc" },
        include: {
          salesOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json(
      {
        data: {
          kpis: {
            todayDeliveries: todayDeliveries.length,
            todayPickups: todayPickups.length,
            outForDelivery: outForDeliveryCount,
            overdueDeliveries: overdueDeliveries.length,
            pendingFulfillment: pendingFulfillmentCount,
          },
          todayDeliveries: todayDeliveries.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            address: row.address,
            status: row.status,
            driver: null,
          })),
          todayPickups: todayPickups.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            status: row.status,
          })),
          overdueDeliveries: overdueDeliveries.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            address: row.address,
            status: row.status,
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/fulfillment/dashboard error:", error);
    return NextResponse.json({ error: "Failed to load fulfillment dashboard." }, { status: 500 });
  }
}

