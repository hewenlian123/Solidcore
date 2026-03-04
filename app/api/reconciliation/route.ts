import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const RECONCILED_TAG = "[RECONCILED]";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDateStart(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isReconciled(text: string | null | undefined) {
  return String(text ?? "").toUpperCase().includes(RECONCILED_TAG);
}

function appendReconciledTag(text: string | null | undefined) {
  const current = String(text ?? "").trim();
  if (isReconciled(current)) return current || RECONCILED_TAG;
  return current ? `${current}\n${RECONCILED_TAG}` : RECONCILED_TAG;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const from = parseDateStart(request.nextUrl.searchParams.get("from"));
    const to = parseDateEnd(request.nextUrl.searchParams.get("to"));
    const invoiceWhere: any = {
      status: { not: "void" },
      ...((from || to)
        ? {
            issueDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const paymentWhere: any = {
      status: "POSTED",
      ...((from || to)
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          total: true,
          notes: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      prisma.salesOrderPayment.findMany({
        where: paymentWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceId: true,
          salesOrderId: true,
          createdAt: true,
          amount: true,
          method: true,
          notes: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customer: { select: { id: true, name: true } },
            },
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

    const paymentsByInvoiceId = new Map<string, Array<any>>();
    for (const payment of payments) {
      if (!payment.invoiceId) continue;
      const prev = paymentsByInvoiceId.get(payment.invoiceId) ?? [];
      prev.push(payment);
      paymentsByInvoiceId.set(payment.invoiceId, prev);
    }

    const invoiceRows = invoices.map((invoice) => {
      const matchedPayments = (paymentsByInvoiceId.get(invoice.id) ?? []).map((payment) => ({
        id: payment.id,
        date: payment.createdAt,
        method: payment.method,
        amount: round2(Number(payment.amount)),
        reconciled: isReconciled(payment.notes),
      }));
      const paid = round2(matchedPayments.reduce((sum, row) => sum + row.amount, 0));
      const total = round2(Number(invoice.total));
      const outstanding = round2(Math.max(total - paid, 0));
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        customerName: invoice.customer?.name ?? "Unknown",
        total,
        paid,
        outstanding,
        matchedPayments,
        matchedCount: matchedPayments.length,
        reconciled: isReconciled(invoice.notes),
        unmatched: outstanding > 0,
      };
    });

    const unmatchedPayments = payments
      .filter((payment) => !payment.invoiceId)
      .map((payment) => ({
        id: payment.id,
        date: payment.createdAt,
        customerName:
          payment.salesOrder?.customer?.name ??
          payment.invoice?.customer?.name ??
          "Unknown",
        method: payment.method,
        amount: round2(Number(payment.amount)),
        salesOrderNumber: payment.salesOrder?.orderNumber ?? null,
        invoiceNumber: payment.invoice?.invoiceNumber ?? null,
        reconciled: isReconciled(payment.notes),
      }));

    const totalInvoiced = round2(invoiceRows.reduce((sum, row) => sum + row.total, 0));
    const totalPaid = round2(invoiceRows.reduce((sum, row) => sum + row.paid, 0));
    const totalOutstanding = round2(invoiceRows.reduce((sum, row) => sum + row.outstanding, 0));

    return NextResponse.json(
      {
        data: {
          summary: {
            totalInvoiced,
            totalPaid,
            totalOutstanding,
            unmatchedInvoices: invoiceRows.filter((row) => row.unmatched).length,
            unmatchedPayments: unmatchedPayments.length,
          },
          invoices: invoiceRows,
          unmatchedPayments,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/reconciliation error:", error);
    return NextResponse.json({ error: "Failed to load reconciliation data." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const payload = await request.json();
    const id = String(payload?.id ?? "").trim();
    const type = String(payload?.type ?? "").trim().toLowerCase();
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    if (type !== "invoice" && type !== "payment") {
      return NextResponse.json({ error: "type must be invoice or payment." }, { status: 400 });
    }

    if (type === "invoice") {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        select: { id: true, notes: true },
      });
      if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
      const updated = await prisma.invoice.update({
        where: { id },
        data: { notes: appendReconciledTag(invoice.notes) },
        select: { id: true, notes: true },
      });
      return NextResponse.json({ data: { id: updated.id, reconciled: isReconciled(updated.notes) } }, { status: 200 });
    }

    const payment = await prisma.salesOrderPayment.findUnique({
      where: { id },
      select: { id: true, notes: true },
    });
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    const updated = await prisma.salesOrderPayment.update({
      where: { id },
      data: { notes: appendReconciledTag(payment.notes) },
      select: { id: true, notes: true },
    });
    return NextResponse.json({ data: { id: updated.id, reconciled: isReconciled(updated.notes) } }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/reconciliation error:", error);
    return NextResponse.json({ error: "Failed to mark reconciled." }, { status: 500 });
  }
}

