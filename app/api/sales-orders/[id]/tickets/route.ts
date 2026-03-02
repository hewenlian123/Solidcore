import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const TICKET_TYPES = ["PICK", "DELIVERY", "RETURN"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid sales order id." }, { status: 400 });
    }
    const data = await prisma.salesOrderTicket.findMany({
      where: { salesOrderId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales-orders/[id]/tickets error:", error);
    return NextResponse.json({ error: "Failed to fetch tickets." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid sales order id." }, { status: 400 });
    }
    const payload = await request.json();
    const ticketType = String(payload.ticketType ?? "").toUpperCase();
    if (!TICKET_TYPES.includes(ticketType as (typeof TICKET_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid ticket type." }, { status: 400 });
    }
    const created = await prisma.salesOrderTicket.create({
      data: {
        salesOrderId: id,
        fulfillmentId: payload.fulfillmentId ? String(payload.fulfillmentId) : null,
        ticketType,
        status: String(payload.status ?? "open"),
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
        notes: payload.notes ? String(payload.notes) : null,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales-orders/[id]/tickets error:", error);
    return NextResponse.json({ error: "Failed to create ticket." }, { status: 500 });
  }
}
