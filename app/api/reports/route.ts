import { NextRequest, NextResponse } from "next/server";
import { SalesOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDateRange(searchParams: URLSearchParams) {
  const preset = String(searchParams.get("preset") ?? "this_month").toLowerCase();
  const now = new Date();
  const today = startOfDay(now);
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() + mondayOffset);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));

  let start = thisMonthStart;
  let end = thisMonthEnd;

  if (preset === "today") {
    start = today;
    end = endOfDay(today);
  } else if (preset === "this_week") {
    start = thisWeekStart;
    end = endOfDay(today);
  } else if (preset === "last_month") {
    start = lastMonthStart;
    end = lastMonthEnd;
  }

  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");
  if (startRaw) start = startOfDay(new Date(startRaw));
  if (endRaw) end = endOfDay(new Date(endRaw));

  return { start, end, preset };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const { start, end, preset } = parseDateRange(searchParams);
    const salesperson = String(searchParams.get("salesperson") ?? "").trim();
    const statusInput = String(searchParams.get("status") ?? "").trim().toUpperCase();
    const status = Object.values(SalesOrderStatus).includes(statusInput as SalesOrderStatus)
      ? (statusInput as SalesOrderStatus)
      : null;

    const baseOrderWhere: any = {
      docType: "SALES_ORDER",
      createdAt: { gte: start, lte: end },
      ...(salesperson ? { salespersonName: salesperson } : {}),
      ...(status ? { status } : {}),
    };

    const nonCancelledOrderWhere: any = {
      ...baseOrderWhere,
      status: status || { not: "CANCELLED" },
    };

    const [salesOrders, postedPayments, voidedPayments, arOrders, outboundRows, openFulfillments, watchSpecialOrders, topOutstanding, recentPayments, salespeopleRows] =
      await Promise.all([
        prisma.salesOrder.findMany({
          where: nonCancelledOrderWhere,
          select: { id: true, total: true, createdAt: true },
        }),
        prisma.salesOrderPayment.findMany({
          where: {
            status: "POSTED",
            receivedAt: { gte: start, lte: end },
            salesOrder: {
              docType: "SALES_ORDER",
              ...(salesperson ? { salespersonName: salesperson } : {}),
              ...(status ? { status } : {}),
            },
          },
          select: { amount: true, receivedAt: true },
        }),
        prisma.salesOrderPayment.findMany({
          where: {
            status: "VOIDED",
            receivedAt: { gte: start, lte: end },
            salesOrder: {
              docType: "SALES_ORDER",
              ...(salesperson ? { salespersonName: salesperson } : {}),
              ...(status ? { status } : {}),
            },
          },
          select: { amount: true },
        }),
        prisma.salesOrder.findMany({
          where: {
            docType: "SALES_ORDER",
            status: status || { not: "CANCELLED" },
            balanceDue: { gt: 0 },
            ...(salesperson ? { salespersonName: salesperson } : {}),
          },
          select: {
            id: true,
            orderNumber: true,
            total: true,
            paidAmount: true,
            balanceDue: true,
            status: true,
            createdAt: true,
            customer: { select: { name: true } },
          },
        }),
        prisma.salesOutboundQueue.findMany({
          include: {
            salesOrder: {
              select: {
                id: true,
                orderNumber: true,
                customer: { select: { name: true } },
              },
            },
          },
          orderBy: [{ scheduledDate: "asc" }],
          take: 30,
        }),
        prisma.salesOrderFulfillment.findMany({
          where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
          select: { salesOrderId: true },
        }),
        prisma.salesOrder.findMany({
          where: {
            specialOrder: true,
            ...(salesperson ? { salespersonName: salesperson } : {}),
            ...(status ? { status } : {}),
          },
          select: {
            id: true,
            orderNumber: true,
            projectName: true,
            etaDate: true,
            specialOrderStatus: true,
            supplierNotes: true,
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
          orderBy: [{ etaDate: "asc" }, { createdAt: "desc" }],
          take: 100,
        }),
        prisma.salesOrder.findMany({
          where: {
            docType: "SALES_ORDER",
            status: status || { not: "CANCELLED" },
            balanceDue: { gt: 0 },
            ...(salesperson ? { salespersonName: salesperson } : {}),
          },
          select: {
            id: true,
            orderNumber: true,
            total: true,
            paidAmount: true,
            balanceDue: true,
            status: true,
            createdAt: true,
            customer: { select: { name: true } },
          },
          orderBy: { balanceDue: "desc" },
          take: 20,
        }),
        prisma.salesOrderPayment.findMany({
          where: {
            receivedAt: { gte: start, lte: end },
            salesOrder: {
              docType: "SALES_ORDER",
              ...(salesperson ? { salespersonName: salesperson } : {}),
              ...(status ? { status } : {}),
            },
          },
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            referenceNumber: true,
            receivedAt: true,
            salesOrderId: true,
            salesOrder: {
              select: {
                orderNumber: true,
                customer: { select: { name: true } },
              },
            },
          },
          orderBy: { receivedAt: "desc" },
          take: 30,
        }),
        prisma.salesOrder.findMany({
          where: {
            salespersonName: { not: null },
          },
          select: { salespersonName: true },
          distinct: ["salespersonName"],
          orderBy: { salespersonName: "asc" },
        }),
      ]);

    const totalSales = round2(salesOrders.reduce((sum, row) => sum + Number(row.total), 0));
    const salesOrderCount = salesOrders.length;
    const avgOrderValue = salesOrderCount > 0 ? round2(totalSales / salesOrderCount) : 0;

    const totalCollected = round2(postedPayments.reduce((sum, row) => sum + Number(row.amount), 0));
    const postedPaymentsCount = postedPayments.length;
    const voidedPaymentsCount = voidedPayments.length;
    const voidedPaymentsTotal = round2(voidedPayments.reduce((sum, row) => sum + Number(row.amount), 0));

    const outstandingBalance = round2(arOrders.reduce((sum, row) => sum + Number(row.balanceDue), 0));
    const unpaidOrPartialCount = arOrders.filter(
      (row) => Number(row.balanceDue) > 0,
    ).length;

    const outboundPendingCount = outboundRows.filter((row) => row.status === "SCHEDULED").length;
    const outboundInProgressCount = outboundRows.filter((row) => row.status === "IN_PROGRESS").length;
    const readyOrInProgressOrdersCount = new Set(openFulfillments.map((row) => row.salesOrderId)).size;

    const today = startOfDay(new Date());
    const soon = endOfDay(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));
    const specialOrdersCount = watchSpecialOrders.length;
    const overdueEtaCount = watchSpecialOrders.filter((row) => {
      if (!row.etaDate) return false;
      const s = (row.specialOrderStatus ?? "").toUpperCase();
      if (s === "ARRIVED" || s === "DELIVERED") return false;
      return row.etaDate < today;
    }).length;
    const arrivingSoonCount = watchSpecialOrders.filter((row) => {
      if (!row.etaDate) return false;
      return row.etaDate >= today && row.etaDate <= soon;
    }).length;

    const dailyCollectedMap = new Map<string, number>();
    const dailySalesMap = new Map<string, number>();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toYmd(d);
      dailyCollectedMap.set(key, 0);
      dailySalesMap.set(key, 0);
    }
    for (const row of postedPayments) {
      const key = toYmd(row.receivedAt);
      dailyCollectedMap.set(key, round2((dailyCollectedMap.get(key) ?? 0) + Number(row.amount)));
    }
    for (const row of salesOrders) {
      const key = toYmd(row.createdAt);
      dailySalesMap.set(key, round2((dailySalesMap.get(key) ?? 0) + Number(row.total)));
    }

    const dailyCollected = Array.from(dailyCollectedMap.entries()).map(([date, amount]) => ({
      date,
      amount: round2(amount),
    }));
    const dailySales = Array.from(dailySalesMap.entries()).map(([date, amount]) => ({
      date,
      amount: round2(amount),
    }));
    const groupSummary: Array<{
      groupId: string | null;
      groupName: string;
      productCount: number;
      totalStock: number;
      stockValue: number;
    }> = [];

    return NextResponse.json(
      {
        data: {
          filters: {
            preset,
            start: toYmd(start),
            end: toYmd(end),
            salesperson: salesperson || null,
            status: status || null,
            salespeople: salespeopleRows
              .map((row) => row.salespersonName)
              .filter((x): x is string => Boolean(x?.trim())),
          },
          kpis: {
            sales: {
              totalSales,
              salesOrderCount,
              avgOrderValue,
            },
            cashCollected: {
              totalCollected,
              postedPaymentsCount,
              voidedPaymentsCount,
              voidedPaymentsTotal,
            },
            ar: {
              outstandingBalance,
              unpaidOrPartialCount,
            },
            operational: {
              outboundPendingCount,
              outboundInProgressCount,
              readyOrInProgressOrdersCount,
            },
            specialOrders: {
              specialOrdersCount,
              overdueEtaCount,
              arrivingSoonCount,
            },
          },
          charts: {
            dailyCollected,
            dailySales,
          },
          tables: {
            topOutstanding,
            recentPayments,
            outboundSnapshot: outboundRows,
            specialOrdersWatchlist: watchSpecialOrders,
            groupSummary,
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "Failed to fetch reports data." }, { status: 500 });
  }
}
