import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const customerId = String(request.nextUrl.searchParams.get("customerId") ?? "").trim();
    const salesOrderId = String(request.nextUrl.searchParams.get("salesOrderId") ?? "").trim();
    const invoiceId = String(request.nextUrl.searchParams.get("invoiceId") ?? "").trim();

    const [customers, salesOrders, invoices, soItems, invoiceItems] = await Promise.all([
      prisma.salesCustomer.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, name: true },
      }),
      prisma.salesOrder.findMany({
        where: customerId ? { customerId } : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, orderNumber: true, customerId: true },
      }),
      prisma.invoice.findMany({
        where: invoiceId
          ? { id: invoiceId }
          : customerId
            ? { customerId }
            : salesOrderId
              ? { salesOrderId }
              : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, invoiceNumber: true, salesOrderId: true, customerId: true },
      }),
      salesOrderId
        ? prisma.salesOrderItem.findMany({
            where: { salesOrderId },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              variantId: true,
              productSku: true,
              productTitle: true,
              quantity: true,
              unitPrice: true,
            },
          })
        : Promise.resolve([]),
      invoiceId
        ? prisma.invoiceItem.findMany({
            where: { invoiceId },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              variantId: true,
              skuSnapshot: true,
              titleSnapshot: true,
              qty: true,
              unitPrice: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const items =
      invoiceItems.length > 0
        ? invoiceItems.map((item) => ({
            lineItemId: item.id,
            variantId: item.variantId ?? null,
            sku: item.skuSnapshot ?? "-",
            title: item.titleSnapshot ?? "-",
            qtyPurchased: Number(item.qty ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
          }))
        : soItems.map((item) => ({
            lineItemId: item.id,
            variantId: item.variantId ?? null,
            sku: item.productSku ?? "-",
            title: item.productTitle ?? "-",
            qtyPurchased: Number(item.quantity ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
          }));

    return NextResponse.json(
      {
        data: {
          customers,
          salesOrders,
          invoices,
          items,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/after-sales/returns/create-data error:", error);
    return NextResponse.json({ error: "Failed to load return create options." }, { status: 500 });
  }
}
