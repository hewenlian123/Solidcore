import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { buildCustomerOrderMetrics } from "@/lib/customers/customer-order-metrics";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;

    const exists = await prisma.salesCustomer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const { summary } = await buildCustomerOrderMetrics(id);
    return NextResponse.json({ data: summary }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers/[id]/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch customer summary." }, { status: 500 });
  }
}
