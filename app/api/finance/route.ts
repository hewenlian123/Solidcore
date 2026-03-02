import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [monthlyOrders, maintenance, receivables, settledOrders12m] = await Promise.all([
      prisma.order.findMany({
        where: {
          archivedAt: null,
          createdAt: { gte: start, lt: end },
        },
        include: {
          items: { include: { product: { select: { costPrice: true } } } },
        },
      }),
      prisma.maintenanceRecord.findMany({
        where: {
          createdAt: { gte: start, lt: end },
        },
      }),
      prisma.order.findMany({
        where: {
          archivedAt: null,
          totalAmount: { gt: 0 },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          orderNo: true,
          createdAt: true,
          totalAmount: true,
          paidAmount: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.order.findMany({
        where: {
          archivedAt: null,
          completedAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 11, 1),
          },
        },
        include: {
          items: { include: { product: { select: { costPrice: true } } } },
        },
      }),
    ]);

    const monthlySales = monthlyOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const monthlyProcurementCost = monthlyOrders.reduce((sum, o) => {
      const lineCost = o.items.reduce(
        (lineSum, item) => lineSum + Number(item.stockDeductionQty) * Number(item.product.costPrice),
        0,
      );
      return sum + lineCost;
    }, 0);
    const monthlyAfterSalesCost = maintenance.reduce((sum, row) => sum + Number(row.cost), 0);
    const monthlyProfit = monthlySales - monthlyProcurementCost - monthlyAfterSalesCost;

    const receivableRows = receivables
      .map((order) => {
        const unpaid = Number(order.totalAmount) - Number(order.paidAmount);
        const agingDays = Math.max(
          0,
          Math.floor((Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
        );
        return {
          ...order,
          unpaid,
          agingDays,
        };
      })
      .filter((row) => row.unpaid > 0)
      .sort((a, b) => b.agingDays - a.agingDays);

    const monthMap = new Map<string, { month: string; income: number; expense: number }>();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      monthMap.set(key, { month: key, income: 0, expense: 0 });
    }
    for (const order of settledOrders12m) {
      const date = order.completedAt || order.createdAt;
      const key = monthKey(new Date(date));
      if (!monthMap.has(key)) continue;
      const row = monthMap.get(key)!;
      row.income += Number(order.paidAmount);
      row.expense += order.items.reduce(
        (sum, item) => sum + Number(item.stockDeductionQty) * Number(item.product.costPrice),
        0,
      );
    }
    for (const row of monthMap.values()) {
      const monthStart = new Date(`${row.month}-01T00:00:00`);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const monthMaint = maintenance
        .filter((m) => m.createdAt >= monthStart && m.createdAt < monthEnd)
        .reduce((sum, m) => sum + Number(m.cost), 0);
      row.expense += monthMaint;
    }

    return NextResponse.json(
      {
        data: {
          pnl: {
            sales: Number(monthlySales.toFixed(2)),
            procurementCost: Number(monthlyProcurementCost.toFixed(2)),
            afterSalesCost: Number(monthlyAfterSalesCost.toFixed(2)),
            netProfit: Number(monthlyProfit.toFixed(2)),
          },
          receivables: receivableRows,
          cashflow: Array.from(monthMap.values()).map((row) => ({
            ...row,
            income: Number(row.income.toFixed(2)),
            expense: Number(row.expense.toFixed(2)),
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/finance error:", error);
    return NextResponse.json({ error: "Failed to fetch finance report." }, { status: 500 });
  }
}
