import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoices";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") ?? "").trim().toLowerCase();
    const customer = String(searchParams.get("customer") ?? "").trim();
    const search = String(searchParams.get("search") ?? "").trim();
    const startDate = String(searchParams.get("startDate") ?? "").trim();
    const endDate = String(searchParams.get("endDate") ?? "").trim();
    const salesOrderId = String(searchParams.get("salesOrderId") ?? "").trim();

    const where: any = {
      ...(status ? { status } : {}),
      ...(salesOrderId ? { salesOrderId } : {}),
      ...(customer
        ? {
            customer: {
              is: {
                name: { contains: customer },
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search } },
              { salesOrder: { is: { orderNumber: { contains: search } } } },
              { customer: { is: { name: { contains: search } } } },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            issueDate: {
              ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
              ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const invoiceIds = invoices.map((it) => it.id);
    const salesOrderIds = Array.from(new Set(invoices.map((it) => it.salesOrderId).filter(Boolean))) as string[];
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
      const prev = paidByInvoice.get(payment.invoiceId ?? "") ?? 0;
      paidByInvoice.set(payment.invoiceId ?? "", roundCurrency(prev + Number(payment.amount)));
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
          : roundCurrency(
              invoice.salesOrderId ? (paidBySalesOrder.get(invoice.salesOrderId) ?? 0) : 0,
            );
      const total = Number(invoice.total);
      const balanceDue = roundCurrency(total - paidTotal);
      const effectiveStatus = deriveInvoiceStatus(invoice.status, paidTotal, total);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        salesOrderId: invoice.salesOrderId,
        salesOrderNumber: invoice.salesOrder?.orderNumber ?? null,
        customer: invoice.customer,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: effectiveStatus,
        total: String(invoice.total),
        paidTotal: String(paidTotal),
        balanceDue: String(balanceDue),
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices." }, { status: 500 });
  }
}
