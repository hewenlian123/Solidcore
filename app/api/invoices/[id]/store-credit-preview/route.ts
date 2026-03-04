import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const amountParam = request.nextUrl.searchParams.get("amount");
    const requestedAmountRaw = Number(amountParam ?? 0);
    const requestedAmount = Number.isFinite(requestedAmountRaw) ? round2(Math.max(requestedAmountRaw, 0)) : 0;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        total: true,
        status: true,
        salesOrderId: true,
        customerId: true,
      },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (!invoice.customerId) {
      return NextResponse.json({ error: "Invoice has no customer. Cannot preview store credit." }, { status: 400 });
    }
    if (!invoice.salesOrderId) {
      return NextResponse.json({ error: "Invoice is missing sales order link." }, { status: 400 });
    }
    if (invoice.status === "void") {
      return NextResponse.json({ error: "Cannot preview store credit for a void invoice." }, { status: 400 });
    }

    const postedByInvoice = await prisma.salesOrderPayment.findMany({
      where: { invoiceId: invoice.id, status: "POSTED" },
      select: { amount: true },
    });
    let paidTotal = round2(postedByInvoice.reduce((sum, row) => sum + Number(row.amount), 0));
    if (paidTotal <= 0) {
      const postedBySalesOrder = await prisma.salesOrderPayment.findMany({
        where: { salesOrderId: invoice.salesOrderId, status: "POSTED" },
        select: { amount: true },
      });
      paidTotal = round2(postedBySalesOrder.reduce((sum, row) => sum + Number(row.amount), 0));
    }
    const invoiceBalance = round2(Math.max(Number(invoice.total) - paidTotal, 0));

    const credits = await prisma.storeCredit.findMany({
      where: { customerId: invoice.customerId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        returnId: true,
        amount: true,
        usedAmount: true,
      },
    });

    const openCredits = credits
      .map((credit) => ({
        creditId: credit.id,
        sourceReturnId: credit.returnId ?? null,
        remainingBefore: round2(Math.max(Number(credit.amount) - Number(credit.usedAmount ?? 0), 0)),
      }))
      .filter((credit) => credit.remainingBefore > 0);

    const openCreditBalance = round2(openCredits.reduce((sum, credit) => sum + credit.remainingBefore, 0));
    const previewAmount = round2(Math.min(requestedAmount, invoiceBalance, openCreditBalance));

    let remainingToApply = previewAmount;
    const allocations = openCredits
      .map((credit) => {
        const willUse = round2(Math.min(credit.remainingBefore, remainingToApply));
        if (willUse > 0) remainingToApply = round2(remainingToApply - willUse);
        return {
          creditId: credit.creditId,
          sourceReturnId: credit.sourceReturnId,
          remainingBefore: credit.remainingBefore,
          willUse,
        };
      })
      .filter((row) => row.willUse > 0);

    return NextResponse.json(
      {
        data: {
          previewAmount,
          invoiceBalance,
          openCreditBalance,
          allocations,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/invoices/[id]/store-credit-preview error:", error);
    return NextResponse.json({ error: "Failed to preview store credit allocation." }, { status: 500 });
  }
}
