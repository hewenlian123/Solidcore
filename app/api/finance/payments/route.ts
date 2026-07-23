import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signedPaymentCents, sumSignedPaymentAmount } from "@/lib/payment-ledger";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const trendStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    const [
      todayPayments,
      monthPayments,
      invoices,
      invoicePayments,
      trendPayments,
      recentPayments,
    ] =
      await Promise.all([
        prisma.salesOrderPayment.findMany({
          where: {
            status: "POSTED",
            createdAt: { gte: todayStart, lt: tomorrowStart },
          },
          select: { amount: true, paymentType: true, status: true },
        }),
        prisma.salesOrderPayment.findMany({
          where: {
            status: "POSTED",
            createdAt: { gte: monthStart, lt: monthEnd },
          },
          select: { amount: true, paymentType: true, status: true },
        }),
        prisma.invoice.findMany({
          where: { status: { not: "void" } },
          select: {
            id: true,
            total: true,
            salesOrderId: true,
            customerId: true,
            customer: { select: { name: true } },
          },
        }),
        prisma.salesOrderPayment.findMany({
          where: { status: "POSTED", invoiceId: { not: null } },
          select: { invoiceId: true, amount: true, paymentType: true, status: true },
        }),
        prisma.salesOrderPayment.findMany({
          where: {
            status: "POSTED",
            createdAt: { gte: trendStart, lt: tomorrowStart },
          },
          select: { createdAt: true, amount: true, paymentType: true, status: true },
        }),
        prisma.salesOrderPayment.findMany({
          where: { status: "POSTED" },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            createdAt: true,
            amount: true,
            method: true,
            paymentType: true,
            status: true,
            invoice: {
              select: { id: true, invoiceNumber: true },
            },
            salesOrder: {
              select: {
                id: true,
                orderNumber: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
        }),
      ]);

    const paymentsByInvoiceId = new Map<string, typeof invoicePayments>();
    for (const row of invoicePayments) {
      if (!row.invoiceId) continue;
      const current = paymentsByInvoiceId.get(row.invoiceId) ?? [];
      current.push(row);
      paymentsByInvoiceId.set(row.invoiceId, current);
    }

    let unpaidInvoicesCount = 0;
    let outstandingTotal = 0;
    const outstandingByCustomer = new Map<string, { customerId: string; customerName: string; balance: number }>();
    for (const invoice of invoices) {
      const paidTotal = round2(sumSignedPaymentAmount(paymentsByInvoiceId.get(invoice.id) ?? []));
      const balanceDue = round2(Math.max(Number(invoice.total) - paidTotal, 0));
      if (balanceDue <= 0) continue;
      unpaidInvoicesCount += 1;
      outstandingTotal += balanceDue;
      const customerId = invoice.customerId ?? "unknown";
      const customerName = invoice.customer?.name ?? "Unknown";
      const existing = outstandingByCustomer.get(customerId);
      if (existing) {
        existing.balance = round2(existing.balance + balanceDue);
      } else {
        outstandingByCustomer.set(customerId, { customerId, customerName, balance: balanceDue });
      }
    }

    const topCustomersByOutstanding = Array.from(outstandingByCustomer.values())
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    const trendMap = new Map<string, number>();
    for (let i = 29; i >= 0; i -= 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      trendMap.set(toYmd(day), 0);
    }
    for (const payment of trendPayments) {
      const key = toYmd(new Date(payment.createdAt));
      if (!trendMap.has(key)) continue;
      trendMap.set(key, round2((trendMap.get(key) ?? 0) + signedPaymentCents(payment) / 100));
    }
    const paymentTrend = Array.from(trendMap.entries()).map(([date, amount]) => ({ date, amount }));

    return NextResponse.json(
      {
        data: {
          kpis: {
            todayPayments: round2(sumSignedPaymentAmount(todayPayments)),
            thisMonthPayments: round2(sumSignedPaymentAmount(monthPayments)),
            unpaidInvoices: unpaidInvoicesCount,
            totalOutstandingBalance: round2(outstandingTotal),
          },
          topCustomersByOutstanding,
          paymentTrend,
          recentPayments: recentPayments.map((payment) => ({
            id: payment.id,
            dateTime: payment.createdAt,
            customerName: payment.salesOrder.customer.name,
            relatedType: payment.invoice ? "INVOICE" : "SALES_ORDER",
            relatedNumber: payment.invoice?.invoiceNumber ?? payment.salesOrder.orderNumber,
            relatedId: payment.invoice?.id ?? payment.salesOrder.id,
            method: payment.method,
            amount: round2(signedPaymentCents(payment) / 100),
            paymentType: payment.paymentType,
            status: payment.status,
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/finance/payments error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch payment overview.";
    return NextResponse.json(
      {
        error: message,
        data: {
          kpis: { todayPayments: 0, thisMonthPayments: 0, unpaidInvoices: 0, totalOutstandingBalance: 0 },
          topCustomersByOutstanding: [],
          paymentTrend: [],
          recentPayments: [],
        },
      },
      { status: 500 },
    );
  }
}
