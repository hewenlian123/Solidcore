import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(_request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) {
      return deny();
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing customer ID." }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        installAddress: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const orders = await prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        totalAmount: true,
        paidAmount: true,
        items: {
          select: {
            id: true,
            subtotal: true,
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const statementRows = orders.flatMap((order) => {
      const total = Number(order.totalAmount);
      const paid = Number(order.paidAmount);
      const unpaid = total - paid;

      if (order.items.length === 0) {
        return [
          {
            id: order.id,
            orderNo: order.orderNo,
            date: order.createdAt,
            productName: "-",
            totalPrice: Number(total.toFixed(2)),
            paidAmount: Number(paid.toFixed(2)),
            unpaidAmount: Number(unpaid.toFixed(2)),
          },
        ];
      }

      return order.items.map((item) => ({
        id: item.id,
        orderNo: order.orderNo,
        date: order.createdAt,
        productName: item.product.name,
        totalPrice: Number(item.subtotal),
        paidAmount: Number((paid / order.items.length).toFixed(2)),
        unpaidAmount: Number((unpaid / order.items.length).toFixed(2)),
      }));
    });

    const summary = statementRows.reduce(
      (acc, row) => {
        acc.total += row.totalPrice;
        acc.paid += row.paidAmount;
        acc.unpaid += row.unpaidAmount;
        return acc;
      },
      { total: 0, paid: 0, unpaid: 0 },
    );

    return NextResponse.json(
      {
        data: {
          customer,
          rows: statementRows,
          summary: {
            total: Number(summary.total.toFixed(2)),
            paid: Number(summary.paid.toFixed(2)),
            unpaid: Number(summary.unpaid.toFixed(2)),
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/customers/[id]/statement error:", error);
    return NextResponse.json({ error: "Failed to fetch statement." }, { status: 500 });
  }
}
