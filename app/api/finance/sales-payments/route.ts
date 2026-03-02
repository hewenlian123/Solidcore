import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const data = await prisma.salesOrderPayment.findMany({
      include: {
        salesOrder: {
          select: { id: true, orderNumber: true, customer: { select: { name: true } } },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/finance/sales-payments error:", error);
    return NextResponse.json({ error: "Failed to fetch sales payments." }, { status: 500 });
  }
}
