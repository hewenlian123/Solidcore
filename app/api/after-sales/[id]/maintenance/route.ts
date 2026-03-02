import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const body = await request.json();
    const notes = String(body?.notes ?? "").trim();
    const cost = Number(body?.cost ?? 0);
    if (!notes) {
      return NextResponse.json({ error: "Please enter maintenance notes." }, { status: 400 });
    }
    if (Number.isNaN(cost) || cost < 0) {
      return NextResponse.json({ error: "Invalid cost format." }, { status: 400 });
    }

    const ticket = await prisma.afterSalesTicket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const data = await prisma.maintenanceRecord.create({
      data: {
        ticketId: id,
        notes,
        cost,
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/after-sales/[id]/maintenance error:", error);
    return NextResponse.json({ error: "Failed to save maintenance record." }, { status: 500 });
  }
}
