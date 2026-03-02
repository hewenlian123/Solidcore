import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const supplier = await prisma.supplier.findUnique({
      where: { id },
    });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }

    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        specialOrder: true,
        supplierId: id,
      },
      select: {
        id: true,
        orderNumber: true,
        projectName: true,
        status: true,
        specialOrderStatus: true,
        etaDate: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
      orderBy: [{ etaDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({ data: { supplier, salesOrders } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/suppliers/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch supplier detail." },
      { status: 500 },
    );
  }
}
