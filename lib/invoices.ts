import { Prisma } from "@prisma/client";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function generateNextInvoiceNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.invoiceCounter.upsert({
    where: { year },
    update: { lastValue: { increment: 1 } },
    create: { year, lastValue: 1 },
  });
  const serial = String(counter.lastValue).padStart(4, "0");
  return `INV-${year}-${serial}`;
}

export async function computeInvoicePaidAndBalance(tx: Prisma.TransactionClient, invoiceId: string, total: number) {
  const postedPayments = await tx.salesOrderPayment.findMany({
    where: { invoiceId, status: "POSTED" },
    select: { amount: true },
  });
  const paidTotal = roundCurrency(postedPayments.reduce((sum, p) => sum + Number(p.amount), 0));
  const balanceDue = roundCurrency(total - paidTotal);
  return { paidTotal, balanceDue };
}

export async function computeInvoicePaidAndBalanceWithFallback(
  tx: Prisma.TransactionClient,
  args: { invoiceId: string; salesOrderId: string; total: number },
) {
  const postedByInvoice = await tx.salesOrderPayment.findMany({
    where: { invoiceId: args.invoiceId, status: "POSTED" },
    select: { amount: true },
  });

  let paidTotal = roundCurrency(postedByInvoice.reduce((sum, p) => sum + Number(p.amount), 0));
  if (paidTotal <= 0) {
    const postedBySalesOrder = await tx.salesOrderPayment.findMany({
      where: { salesOrderId: args.salesOrderId, status: "POSTED" },
      select: { amount: true },
    });
    paidTotal = roundCurrency(postedBySalesOrder.reduce((sum, p) => sum + Number(p.amount), 0));
  }

  const balanceDue = roundCurrency(args.total - paidTotal);
  return { paidTotal, balanceDue };
}

export function deriveInvoiceStatus(currentStatus: string, paidTotal: number, total: number) {
  if (currentStatus === "void") return "void";
  if (paidTotal <= 0) return currentStatus === "sent" ? "sent" : "draft";
  if (paidTotal >= total) return "paid";
  return "partially_paid";
}
