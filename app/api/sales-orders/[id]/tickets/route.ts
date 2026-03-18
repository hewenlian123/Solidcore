import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const TICKET_TYPES = ["PICK", "DELIVERY", "RETURN"] as const;

async function resolveSalesOrderId(idOrNumber: string): Promise<string | null> {
  const raw = String(idOrNumber ?? "").trim();
  if (!raw) return null;
  const byId = await prisma.salesOrder.findUnique({ where: { id: raw }, select: { id: true } });
  if (byId) return byId.id;
  const byNumber = await prisma.salesOrder.findFirst({
    where: { orderNumber: { equals: raw, mode: "insensitive" } },
    select: { id: true },
  });
  return byNumber?.id ?? null;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id } = await params;
    const salesOrderId = await resolveSalesOrderId(id);
    if (!salesOrderId) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    const data = await prisma.salesOrderTicket.findMany({
      where: { salesOrderId },
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
    const salesOrderId = await resolveSalesOrderId(id);
    if (!salesOrderId) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    const payload = await request.json();
    const ticketType = String(payload.ticketType ?? "").toUpperCase();
    if (!TICKET_TYPES.includes(ticketType as (typeof TICKET_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid ticket type." }, { status: 400 });
    }
    const created = await prisma.salesOrderTicket.create({
      data: {
        salesOrderId,
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
