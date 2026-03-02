import { AfterSalesStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const FLOW: AfterSalesStatus[] = ["PENDING", "IN_PROGRESS", "RESOLVED", "FOLLOW_UP"];

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const body = await request.json();
    const status = body?.status as AfterSalesStatus;
    if (!Object.values(AfterSalesStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const ticket = await prisma.afterSalesTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const fromIdx = FLOW.findIndex((s) => s === ticket.status);
    const toIdx = FLOW.findIndex((s) => s === status);
    if (toIdx !== fromIdx + 1 && toIdx !== fromIdx) {
      return NextResponse.json({ error: "Status can only move in workflow order." }, { status: 400 });
    }

    const data = await prisma.afterSalesTicket.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/after-sales/[id]/status error:", error);
    return NextResponse.json({ error: "Failed to update ticket status." }, { status: 500 });
  }
}
