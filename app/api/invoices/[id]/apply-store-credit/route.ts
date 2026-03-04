import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeInvoicePaidAndBalanceWithFallback, deriveInvoiceStatus } from "@/lib/invoices";
import { recalculateSalesOrder } from "@/lib/sales-orders";
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
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, customerId: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (!invoice.customerId) {
      return NextResponse.json({ error: "Invoice has no customer. Cannot apply store credit." }, { status: 400 });
    }

    const credits = await prisma.storeCredit.findMany({
      where: { customerId: invoice.customerId, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        amount: true,
        usedAmount: true,
        status: true,
        returnId: true,
      },
    });

    const mapped = credits
      .map((credit) => {
        const remainingAmount = round2(Number(credit.amount) - Number(credit.usedAmount ?? 0));
        return {
          id: credit.id,
          createdAt: credit.createdAt,
          amount: round2(Number(credit.amount)),
          usedAmount: round2(Number(credit.usedAmount ?? 0)),
          remainingAmount,
          status: credit.status,
          returnId: credit.returnId,
        };
      })
      .filter((credit) => credit.remainingAmount > 0);

    const openCreditBalance = round2(mapped.reduce((sum, credit) => sum + credit.remainingAmount, 0));
    return NextResponse.json({ data: { openCreditBalance, credits: mapped } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/invoices/[id]/apply-store-credit error:", error);
    return NextResponse.json({ error: "Failed to load store credit balance." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const requestedAmount = round2(Number(payload?.amount ?? 0));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          total: true,
          salesOrderId: true,
          customerId: true,
        },
      });
      if (!invoice) throw new Error("NOT_FOUND");
      if (invoice.status === "void") throw new Error("VOIDED");
      if (!invoice.salesOrderId) throw new Error("NO_SALES_ORDER");
      if (!invoice.customerId) throw new Error("NO_CUSTOMER");

      const currentTotals = await computeInvoicePaidAndBalanceWithFallback(tx, {
        invoiceId: invoice.id,
        salesOrderId: invoice.salesOrderId,
        total: Number(invoice.total),
      });
      const currentBalance = round2(Math.max(Number(currentTotals.balanceDue), 0));
      if (currentBalance <= 0) throw new Error("NO_BALANCE");

      const recentExisting = await tx.salesOrderPayment.findFirst({
        where: {
          invoiceId: invoice.id,
          method: "STORE_CREDIT",
          status: "POSTED",
          amount: requestedAmount,
          createdAt: { gte: new Date(Date.now() - 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          storeCreditApplications: {
            select: { id: true, amount: true },
          },
        },
      });
      if (recentExisting && recentExisting.storeCreditApplications.length > 0) {
        const existingAmount = round2(
          recentExisting.storeCreditApplications.reduce((sum, row) => sum + Number(row.amount), 0),
        );
        if (Math.abs(existingAmount - requestedAmount) < 0.001) {
          return { appliedAmount: existingAmount, paymentId: recentExisting.id, idempotent: true as const };
        }
      }

      const credits = await tx.storeCredit.findMany({
        where: { customerId: invoice.customerId, status: "OPEN" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          amount: true,
          usedAmount: true,
          status: true,
        },
      });

      const openCredits = credits
        .map((credit) => ({
          id: credit.id,
          remaining: round2(Number(credit.amount) - Number(credit.usedAmount ?? 0)),
        }))
        .filter((credit) => credit.remaining > 0);
      const openCreditBalance = round2(openCredits.reduce((sum, credit) => sum + credit.remaining, 0));
      const applyAmount = round2(Math.min(requestedAmount, currentBalance, openCreditBalance));
      if (applyAmount <= 0) throw new Error("NO_OPEN_CREDIT");

      if (openCredits.length === 0) throw new Error("NO_OPEN_CREDIT");

      const payment = await tx.salesOrderPayment.create({
        data: {
          salesOrderId: invoice.salesOrderId,
          invoiceId: invoice.id,
          amount: applyAmount,
          method: "STORE_CREDIT",
          paymentType: "FINAL",
          status: "POSTED",
          notes: "Applied store credit",
        },
        select: { id: true },
      });

      let remainingToApply = applyAmount;
      let totalApplied = 0;
      let appliedRows = 0;

      for (const creditCandidate of openCredits) {
        if (remainingToApply <= 0) break;
        const credit = await tx.storeCredit.findUnique({
          where: { id: creditCandidate.id },
          select: { amount: true, usedAmount: true },
        });
        if (!credit) throw new Error("CREDIT_NOT_FOUND");

        const totalAmount = round2(Number(credit.amount));
        const currentUsed = round2(Number(credit.usedAmount ?? 0));
        const currentRemaining = round2(Math.max(totalAmount - currentUsed, 0));
        const take = round2(Math.min(currentRemaining, remainingToApply));
        if (take <= 0) continue;

        const nextUsedAmount = round2(currentUsed + take);
        if (nextUsedAmount > totalAmount + 0.001) {
          throw new Error("OVER_CONSUME");
        }

        await tx.storeCredit.update({
          where: { id: creditCandidate.id },
          data: {
            usedAmount: nextUsedAmount,
            status: nextUsedAmount >= totalAmount - 0.001 ? "USED" : "OPEN",
          },
        });

        await tx.storeCreditApplication.create({
          data: {
            storeCreditId: creditCandidate.id,
            invoiceId: invoice.id,
            paymentId: payment.id,
            amount: take,
          },
        });
        appliedRows += 1;
        totalApplied = round2(totalApplied + take);
        remainingToApply = round2(remainingToApply - take);
      }
      if (appliedRows === 0 || totalApplied <= 0) throw new Error("NO_OPEN_CREDIT");

      const totals = await computeInvoicePaidAndBalanceWithFallback(tx, {
        invoiceId: invoice.id,
        salesOrderId: invoice.salesOrderId,
        total: Number(invoice.total),
      });
      const nextStatus = deriveInvoiceStatus(invoice.status, totals.paidTotal, Number(invoice.total));
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus },
      });
      await recalculateSalesOrder(tx, invoice.salesOrderId);

      return { appliedAmount: totalApplied, paymentId: payment.id, idempotent: false as const };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "VOIDED") {
      return NextResponse.json({ error: "Cannot apply store credit to a void invoice." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NO_SALES_ORDER") {
      return NextResponse.json({ error: "Invoice is missing sales order link." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NO_CUSTOMER") {
      return NextResponse.json({ error: "Invoice is missing customer link." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NO_BALANCE") {
      return NextResponse.json({ error: "Invoice has no balance due." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NO_OPEN_CREDIT") {
      return NextResponse.json({ error: "No open store credit available." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "OVER_CONSUME") {
      return NextResponse.json({ error: "Store credit over-consume prevented. Please retry." }, { status: 409 });
    }
    console.error("POST /api/invoices/[id]/apply-store-credit error:", error);
    return NextResponse.json({ error: "Failed to apply store credit." }, { status: 500 });
  }
}
