import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoices";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: {
          select: { id: true, orderNumber: true },
        },
        items: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                inventoryStock: {
                  select: { onHand: true, reserved: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const invoicePayments = await prisma.salesOrderPayment.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { receivedAt: "desc" },
    });
    let paidTotal = roundCurrency(
      invoicePayments
        .filter((p) => p.status === "POSTED")
        .reduce((sum, p) => sum + Number(p.amount), 0),
    );
    let payments = invoicePayments;
    if (paidTotal <= 0) {
      const fallbackPayments = await prisma.salesOrderPayment.findMany({
        where: { salesOrderId: invoice.salesOrderId },
        orderBy: { receivedAt: "desc" },
      });
      paidTotal = roundCurrency(
        fallbackPayments
          .filter((p) => p.status === "POSTED")
          .reduce((sum, p) => sum + Number(p.amount), 0),
      );
      payments = fallbackPayments;
    }
    const total = Number(invoice.total);
    const balanceDue = roundCurrency(total - paidTotal);
    const effectiveStatus = deriveInvoiceStatus(invoice.status, paidTotal, total);

    return NextResponse.json(
      {
        data: {
          ...invoice,
          items: invoice.items.map((item) => ({
            ...item,
            available:
              item.variant?.inventoryStock
                ? Number(item.variant.inventoryStock.onHand) - Number(item.variant.inventoryStock.reserved)
                : null,
          })),
          status: effectiveStatus,
          payments,
          paidTotal: String(paidTotal),
          balanceDue: String(balanceDue),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/invoices/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice." }, { status: 500 });
  }
}
