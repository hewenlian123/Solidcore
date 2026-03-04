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

function toWeekKey(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return toYmd(d);
}

function toMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

function inferCategory(input: { productName?: string | null; title?: string | null; sku?: string | null; isFlooring?: boolean }) {
  if (input.isFlooring) return "Flooring";
  const text = `${input.productName ?? ""} ${input.title ?? ""} ${input.sku ?? ""}`.toLowerCase();
  if (text.includes("floor")) return "Flooring";
  if (text.includes("window")) return "Windows";
  if (text.includes("mirror")) return "Mirrors";
  if (text.includes("accessor")) return "Accessories";
  if (text.includes("door")) return "Doors";
  return "Others";
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

    const [salesOrders, postedPayments, voidedPayments, arOrders, outboundRows, openFulfillments, watchSpecialOrders, topOutstanding, recentPayments, salespeopleRows, salesLineItems, inventoryProducts] =
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
        prisma.salesOrderItem.findMany({
          where: {
            salesOrder: nonCancelledOrderWhere,
          },
          select: {
            id: true,
            quantity: true,
            lineTotal: true,
            costSnapshot: true,
            productSku: true,
            skuSnapshot: true,
            productTitle: true,
            titleSnapshot: true,
            createdAt: true,
            variant: {
              select: {
                id: true,
                sku: true,
                displayName: true,
                cost: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    cost: true,
                    flooringBoxCoverageSqft: true,
                  },
                },
              },
            },
          },
        }),
        prisma.product.findMany({
          select: {
            id: true,
            name: true,
            currentStock: true,
            salePrice: true,
            group: { select: { id: true, name: true } },
          },
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
    const salesByProductMap = new Map<
      string,
      { productId: string | null; sku: string; title: string; category: string; qty: number; revenue: number; cost: number; margin: number }
    >();
    const salesByCategoryMap = new Map<string, { category: string; revenue: number; cost: number; margin: number; qty: number }>();
    for (const line of salesLineItems) {
      const qty = Number(line.quantity ?? 0);
      const revenue = round2(Number(line.lineTotal ?? 0));
      const unitCostRaw =
        Number(line.costSnapshot ?? NaN);
      const unitCost = Number.isFinite(unitCostRaw)
        ? unitCostRaw
        : Number(line.variant?.cost ?? line.variant?.product?.cost ?? 0);
      const cost = round2(unitCost * qty);
      const margin = round2(revenue - cost);
      const sku = String(line.skuSnapshot ?? line.productSku ?? line.variant?.sku ?? "").trim() || "-";
      const title =
        String(line.titleSnapshot ?? line.productTitle ?? line.variant?.displayName ?? line.variant?.product?.name ?? "Item").trim();
      const category = inferCategory({
        productName: line.variant?.product?.name ?? null,
        title,
        sku,
        isFlooring: Number(line.variant?.product?.flooringBoxCoverageSqft ?? 0) > 0,
      });
      const productKey = line.variant?.id ?? `${sku}|${title}`;
      const prevProduct = salesByProductMap.get(productKey) ?? {
        productId: line.variant?.id ?? null,
        sku,
        title,
        category,
        qty: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
      };
      prevProduct.qty = round2(prevProduct.qty + qty);
      prevProduct.revenue = round2(prevProduct.revenue + revenue);
      prevProduct.cost = round2(prevProduct.cost + cost);
      prevProduct.margin = round2(prevProduct.margin + margin);
      salesByProductMap.set(productKey, prevProduct);

      const prevCategory = salesByCategoryMap.get(category) ?? {
        category,
        revenue: 0,
        cost: 0,
        margin: 0,
        qty: 0,
      };
      prevCategory.qty = round2(prevCategory.qty + qty);
      prevCategory.revenue = round2(prevCategory.revenue + revenue);
      prevCategory.cost = round2(prevCategory.cost + cost);
      prevCategory.margin = round2(prevCategory.margin + margin);
      salesByCategoryMap.set(category, prevCategory);
    }

    const salesByProduct = Array.from(salesByProductMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);
    const salesByCategory = Array.from(salesByCategoryMap.values()).sort((a, b) => b.revenue - a.revenue);

    const weeklySalesMap = new Map<string, number>();
    const monthlySalesMap = new Map<string, number>();
    for (const row of salesOrders) {
      const weekKey = toWeekKey(row.createdAt);
      weeklySalesMap.set(weekKey, round2((weeklySalesMap.get(weekKey) ?? 0) + Number(row.total)));
      const monthKey = toMonthKey(row.createdAt);
      monthlySalesMap.set(monthKey, round2((monthlySalesMap.get(monthKey) ?? 0) + Number(row.total)));
    }
    const weeklySales = Array.from(weeklySalesMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({ date, amount }));
    const monthlySales = Array.from(monthlySalesMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({ date, amount }));

    const totalRevenue = round2(salesByProduct.reduce((sum, row) => sum + row.revenue, 0));
    const totalCost = round2(salesByProduct.reduce((sum, row) => sum + row.cost, 0));
    const grossMargin = round2(totalRevenue - totalCost);
    const marginRate = totalRevenue > 0 ? round2((grossMargin / totalRevenue) * 100) : 0;

    const groupSummaryMap = new Map<string, { groupId: string | null; groupName: string; productCount: number; totalStock: number; stockValue: number }>();
    for (const row of inventoryProducts) {
      const key = row.group?.id ?? "ungrouped";
      const prev = groupSummaryMap.get(key) ?? {
        groupId: row.group?.id ?? null,
        groupName: row.group?.name ?? "Ungrouped",
        productCount: 0,
        totalStock: 0,
        stockValue: 0,
      };
      const stock = Number(row.currentStock ?? 0);
      const salePrice = Number(row.salePrice ?? 0);
      prev.productCount += 1;
      prev.totalStock = round2(prev.totalStock + stock);
      prev.stockValue = round2(prev.stockValue + stock * salePrice);
      groupSummaryMap.set(key, prev);
    }

    const groupSummary: Array<{
      groupId: string | null;
      groupName: string;
      productCount: number;
      totalStock: number;
      stockValue: number;
    }> = Array.from(groupSummaryMap.values()).sort((a, b) => b.stockValue - a.stockValue);

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
            salesByDateRange: {
              daily: dailySales,
              weekly: weeklySales,
              monthly: monthlySales,
            },
          },
          tables: {
            topOutstanding,
            recentPayments,
            outboundSnapshot: outboundRows,
            specialOrdersWatchlist: watchSpecialOrders,
            groupSummary,
            salesByProduct,
            salesByCategory,
          },
          summaries: {
            revenueVsCost: {
              revenue: totalRevenue,
              cost: totalCost,
              margin: grossMargin,
              marginRate,
            },
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
