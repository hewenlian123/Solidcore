import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNextSalesOrderNumber } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const orderNumber = await prisma.$transaction(async (tx) =>
      generateNextSalesOrderNumber(tx),
    );
    return NextResponse.json({ data: { orderNumber } }, { status: 200 });
  } catch (error) {
    console.error("POST /api/sales-orders/next-number error:", error);
    return NextResponse.json(
      { error: "Failed to generate next order number." },
      { status: 500 },
    );
  }
}
