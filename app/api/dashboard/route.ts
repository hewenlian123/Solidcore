import { ProductCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const categoryKeys: ProductCategory[] = ["WINDOW", "FLOOR", "MIRROR", "DOOR"];

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

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
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) {
      return deny();
    }

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const todayStart = startOfTodayUtc();
    const todayEnd = endOfTodayUtc();

    const [orders, lowStockVariantRows, todayDeliveriesRows, todayPickupsRows, outForDelivery, overdueDeliveriesRows, pendingFulfillmentOrderIds, todayRevenueAgg, receivableAgg, unpaidTopOrders, specialOrdersInProgress, delayedSpecialOrders, specialFollowupRows] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: startDate } },
        select: {
          id: true,
          orderNo: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
          status: true,
          customer: { select: { name: true } },
          items: {
            select: {
              quantity: true,
              subtotal: true,
              product: {
                select: { id: true, name: true, sku: true, category: true },
              },
            },
          },
        },
      }),
      prisma.productVariant.findMany({
        select: {
          reorderLevel: true,
          inventoryStock: { select: { onHand: true, reserved: true } },
        },
      }),
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
      prisma.salesOrderFulfillment.count({
        where: {
          type: "DELIVERY",
          status: "IN_PROGRESS",
        },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: {
          type: "DELIVERY",
          scheduledDate: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        orderBy: { scheduledDate: "asc" },
        select: {
          id: true,
          scheduledDate: true,
          status: true,
          address: true,
          salesOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      prisma.salesOrderFulfillment.findMany({
        where: {
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: { salesOrderId: true },
        distinct: ["salesOrderId"],
      }),
      prisma.salesOrderPayment.aggregate({
        where: {
          createdAt: { gte: todayStart, lt: todayEnd },
          status: "POSTED",
        },
        _sum: { amount: true },
      }),
      prisma.salesOrder.aggregate({
        where: { balanceDue: { gt: 0 } },
        _sum: { balanceDue: true },
      }),
      prisma.salesOrder.findMany({
        where: { balanceDue: { gt: 0 } },
        orderBy: { balanceDue: "desc" },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          customer: { select: { name: true } },
          total: true,
          paidAmount: true,
          balanceDue: true,
          status: true,
        },
      }),
      prisma.salesOrderItem.count({
        where: {
          isSpecialOrder: true,
          OR: [{ specialOrderStatus: null }, { specialOrderStatus: { not: "COMPLETED" } }],
        },
      }),
      prisma.salesOrderItem.count({
        where: {
          isSpecialOrder: true,
          OR: [{ specialOrderStatus: null }, { specialOrderStatus: { not: "COMPLETED" } }],
          linkedPo: {
            is: {
              expectedArrival: { lt: todayStart },
              status: { notIn: ["ARRIVED", "COMPLETED"] },
            },
          },
        },
      }),
      prisma.salesOrderItem.findMany({
        where: {
          isSpecialOrder: true,
          specialFollowupDate: { gte: todayStart, lt: todayEnd },
          OR: [{ specialOrderStatus: null }, { specialOrderStatus: { not: "COMPLETED" } }],
        },
        select: {
          id: true,
          specialFollowupDate: true,
          lineDescription: true,
          titleSnapshot: true,
          productTitle: true,
          salesOrder: {
            select: {
              id: true,
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { specialFollowupDate: "asc" },
        take: 20,
      }),
    ]);

    const dailyMap = new Map<string, number>();
    const dailyOrderCountMap = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = formatDate(d);
      dailyMap.set(key, 0);
      dailyOrderCountMap.set(key, 0);
    }

    let totalRevenue = 0;
    let todayOrderCount = 0;
    const categorySales: Record<ProductCategory, number> = {
      WINDOW: 0,
      FLOOR: 0,
      FLOOR_ACCESSORIES: 0,
      MIRROR: 0,
      LED_MIRROR: 0,
      DOOR: 0,
      TILE_EDGE: 0,
      SHAMPOO_NICHE: 0,
      SHOWER_DOOR: 0,
      WAREHOUSE_SUPPLY: 0,
      OTHER: 0,
    };
    const productSalesMap = new Map<string, { id: string; name: string; sku: string; sales: number; revenue: number }>();

    for (const order of orders) {
      const amount = Number(order.totalAmount);
      totalRevenue += amount;
      const key = formatDate(order.createdAt);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + amount);
      dailyOrderCountMap.set(key, (dailyOrderCountMap.get(key) ?? 0) + 1);
      if (order.createdAt >= todayStart && order.createdAt < todayEnd) {
        todayOrderCount += 1;
      }

      for (const item of order.items) {
        const itemAmount = Number(item.subtotal);
        categorySales[item.product.category] += itemAmount;
        const productKey = item.product.id;
        const existing = productSalesMap.get(productKey);
        const salesQty = Number(item.quantity ?? 0);
        if (existing) {
          existing.sales += salesQty;
          existing.revenue += itemAmount;
        } else {
          productSalesMap.set(productKey, {
            id: item.product.id,
            name: item.product.name ?? "Unnamed Product",
            sku: item.product.sku ?? "-",
            sales: salesQty,
            revenue: itemAmount,
          });
        }
      }
    }

    const todayRevenue = Number(todayRevenueAgg._sum.amount ?? 0);
    const receivableTotal = Number(receivableAgg._sum.balanceDue ?? 0);
    const lowStockCount = lowStockVariantRows.filter((row) => {
      const onHand = Number(row.inventoryStock?.onHand ?? 0);
      const reserved = Number(row.inventoryStock?.reserved ?? 0);
      const available = onHand - reserved;
      return available <= Number(row.reorderLevel ?? 0);
    }).length;

    const trendData = Array.from(dailyMap.entries()).map(([date, value]) => ({
      date,
      amount: Number(value.toFixed(2)),
      orders: dailyOrderCountMap.get(date) ?? 0,
    }));

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        sales: Number(row.sales.toFixed(0)),
        revenue: Number(row.revenue.toFixed(2)),
        trend: "+0.0%",
      }));

    const recentOrders = orders
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((row) => ({
        id: row.orderNo ?? row.id.slice(0, 8),
        customer: row.customer?.name ?? "-",
        date: row.createdAt.toISOString().slice(0, 10),
        total: Number(row.totalAmount),
        status: row.status === "SETTLED" ? "Paid" : row.status === "READY_DELIVERY" ? "Shipped" : "Pending",
        payment: Number(row.paidAmount) > 0 ? "Credit Card" : "Bank Transfer",
      }));

    const pieTotal = categoryKeys.reduce((sum, key) => sum + categorySales[key], 0);
    const pieData = categoryKeys.map((key) => ({
      category: key,
      amount: Number(categorySales[key].toFixed(2)),
      percent:
        pieTotal > 0
          ? Number(((categorySales[key] / pieTotal) * 100).toFixed(1))
          : 0,
    }));

    return NextResponse.json(
      {
        data: {
          metrics: {
            totalRevenue: Number(totalRevenue.toFixed(2)),
            unpaidBalance: Number(receivableTotal.toFixed(2)),
            pendingOrders: pendingFulfillmentOrderIds.length,
            lowStockCount,
            revenueTrendPercent: 12.8,
            afterSalesCost: 0,
            todayDeliveries: todayDeliveriesRows.length,
            todayPickups: todayPickupsRows.length,
            outForDelivery,
            overdueOrders: overdueDeliveriesRows.length,
            pendingFulfillment: pendingFulfillmentOrderIds.length,
            todayRevenue: Number(todayRevenue.toFixed(2)),
            totalReceivable: Number(receivableTotal.toFixed(2)),
            specialOrdersInProgress,
            delayedSpecialOrders,
            todayOrderCount,
          },
          trendData,
          pieData,
          topProducts,
          recentOrders,
          followUpReminders: specialFollowupRows.map((row) => ({
            id: row.id,
            followupDate: row.specialFollowupDate,
            orderId: row.salesOrder.id,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer.name,
            product: row.titleSnapshot ?? row.productTitle ?? row.lineDescription,
          })),
          todayDeliveries: todayDeliveriesRows.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            address: row.address,
            status: row.status,
            driver: null,
          })),
          todayPickups: todayPickupsRows.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrderId,
            startAt: row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            status: row.status,
          })),
          overdueDeliveries: overdueDeliveriesRows.map((row) => ({
            id: row.id,
            salesOrderId: row.salesOrder.id,
            startAt: row.scheduledDate,
            orderNumber: row.salesOrder.orderNumber,
            customer: row.salesOrder.customer?.name ?? "-",
            address: row.address,
            status: row.status,
          })),
          topUnpaidOrders: unpaidTopOrders.map((row) => ({
            id: row.id,
            orderNumber: row.orderNumber,
            customer: row.customer.name,
            total: Number(row.total),
            paid: Number(row.paidAmount),
            balanceDue: Number(row.balanceDue),
            status: row.status,
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data." }, { status: 500 });
  }
}
