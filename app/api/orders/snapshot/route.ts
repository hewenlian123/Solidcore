import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildProductDisplayName } from "@/lib/product-display-format";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const INCLUDED_STATUSES = ["CONFIRMED", "READY", "PARTIALLY_FULFILLED", "FULFILLED"] as const;

function getHonoluluMonthRange(now = new Date()) {
  // Honolulu is UTC-10 year-round (no DST).
  const honoluluNowMs = now.getTime() - 10 * 60 * 60 * 1000;
  const honoluluNow = new Date(honoluluNowMs);
  const year = honoluluNow.getUTCFullYear();
  const month = honoluluNow.getUTCMonth(); // 0-based
  const startUtc = new Date(Date.UTC(year, month, 1, 10, 0, 0, 0));
  const nextStartUtc = new Date(Date.UTC(year, month + 1, 1, 10, 0, 0, 0));
  return { startUtc, nextStartUtc };
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { startUtc, nextStartUtc } = getHonoluluMonthRange();
    const orderWhere = {
      docType: "SALES_ORDER" as const,
      status: { in: [...INCLUDED_STATUSES] },
      createdAt: { gte: startUtc, lt: nextStartUtc },
    };

    const [salesAgg, monthOrders, topCustomerAgg] = await Promise.all([
      prisma.salesOrder.aggregate({
        where: orderWhere,
        _sum: { total: true },
      }),
      prisma.salesOrder.count({ where: orderWhere }),
      prisma.salesOrder.groupBy({
        by: ["customerId"],
        where: orderWhere,
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
        take: 1,
      }),
    ]);

    let topCustomer = {
      customerId: "",
      name: "-",
      amount: 0,
    };
    if (topCustomerAgg.length > 0) {
      const top = topCustomerAgg[0];
      const customer = await prisma.salesCustomer.findUnique({
        where: { id: top.customerId },
        select: { id: true, name: true },
      });
      topCustomer = {
        customerId: customer?.id ?? top.customerId,
        name: customer?.name ?? "-",
        amount: Number(top._sum.total ?? 0),
      };
    }

    const topProductAgg = await prisma.salesOrderItem.groupBy({
      by: ["variantId", "productId"],
      where: {
        salesOrder: orderWhere,
      },
      _sum: { lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 1,
    });

    let topProduct: {
      productId?: string;
      variantId?: string;
      name: string;
      amount: number;
    } = {
      productId: undefined,
      variantId: undefined,
      name: "-",
      amount: 0,
    };

    if (topProductAgg.length > 0) {
      const top = topProductAgg[0];
      const snapshot = await prisma.salesOrderItem.findFirst({
        where: {
          variantId: top.variantId,
          productId: top.productId,
          salesOrder: orderWhere,
        },
        orderBy: { createdAt: "desc" },
        select: {
          productId: true,
          variantId: true,
          productTitle: true,
          lineDescription: true,
        },
      });
      const baseName = snapshot?.productTitle ?? "-";
      const formatted = buildProductDisplayName(baseName, snapshot?.lineDescription ?? null);
      topProduct = {
        productId: snapshot?.productId ?? undefined,
        variantId: snapshot?.variantId ?? undefined,
        name: formatted,
        amount: Number(top._sum.lineTotal ?? 0),
      };
    }

    return NextResponse.json(
      {
        monthSales: Number(salesAgg._sum.total ?? 0),
        monthOrders,
        topProduct,
        topCustomer,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/orders/snapshot error:", error);
    return NextResponse.json({ error: "Failed to load orders snapshot." }, { status: 500 });
  }
}
