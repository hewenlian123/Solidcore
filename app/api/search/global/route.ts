import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const LIMIT_PER_GROUP = 4;

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json(
        {
          data: {
            products: [],
            orders: [],
            customers: [],
          },
        },
        { status: 200 },
      );
    }

    const canSeeSales = hasOneOf(role, ["ADMIN", "SALES"]);

    const [products, orders, customers] = await Promise.all([
      prisma.productVariant.findMany({
        where: {
          archivedAt: null,
          isStockItem: true,
          product: { active: true },
          OR: [
            { sku: { contains: q } },
            { displayName: { contains: q } },
            { description: { contains: q } },
            { product: { name: { contains: q } } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: LIMIT_PER_GROUP,
        select: {
          id: true,
          sku: true,
          displayName: true,
          imageUrl: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      canSeeSales
        ? prisma.salesOrder.findMany({
            where: {
              OR: [{ orderNumber: { contains: q } }, { customer: { name: { contains: q } } }],
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT_PER_GROUP,
            select: {
              id: true,
              orderNumber: true,
              total: true,
              customer: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      canSeeSales
        ? prisma.salesCustomer.findMany({
            where: {
              OR: [
                { name: { contains: q } },
                { phone: { contains: q } },
                { companyName: { contains: q } },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: LIMIT_PER_GROUP,
            select: {
              id: true,
              name: true,
              phone: true,
              companyName: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json(
      {
        data: {
          products: products.map((row) => ({
            id: row.id,
            productId: row.product.id,
            name: row.displayName || row.product.name,
            sku: row.sku,
            imageUrl: row.imageUrl ?? null,
          })),
          orders: orders.map((row) => ({
            id: row.id,
            orderNumber: row.orderNumber,
            customerName: row.customer.name,
            total: Number(row.total),
          })),
          customers: customers.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone ?? null,
            companyName: row.companyName ?? null,
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/search/global error:", error);
    return NextResponse.json({ error: "Failed to search." }, { status: 500 });
  }
}
