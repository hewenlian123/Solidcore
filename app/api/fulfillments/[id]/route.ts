import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deductInventoryForFulfillment, InventoryDeductionError, isFinalFulfillmentStatus } from "@/lib/fulfillment-inventory";
import { syncSalesOutboundQueue, syncSalesOrderFulfillmentFromFulfillment } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

const STATUS_MAP: Record<string, string> = {
  draft: "DRAFT",
  scheduled: "SCHEDULED",
  packing: "PACKING",
  ready: "READY",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  picked_up: "PICKED_UP",
  completed: "COMPLETED",
  canceled: "CANCELLED",
  cancelled: "CANCELLED",
};

const SHIPTO_MUTABLE_STATUSES = new Set(["DRAFT", "SCHEDULED"]);

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    const data = await prisma.salesOrderFulfillment.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customer: { select: { id: true, name: true } },
            invoices: { select: { id: true, invoiceNumber: true }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!data) return NextResponse.json({ error: "Fulfillment not found." }, { status: 404 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/fulfillments/[id] error:", error);
    return NextResponse.json({ error: "Failed to load fulfillment." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    const payload = await request.json();

    const current = await prisma.salesOrderFulfillment.findUnique({
      where: { id },
      select: { id: true, status: true, salesOrderId: true },
    });
    if (!current) return NextResponse.json({ error: "Fulfillment not found." }, { status: 404 });

    const mappedStatus =
      payload.status !== undefined ? STATUS_MAP[String(payload.status).toLowerCase()] : undefined;
    if (payload.status !== undefined && !mappedStatus) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const canEditShipto = SHIPTO_MUTABLE_STATUSES.has(String(current.status).toUpperCase());
    const scheduledAtInput = payload.scheduled_at ?? payload.scheduledAt;
    const timeWindowInput = payload.time_window ?? payload.timeWindow;
    const driverNameInput = payload.driver_name ?? payload.driverName;
    const pickupContactInput = payload.pickup_contact ?? payload.pickupContact;
    const shiptoNameInput = payload.shipto_name ?? payload.shiptoName ?? payload.delivery_name ?? payload.deliveryName;
    const shiptoPhoneInput = payload.shipto_phone ?? payload.shiptoPhone ?? payload.delivery_phone ?? payload.deliveryPhone;
    const shiptoAddress1Input = payload.shipto_address1 ?? payload.shiptoAddress1 ?? payload.address1;
    const shiptoAddress2Input = payload.shipto_address2 ?? payload.shiptoAddress2 ?? payload.address2;
    const shiptoCityInput = payload.shipto_city ?? payload.shiptoCity ?? payload.city;
    const shiptoStateInput = payload.shipto_state ?? payload.shiptoState ?? payload.state;
    const shiptoZipInput = payload.shipto_zip ?? payload.shiptoZip ?? payload.zip;
    const shiptoNotesInput = payload.shipto_notes ?? payload.shiptoNotes;

    const data: Record<string, unknown> = {
      status: mappedStatus,
      scheduledAt: scheduledAtInput !== undefined ? (scheduledAtInput ? new Date(scheduledAtInput) : null) : undefined,
      scheduledDate: scheduledAtInput !== undefined ? (scheduledAtInput ? new Date(scheduledAtInput) : null) : undefined,
      timeWindow: timeWindowInput !== undefined ? (String(timeWindowInput || "").trim() || null) : undefined,
      driverName: driverNameInput !== undefined ? (String(driverNameInput || "").trim() || null) : undefined,
      pickupContact: pickupContactInput !== undefined ? (String(pickupContactInput || "").trim() || null) : undefined,
      notes: payload.notes !== undefined ? (String(payload.notes || "").trim() || null) : undefined,
    };

    if (canEditShipto) {
      data.shiptoName = shiptoNameInput !== undefined ? (String(shiptoNameInput || "").trim() || null) : undefined;
      data.shiptoPhone = shiptoPhoneInput !== undefined ? (String(shiptoPhoneInput || "").trim() || null) : undefined;
      data.shiptoAddress1 = shiptoAddress1Input !== undefined ? (String(shiptoAddress1Input || "").trim() || null) : undefined;
      data.shiptoAddress2 = shiptoAddress2Input !== undefined ? (String(shiptoAddress2Input || "").trim() || null) : undefined;
      data.shiptoCity = shiptoCityInput !== undefined ? (String(shiptoCityInput || "").trim() || null) : undefined;
      data.shiptoState = shiptoStateInput !== undefined ? (String(shiptoStateInput || "").trim() || null) : undefined;
      data.shiptoZip = shiptoZipInput !== undefined ? (String(shiptoZipInput || "").trim() || null) : undefined;
      data.shiptoNotes = shiptoNotesInput !== undefined ? (String(shiptoNotesInput || "").trim() || null) : undefined;
      data.deliveryName = data.shiptoName;
      data.deliveryPhone = data.shiptoPhone;
      data.address1 = data.shiptoAddress1;
      data.address2 = data.shiptoAddress2;
      data.city = data.shiptoCity;
      data.state = data.shiptoState;
      data.zip = data.shiptoZip;
      data.address = [data.shiptoAddress1, data.shiptoAddress2, data.shiptoCity, data.shiptoState, data.shiptoZip]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ") || null;
    } else if (
      shiptoNameInput !== undefined ||
      shiptoPhoneInput !== undefined ||
      shiptoAddress1Input !== undefined ||
      shiptoAddress2Input !== undefined ||
      shiptoCityInput !== undefined ||
      shiptoStateInput !== undefined ||
      shiptoZipInput !== undefined ||
      shiptoNotesInput !== undefined
    ) {
      return NextResponse.json(
        { error: "Ship-to fields are editable only while fulfillment is in draft/scheduled." },
        { status: 409 },
      );
    }

    if (mappedStatus === "COMPLETED") {
      const rows = await prisma.salesOrderFulfillmentItem.findMany({
        where: { fulfillmentId: id },
        select: { orderedQty: true, fulfilledQty: true },
      });
      const allDone = rows.length > 0 && rows.every((row) => Number(row.fulfilledQty) >= Number(row.orderedQty));
      if (!allDone) {
        return NextResponse.json(
          { error: "Cannot set completed until all items are fully fulfilled." },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.salesOrderFulfillment.update({
        where: { id },
        data,
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (isFinalFulfillmentStatus(next.status)) {
        await deductInventoryForFulfillment(tx, { fulfillmentId: id, operator: role });
      }
      await syncSalesOrderFulfillmentFromFulfillment(tx, id);
      await syncSalesOutboundQueue(tx, current.salesOrderId);
      return next;
    });
    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof InventoryDeductionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/fulfillments/[id] error:", error);
    return NextResponse.json({ error: "Failed to update fulfillment." }, { status: 500 });
  }
}
