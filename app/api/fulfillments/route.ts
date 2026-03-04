import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const salesOrderId = String(request.nextUrl.searchParams.get("salesOrderId") ?? "").trim();
    if (!salesOrderId) {
      return NextResponse.json({ error: "salesOrderId is required." }, { status: 400 });
    }

    const data = await prisma.salesOrderFulfillment.findUnique({
      where: { salesOrderId },
      include: {
        salesOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
        },
        items: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({ data: data ?? null }, { status: 200 });
  } catch (error) {
    console.error("GET /api/fulfillments error:", error);
    return NextResponse.json({ error: "Failed to load fulfillments." }, { status: 500 });
  }
}
