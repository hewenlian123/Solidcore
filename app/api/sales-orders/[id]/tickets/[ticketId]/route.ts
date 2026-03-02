import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; ticketId: string }>;
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
    const { id, ticketId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(ticketId)) {
      return NextResponse.json({ error: "Invalid ticket id." }, { status: 400 });
    }
    const payload = await request.json();
    const existing = await prisma.salesOrderTicket.findUnique({ where: { id: ticketId } });
    if (!existing || existing.salesOrderId !== id) {
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
