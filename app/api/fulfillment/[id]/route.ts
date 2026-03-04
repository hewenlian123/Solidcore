import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSalesOutboundQueue } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing fulfillment id." }, { status: 400 });

    const fulfillment = await prisma.salesOrderFulfillment.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            salesOrderItem: {
              select: {
                id: true,
              },
            },
          },
        },
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
    if (!fulfillment) return NextResponse.json({ error: "Fulfillment not found." }, { status: 404 });

    return NextResponse.json({ data: fulfillment }, { status: 200 });
  } catch (error) {
    console.error("GET /api/fulfillment/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch fulfillment." }, { status: 500 });
  }
}

const STATUS_MAP: Record<string, string> = {
  draft: "DRAFT",
  scheduled: "SCHEDULED",
  packing: "PACKING",
  ready: "READY",
  out: "OUT",
  partial: "PARTIAL",
  completed: "COMPLETED",
  canceled: "CANCELLED",
  cancelled: "CANCELLED",
  in_progress: "IN_PROGRESS",
};

async function getFulfillmentProgress(fulfillmentId: string) {
  const rows = await prisma.salesOrderFulfillmentItem.findMany({
    where: { fulfillmentId },
    select: { orderedQty: true, fulfilledQty: true },
  });
  if (rows.length === 0) return { hasItems: false, allCompleted: false, anyShort: false };
  const allCompleted = rows.every((row) => Number(row.fulfilledQty) >= Number(row.orderedQty));
  const anyShort = rows.some((row) => Number(row.fulfilledQty) < Number(row.orderedQty));
  return { hasItems: true, allCompleted, anyShort };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing fulfillment id." }, { status: 400 });

    const payload = await request.json();
    const data: Record<string, unknown> = {};

    if (payload.status !== undefined) {
      const mapped = STATUS_MAP[String(payload.status).toLowerCase()];
      if (!mapped) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      if (mapped === "COMPLETED") {
        const progress = await getFulfillmentProgress(id);
        if (progress.hasItems && !progress.allCompleted) {
          return NextResponse.json(
            { error: "Cannot mark completed while some items are not fully fulfilled." },
            { status: 409 },
          );
        }
      }
      data.status = mapped;
    }
    if (payload.scheduledAt !== undefined) {
      data.scheduledDate = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    }
    if (payload.timeWindow !== undefined) {
      const value = String(payload.timeWindow ?? "").trim();
      data.timeWindow = value.length > 0 ? value : null;
    }
    if (payload.driverName !== undefined) {
      const value = String(payload.driverName ?? "").trim();
      data.driverName = value.length > 0 ? value : null;
    }
    if (payload.pickupContact !== undefined) {
      const value = String(payload.pickupContact ?? "").trim();
      data.pickupContact = value.length > 0 ? value : null;
    }
    if (payload.notes !== undefined) {
      const value = String(payload.notes ?? "").trim();
      data.notes = value.length > 0 ? value : null;
    }
    if (payload.deliveryName !== undefined) {
      const value = String(payload.deliveryName ?? "").trim();
      data.deliveryName = value.length > 0 ? value : null;
    }
    if (payload.deliveryPhone !== undefined) {
      const value = String(payload.deliveryPhone ?? "").trim();
      data.deliveryPhone = value.length > 0 ? value : null;
    }
    if (payload.address1 !== undefined) {
      const value = String(payload.address1 ?? "").trim();
      data.address1 = value.length > 0 ? value : null;
    }
    if (payload.address2 !== undefined) {
      const value = String(payload.address2 ?? "").trim();
      data.address2 = value.length > 0 ? value : null;
    }
    if (payload.city !== undefined) {
      const value = String(payload.city ?? "").trim();
      data.city = value.length > 0 ? value : null;
    }
    if (payload.state !== undefined) {
      const value = String(payload.state ?? "").trim();
      data.state = value.length > 0 ? value : null;
    }
    if (payload.zip !== undefined) {
      const value = String(payload.zip ?? "").trim();
      data.zip = value.length > 0 ? value : null;
    }

    if (payload.address !== undefined) {
      const value = String(payload.address ?? "").trim();
      data.address = value.length > 0 ? value : null;
    } else if (payload.address1 !== undefined || payload.address2 !== undefined || payload.city !== undefined || payload.state !== undefined || payload.zip !== undefined) {
      data.address = [data.address1, data.address2, data.city, data.state, data.zip]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ") || null;
    }

    const updated = await prisma.salesOrderFulfillment.update({
      where: { id },
      data,
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    await prisma.$transaction(async (tx) => {
      await syncSalesOutboundQueue(tx, updated.salesOrderId);
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/fulfillment/[id] error:", error);
    return NextResponse.json({ error: "Failed to update fulfillment." }, { status: 500 });
  }
}
