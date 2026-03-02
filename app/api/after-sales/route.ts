import { AfterSalesStatus, TicketPriority } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const data = await prisma.afterSalesTicket.findMany({
      include: {
        customer: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true } },
        maintenanceRecords: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/after-sales error:", error);
    return NextResponse.json({ error: "Failed to fetch after-sales tickets." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const body = await request.json();
    const orderId = String(body?.orderId ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const priority = body?.priority as TicketPriority;
    const appointmentAtRaw = String(body?.appointmentAt ?? "").trim();
    const assignedTechnician = String(body?.assignedTechnician ?? "").trim();

    if (!orderId || !description) {
      return NextResponse.json({ error: "Order and issue description are required." }, { status: 400 });
    }
    if (!Object.values(TicketPriority).includes(priority)) {
      return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const data = await prisma.afterSalesTicket.create({
      data: {
        orderId,
        customerId: order.customerId,
        description,
        priority,
        appointmentAt: appointmentAtRaw ? new Date(appointmentAtRaw) : null,
        assignedTechnician: assignedTechnician || null,
        status: AfterSalesStatus.PENDING,
      },
      include: {
        customer: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true } },
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/after-sales error:", error);
    return NextResponse.json({ error: "Failed to create after-sales ticket." }, { status: 500 });
  }
}
