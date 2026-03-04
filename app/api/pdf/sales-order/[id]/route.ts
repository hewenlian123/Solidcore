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
      fulfillments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          type: true,
          address: true,
          scheduledDate: true,
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            select: {
              name: true,
              frameMaterialDefault: true,
              slidingConfigDefault: true,
              glassTypeDefault: true,
              glassCoatingDefault: true,
              glassThicknessMmDefault: true,
              glassFinishDefault: true,
              screenDefault: true,
              openingTypeDefault: true,
              flooringMaterial: true,
              flooringWearLayer: true,
              flooringThicknessMm: true,
              flooringPlankLengthIn: true,
              flooringPlankWidthIn: true,
              flooringCoreThicknessMm: true,
              flooringInstallation: true,
              flooringUnderlayment: true,
              flooringUnderlaymentType: true,
              flooringUnderlaymentMm: true,
              flooringBoxCoverageSqft: true,
            },
          },
          variant: {
            select: {
              sku: true,
              displayName: true,
              description: true,
              width: true,
              height: true,
              color: true,
              glassTypeOverride: true,
              slidingConfigOverride: true,
              glassCoatingOverride: true,
              glassThicknessMmOverride: true,
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
    fulfillmentType: order.fulfillmentMethod ?? order.fulfillments[0]?.type ?? "PICKUP",
    fulfillmentAddress:
      order.fulfillmentMethod === "DELIVERY"
        ? [
            order.deliveryAddress1,
            order.deliveryAddress2,
            order.deliveryCity,
            order.deliveryState,
            order.deliveryZip,
          ]
            .filter((part) => String(part ?? "").trim())
            .join(", ") || null
        : null,
    fulfillmentScheduledDate: order.fulfillments[0]?.scheduledDate ?? null,
    notes:
      order.fulfillmentMethod === "PICKUP" && String(order.pickupNotes ?? "").trim()
        ? `${order.notes ? `${order.notes}\n` : ""}Pickup Notes: ${String(order.pickupNotes ?? "").trim()}`
        : order.notes,
    items: order.items.map((item) => ({
      productName: item.product?.name ?? null,
      variantSku: item.variant?.sku ?? item.skuSnapshot ?? item.productSku,
      variantTitle:
        item.variant?.displayName ??
        item.titleSnapshot ??
        item.productTitle ??
        item.variant?.description ??
        null,
      width: item.variant?.width != null ? Number(item.variant.width) : null,
      height: item.variant?.height != null ? Number(item.variant.height) : null,
      color: item.variant?.color ?? null,
      detailText: item.description ?? item.lineDescription ?? "",
      lineNote: item.lineDescription ?? item.description ?? "",
      frameMaterialDefault: item.product?.frameMaterialDefault ?? null,
      slidingConfigDefault: item.product?.slidingConfigDefault ?? null,
      glassTypeDefault: item.product?.glassTypeDefault ?? null,
      glassCoatingDefault: item.product?.glassCoatingDefault ?? null,
      glassThicknessMmDefault:
        item.product?.glassThicknessMmDefault != null ? Number(item.product.glassThicknessMmDefault) : null,
      glassFinishDefault: item.product?.glassFinishDefault ?? null,
      screenDefault: item.product?.screenDefault ?? null,
      openingTypeDefault: item.product?.openingTypeDefault ?? null,
      glassTypeOverride: item.variant?.glassTypeOverride ?? null,
      slidingConfigOverride: item.variant?.slidingConfigOverride ?? null,
      glassCoatingOverride: item.variant?.glassCoatingOverride ?? null,
      glassThicknessMmOverride:
        item.variant?.glassThicknessMmOverride != null ? Number(item.variant.glassThicknessMmOverride) : null,
      glassFinishOverride: item.variant?.glassFinishOverride ?? null,
      screenOverride: item.variant?.screenOverride ?? null,
      openingTypeOverride: item.variant?.openingTypeOverride ?? null,
      flooringMaterial: item.product?.flooringMaterial ?? null,
      flooringWearLayer: item.product?.flooringWearLayer ?? null,
      flooringThicknessMm:
        item.product?.flooringThicknessMm != null ? Number(item.product.flooringThicknessMm) : null,
      flooringPlankLengthIn:
        item.product?.flooringPlankLengthIn != null ? Number(item.product.flooringPlankLengthIn) : null,
      flooringPlankWidthIn:
        item.product?.flooringPlankWidthIn != null ? Number(item.product.flooringPlankWidthIn) : null,
      flooringCoreThicknessMm:
        item.product?.flooringCoreThicknessMm != null ? Number(item.product.flooringCoreThicknessMm) : null,
      flooringInstallation: item.product?.flooringInstallation ?? null,
      flooringUnderlayment: item.product?.flooringUnderlayment ?? null,
      flooringUnderlaymentType: item.product?.flooringUnderlaymentType ?? null,
      flooringUnderlaymentMm:
        item.product?.flooringUnderlaymentMm != null ? Number(item.product.flooringUnderlaymentMm) : null,
      flooringBoxCoverageSqft:
        item.product?.flooringBoxCoverageSqft != null ? Number(item.product.flooringBoxCoverageSqft) : null,
      qty: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    taxRate: order.taxRate != null ? Number(order.taxRate) : null,
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
