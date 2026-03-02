import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { generateSalesOrderPDF } from "@/lib/pdf/generateSalesOrderPDF";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            select: {
              name: true,
              glassTypeDefault: true,
              glassFinishDefault: true,
              screenDefault: true,
              openingTypeDefault: true,
            },
          },
          variant: {
            select: {
              sku: true,
              description: true,
              width: true,
              height: true,
              color: true,
              glassTypeOverride: true,
              glassFinishOverride: true,
              screenOverride: true,
              openingTypeOverride: true,
            },
          },
        },
      },
    },
  });
  if (!order) {
    return new Response("Sales order not found", { status: 404 });
  }

  const pdfBytes = await generateSalesOrderPDF({
    orderNumber: order.orderNumber,
    docType: order.docType,
    status: order.status,
    createdAt: order.createdAt,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    customerEmail: order.customer.email,
    projectName: order.projectName,
    salespersonName: order.salespersonName,
    notes: order.notes,
    items: order.items.map((item) => ({
      productName: item.product?.name ?? null,
      variantSku: item.variant?.sku ?? item.skuSnapshot ?? item.productSku,
      variantTitle: item.titleSnapshot ?? item.productTitle ?? item.variant?.description ?? null,
      width: item.variant?.width != null ? Number(item.variant.width) : null,
      height: item.variant?.height != null ? Number(item.variant.height) : null,
      color: item.variant?.color ?? null,
      detailText: item.description ?? item.lineDescription ?? "",
      lineNote: item.lineDescription ?? item.description ?? "",
      glassTypeDefault: item.product?.glassTypeDefault ?? null,
      glassFinishDefault: item.product?.glassFinishDefault ?? null,
      screenDefault: item.product?.screenDefault ?? null,
      openingTypeDefault: item.product?.openingTypeDefault ?? null,
      glassTypeOverride: item.variant?.glassTypeOverride ?? null,
      glassFinishOverride: item.variant?.glassFinishOverride ?? null,
      screenOverride: item.variant?.screenOverride ?? null,
      openingTypeOverride: item.variant?.openingTypeOverride ?? null,
      qty: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tax: Number(order.tax),
    total: Number(order.total),
    paidAmount: Number(order.paidAmount),
    balanceDue: Number(order.balanceDue),
  });

  const { searchParams } = new URL(request.url);
  const asDownload = searchParams.get("download") === "true";
  const disposition = asDownload ? "attachment" : "inline";
  const pdfBody = new Uint8Array(pdfBytes).buffer;
  return new Response(pdfBody, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename=sales-order-${order.orderNumber}.pdf`,
    },
  });
}
