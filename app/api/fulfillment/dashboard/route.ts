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

function dateRangeFromParam(dateParam: string | null) {
  if (!dateParam) return { start: startOfTodayUtc(), end: endOfTodayUtc() };
  const parsed = new Date(`${dateParam}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return { start: startOfTodayUtc(), end: endOfTodayUtc() };
  return { start: parsed, end: new Date(parsed.getTime() + 24 * 60 * 60 * 1000) };
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

    const now = new Date();
    const { start: todayStart, end: todayEnd } = dateRangeFromParam(request.nextUrl.searchParams.get("date"));

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
          OR: [
            { scheduledAt: { gte: todayStart, lt: todayEnd } },
            { scheduledDate: { gte: todayStart, lt: todayEnd } },
          ],
          status: { notIn: ["DELIVERED", "COMPLETED", "CANCELLED"] },
        },
        orderBy: [{ scheduledAt: "asc" }, { scheduledDate: "asc" }],
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
        where: { type: "DELIVERY", status: { in: ["OUT_FOR_DELIVERY", "OUT", "IN_PROGRESS"] } },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: {
          type: "DELIVERY",
          OR: [
            { scheduledAt: { lt: now } },
            { scheduledDate: { lt: now } },
          ],
          status: { notIn: ["DELIVERED", "COMPLETED", "CANCELLED"] },
        },
        orderBy: [{ scheduledAt: "asc" }, { scheduledDate: "asc" }],
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
        where: { status: { in: ["DRAFT", "SCHEDULED", "PACKING", "READY"] } },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: {
          type: "PICKUP",
          OR: [
            { scheduledAt: { gte: todayStart, lt: todayEnd } },
            { scheduledDate: { gte: todayStart, lt: todayEnd } },
          ],
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        orderBy: [{ scheduledAt: "asc" }, { scheduledDate: "asc" }],
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
            startAt: row.scheduledAt ?? row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            address:
              [row.shiptoAddress1, row.shiptoCity, row.shiptoState, row.shiptoZip]
                .filter(Boolean)
                .join(", ") || row.address,
            status: row.status,
            driver: row.driverName ?? null,
            timeWindow: row.timeWindow ?? null,
            notes: row.notes ?? null,
            shiptoNotes: row.shiptoNotes ?? null,
          })),
          todayPickups: todayPickups.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledAt ?? row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            status: row.status,
            timeWindow: row.timeWindow ?? null,
            pickupContact: row.pickupContact ?? null,
            phone: row.shiptoPhone ?? null,
            notes: row.notes ?? null,
          })),
          overdueDeliveries: overdueDeliveries.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledAt ?? row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            address:
              [row.shiptoAddress1, row.shiptoCity, row.shiptoState, row.shiptoZip]
                .filter(Boolean)
                .join(", ") || row.address,
            status: row.status,
            timeWindow: row.timeWindow ?? null,
            notes: row.notes ?? null,
            shiptoNotes: row.shiptoNotes ?? null,
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

