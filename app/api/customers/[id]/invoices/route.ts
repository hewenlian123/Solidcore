import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoices";
import { sumSignedPaymentAmount } from "@/lib/payment-ledger";
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

    const postedPayments = invoiceIds.length
      ? await prisma.salesOrderPayment.findMany({
          where: {
            invoiceId: { in: invoiceIds },
            status: "POSTED",
          },
          select: { invoiceId: true, amount: true, paymentType: true, status: true },
        })
      : [];

    const paymentsByInvoice = new Map<string, typeof postedPayments>();
    for (const payment of postedPayments) {
      const key = payment.invoiceId ?? "";
      const current = paymentsByInvoice.get(key) ?? [];
      current.push(payment);
      paymentsByInvoice.set(key, current);
    }

    const data = invoices.map((invoice) => {
      const paidTotal = roundCurrency(sumSignedPaymentAmount(paymentsByInvoice.get(invoice.id) ?? []));
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
