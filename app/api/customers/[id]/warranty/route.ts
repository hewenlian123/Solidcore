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
    const items = await prisma.orderItem.findMany({
      where: {
        order: { customerId: id },
        warrantyExpiry: { not: null },
      },
      include: {
        order: { select: { orderNo: true, completedAt: true } },
        product: { select: { name: true, category: true } },
      },
      orderBy: { warrantyExpiry: "asc" },
    });

    const now = Date.now();
    const data = items.map((item) => {
      const expiry = item.warrantyExpiry ? new Date(item.warrantyExpiry).getTime() : now;
      const remainingDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      return {
        id: item.id,
        orderNo: item.order.orderNo,
        productName: item.product.name,
        category: item.product.category,
        warrantyExpiry: item.warrantyExpiry,
        remainingDays,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers/[id]/warranty error:", error);
    return NextResponse.json({ error: "Failed to fetch warranty data." }, { status: 500 });
  }
}
