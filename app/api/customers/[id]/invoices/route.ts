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
    const customer = await prisma.salesCustomer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const invoices = await prisma.invoice.findMany({
      where: { customerId: id },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        salesOrderId: true,
        issueDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const invoiceIds = invoices.map((row) => row.id);
    const salesOrderIds = Array.from(new Set(invoices.map((row) => row.salesOrderId).filter(Boolean))) as string[];

    const postedPayments = invoiceIds.length
      ? await prisma.salesOrderPayment.findMany({
          where: {
            invoiceId: { in: invoiceIds },
            status: "POSTED",
          },
          select: { invoiceId: true, amount: true },
        })
      : [];

    const postedPaymentsBySalesOrder = salesOrderIds.length
      ? await prisma.salesOrderPayment.findMany({
          where: {
            salesOrderId: { in: salesOrderIds },
            status: "POSTED",
          },
          select: { salesOrderId: true, amount: true },
        })
      : [];

    const paidByInvoice = new Map<string, number>();
    for (const payment of postedPayments) {
      const key = payment.invoiceId ?? "";
      const prev = paidByInvoice.get(key) ?? 0;
      paidByInvoice.set(key, roundCurrency(prev + Number(payment.amount)));
    }

    const paidBySalesOrder = new Map<string, number>();
    for (const payment of postedPaymentsBySalesOrder) {
      const prev = paidBySalesOrder.get(payment.salesOrderId) ?? 0;
      paidBySalesOrder.set(payment.salesOrderId, roundCurrency(prev + Number(payment.amount)));
    }

    const data = invoices.map((invoice) => {
      const directPaid = roundCurrency(paidByInvoice.get(invoice.id) ?? 0);
      const paidTotal =
        directPaid > 0
          ? directPaid
          : roundCurrency(invoice.salesOrderId ? (paidBySalesOrder.get(invoice.salesOrderId) ?? 0) : 0);
      const total = Number(invoice.total);
      const balance = roundCurrency(total - paidTotal);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: deriveInvoiceStatus(invoice.status, paidTotal, total),
        total,
        paidTotal,
        balance,
        createdAt: invoice.createdAt,
        issueDate: invoice.issueDate,
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers/[id]/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch customer invoices." }, { status: 500 });
  }
}
