import { Prisma } from "@prisma/client";
import { computeInvoicePaidAndBalance, deriveInvoiceStatus } from "@/lib/invoices";
import { recalculateSalesOrder } from "@/lib/sales-orders";

export type VoidSalesOrderPaymentResult = {
  alreadyVoided: boolean;
  invoice:
    | {
        balanceDue: number;
        id: string;
        paidTotal: number;
        status: string;
      }
    | null;
  invoiceId: string | null;
  paymentId: string;
  salesOrderId: string;
};

export async function voidSalesOrderPaymentWithReconciliation(
  tx: Prisma.TransactionClient,
  paymentId: string,
  options: { invoiceId?: string | null } = {},
): Promise<VoidSalesOrderPaymentResult> {
  const payment = await tx.salesOrderPayment.findFirst({
    where: {
      id: paymentId,
      ...(options.invoiceId ? { invoiceId: options.invoiceId } : {}),
    },
    select: {
      id: true,
      invoiceId: true,
      salesOrderId: true,
      status: true,
    },
  });
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");

  let alreadyVoided = payment.status === "VOIDED";
  if (!alreadyVoided) {
    const updated = await tx.salesOrderPayment.updateMany({
      where: { id: payment.id, status: "POSTED" },
      data: { status: "VOIDED" },
    });

    if (updated.count === 0) {
      const current = await tx.salesOrderPayment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      if (current?.status !== "VOIDED") throw new Error("PAYMENT_VOID_CONFLICT");
      alreadyVoided = true;
    }
  }

  await recalculateSalesOrder(tx, payment.salesOrderId);

  let invoice: VoidSalesOrderPaymentResult["invoice"] = null;
  if (payment.invoiceId) {
    const invoiceRow = await tx.invoice.findUnique({
      where: { id: payment.invoiceId },
      select: { id: true, status: true, total: true },
    });
    if (invoiceRow) {
      const totals = await computeInvoicePaidAndBalance(tx, invoiceRow.id, Number(invoiceRow.total));
      const nextStatus = deriveInvoiceStatus(invoiceRow.status, totals.paidTotal, Number(invoiceRow.total));
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceRow.id },
        data: { status: nextStatus },
        select: { id: true, status: true },
      });
      invoice = {
        balanceDue: totals.balanceDue,
        id: updatedInvoice.id,
        paidTotal: totals.paidTotal,
        status: updatedInvoice.status,
      };
    }
  }

  return {
    alreadyVoided,
    invoice,
    invoiceId: payment.invoiceId,
    paymentId: payment.id,
    salesOrderId: payment.salesOrderId,
  };
}
