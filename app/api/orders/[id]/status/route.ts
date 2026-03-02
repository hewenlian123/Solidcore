import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { ORDER_STATUS_FLOW } from "@/lib/rbac";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) {
      return deny();
    }

    const { id } = await params;
    const body = await request.json();
    const status = body?.status as OrderStatus;

    if (!id) {
      return NextResponse.json({ error: "Missing order ID." }, { status: 400 });
    }
    if (!Object.values(OrderStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid order status." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: true,
                warehouseId: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const fromIdx = ORDER_STATUS_FLOW.findIndex((s) => s === order.status);
    const toIdx = ORDER_STATUS_FLOW.findIndex((s) => s === status);
    if (fromIdx < 0 || toIdx < 0 || toIdx !== fromIdx + 1) {
      return NextResponse.json({ error: "Status can only move in workflow order." }, { status: 400 });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Deprecated: product-level stock deduction is disabled in variant architecture.

      if (status === "SETTLED") {
        // Variant-level inventory is validated and reserved elsewhere.
        const baseDate = new Date();
        for (const item of order.items) {
          const category = item.product.category;
          const years =
            category === "WINDOW"
              ? 5
              : category === "WAREHOUSE_SUPPLY"
                ? 2
                : category === "DOOR"
                  ? 3
                  : category === "MIRROR"
                    ? 3
                    : 2;
          const expiry = new Date(baseDate);
          expiry.setFullYear(baseDate.getFullYear() + years);
          await tx.orderItem.update({
            where: { id: item.id },
            data: { warrantyExpiry: expiry },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status,
          completedAt: status === "SETTLED" ? new Date() : null,
          activities: {
            create: {
              fromStatus: order.status,
              toStatus: status,
              operator: role,
              note: "Status transition",
            },
          },
        },
      });
    });

    return NextResponse.json({ data: updatedOrder }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_INVENTORY") {
      return NextResponse.json({ error: "Insufficient inventory" }, { status: 400 });
    }
    console.error("PATCH /api/orders/[id]/status error:", error);
    return NextResponse.json({ error: "Failed to update order status." }, { status: 500 });
  }
}
