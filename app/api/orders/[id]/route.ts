import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) {
      return deny();
    }

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: true,
                specification: true,
              },
            },
          },
        },
        activities: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const data =
      role === "WAREHOUSE"
        ? { ...order, totalAmount: null, paidAmount: null, items: order.items.map((i) => ({ ...i, unitPrice: null, subtotal: null })) }
        : role === "SALES"
          ? { ...order, items: order.items.map((i) => ({ ...i, unitPrice: i.unitPrice, subtotal: i.subtotal })) }
          : order;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/orders/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch order details。" }, { status: 500 });
  }
}
