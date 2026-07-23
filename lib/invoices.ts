import { Prisma } from "@prisma/client";
import { centsToNumber, moneyToCents, sumSignedPaymentCents } from "@/lib/payment-ledger";

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
    select: { amount: true, paymentType: true, status: true },
  });
  const paidCents = sumSignedPaymentCents(postedPayments);
  const paidTotal = roundCurrency(centsToNumber(paidCents));
  const balanceDue = roundCurrency(centsToNumber(moneyToCents(total) - paidCents));
  return { paidTotal, balanceDue };
}

export function deriveInvoiceStatus(currentStatus: string, paidTotal: number, total: number) {
  if (currentStatus === "void") return "void";
  if (paidTotal <= 0) return currentStatus === "sent" ? "sent" : "draft";
  if (paidTotal >= total) return "paid";
  return "partially_paid";
}
