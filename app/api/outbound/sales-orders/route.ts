import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

    const data = await prisma.salesOutboundQueue.findMany({
      where: {
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
      include: {
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
      take: 200,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/outbound/sales-orders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales outbound queue." },
      { status: 500 },
    );
  }
}
