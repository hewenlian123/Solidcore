import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateFulfillmentPDF } from "@/lib/pdf/generateFulfillmentPDF";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

  const { id } = await params;
  const typeRaw = String(request.nextUrl.searchParams.get("type") ?? "pick").toLowerCase();
  if (typeRaw !== "pick" && typeRaw !== "slip") {
    return NextResponse.json({ error: "Invalid type. Use type=pick or type=slip." }, { status: 400 });
  }

  const fulfillment = await prisma.salesOrderFulfillment.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, phone: true } },
      salesOrder: { select: { orderNumber: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          variant: { select: { displayName: true } },
        },
      },
    },
  });
  if (!fulfillment) return new Response("Fulfillment not found", { status: 404 });

  const address = [
    fulfillment.shiptoAddress1,
    fulfillment.shiptoAddress2,
    fulfillment.shiptoCity,
    fulfillment.shiptoState,
    fulfillment.shiptoZip,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(", ") || fulfillment.address || null;

  const pdfBytes = await generateFulfillmentPDF({
    type: typeRaw,
    fulfillmentId: fulfillment.id,
    salesOrderNumber: fulfillment.salesOrder.orderNumber,
    generatedAt: new Date(),
    fulfillmentType: fulfillment.type,
    customerName: fulfillment.customer?.name ?? fulfillment.shiptoName ?? "-",
    customerPhone: fulfillment.customer?.phone ?? fulfillment.shiptoPhone ?? null,
    scheduledAt: fulfillment.scheduledAt ?? fulfillment.scheduledDate,
    timeWindow: fulfillment.timeWindow,
    driverName: fulfillment.driverName,
    pickupContact: fulfillment.pickupContact,
    address,
    notes: fulfillment.notes,
    items: fulfillment.items.map((item) => ({
      title: item.variant?.displayName || item.title || "Item",
      sku: item.sku,
      orderedQty: Number(item.orderedQty || 0),
      fulfilledQty: Number(item.fulfilledQty || 0),
      unit: item.unit,
    })),
  });

  const asDownload = request.nextUrl.searchParams.get("download") === "true";
  const disposition = asDownload ? "attachment" : "inline";
  const suffix = typeRaw === "pick" ? "pick-list" : fulfillment.type === "DELIVERY" ? "delivery-slip" : "pickup-slip";
  return new Response(new Uint8Array(pdfBytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename=fulfillment-${fulfillment.salesOrder.orderNumber}-${suffix}.pdf`,
    },
  });
}
