import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; ticketId: string }>;
};

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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id, ticketId } = await params;
    const salesOrderId = await resolveSalesOrderId(id);
    if (!salesOrderId) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    const payload = await request.json();
    const existing = await prisma.salesOrderTicket.findUnique({ where: { id: ticketId } });
    if (!existing || existing.salesOrderId !== salesOrderId) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    const updated = await prisma.salesOrderTicket.update({
      where: { id: ticketId },
      data: {
        status: payload.status !== undefined ? String(payload.status) : undefined,
        scheduledAt:
          payload.scheduledAt !== undefined
            ? payload.scheduledAt
              ? new Date(payload.scheduledAt)
              : null
            : undefined,
        completedAt:
          payload.completedAt !== undefined
            ? payload.completedAt
              ? new Date(payload.completedAt)
              : null
            : undefined,
        notes: payload.notes !== undefined ? String(payload.notes || "") || null : undefined,
      },
    });
    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/sales-orders/[id]/tickets/[ticketId] error:", error);
    return NextResponse.json({ error: "Failed to update ticket." }, { status: 500 });
  }
}
