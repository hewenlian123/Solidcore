import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const data = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, contactName: true, phone: true } },
      },
    });

    if (!data) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/purchase-orders/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase order." }, { status: 500 });
  }
}

