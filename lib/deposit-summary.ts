import { centsToMoney, moneyToCents } from "@/lib/payment-ledger";

export type DepositSummaryPayment = {
  amount: unknown;
  id?: string | null;
  invoiceId?: string | null;
  paymentType?: string | null;
  refundOfPaymentId?: string | null;
  status?: string | null;
};

export type SalesOrderDepositSummary = {
  allocatedDeposit: string;
  depositDue: string;
  depositReceived: string;
  depositRequired: string;
  unallocatedDeposit: string;
};

export function calculateSalesOrderDepositSummary(args: {
  depositRequired: unknown;
  payments: DepositSummaryPayment[];
}): SalesOrderDepositSummary {
  const depositRequiredCents = Math.max(0, safeMoneyToCents(args.depositRequired));
  let depositReceivedCents = 0;
  let allocatedDepositCents = 0;
  let unallocatedDepositCents = 0;
  const depositPayments = new Map<string, { amountCents: number; invoiceId: string | null }>();

  for (const payment of args.payments) {
    if (String(payment.status ?? "").toUpperCase() !== "POSTED") continue;
    if (String(payment.paymentType ?? "").toUpperCase() !== "DEPOSIT") continue;

    const amountCents = safeMoneyToCents(payment.amount);
    depositReceivedCents += amountCents;
    if (payment.invoiceId) {
      allocatedDepositCents += amountCents;
    } else {
      unallocatedDepositCents += amountCents;
    }
    if (payment.id) {
      depositPayments.set(payment.id, { amountCents, invoiceId: payment.invoiceId ?? null });
    }
  }

  const refundCentsByDepositId = new Map<string, number>();
  for (const payment of args.payments) {
    if (String(payment.status ?? "").toUpperCase() !== "POSTED") continue;
    if (String(payment.paymentType ?? "").toUpperCase() !== "REFUND") continue;
    if (!payment.refundOfPaymentId) continue;

    const originalDeposit = depositPayments.get(payment.refundOfPaymentId);
    if (!originalDeposit) continue;

    const currentRefunded = refundCentsByDepositId.get(payment.refundOfPaymentId) ?? 0;
    const refundCents = Math.min(
      safeMoneyToCents(payment.amount),
      Math.max(originalDeposit.amountCents - currentRefunded, 0),
    );
    refundCentsByDepositId.set(payment.refundOfPaymentId, currentRefunded + refundCents);
    depositReceivedCents -= refundCents;
    if (originalDeposit.invoiceId) {
      allocatedDepositCents -= refundCents;
    } else {
      unallocatedDepositCents -= refundCents;
    }
  }

  depositReceivedCents = Math.max(0, depositReceivedCents);
  allocatedDepositCents = Math.max(0, allocatedDepositCents);
  unallocatedDepositCents = Math.max(0, unallocatedDepositCents);

  return {
    allocatedDeposit: centsToMoney(allocatedDepositCents),
    depositDue: centsToMoney(Math.max(depositRequiredCents - depositReceivedCents, 0)),
    depositReceived: centsToMoney(depositReceivedCents),
    depositRequired: centsToMoney(depositRequiredCents),
    unallocatedDeposit: centsToMoney(unallocatedDepositCents),
  };
}

function safeMoneyToCents(value: unknown) {
  try {
    return moneyToCents(value);
  } catch {
    return 0;
  }
}

export function withSalesOrderDepositSummary<
  T extends { depositRequired: unknown; payments?: DepositSummaryPayment[] | null },
>(order: T | null): (T & { depositSummary: SalesOrderDepositSummary }) | null {
  if (!order) return null;
  return {
    ...order,
    depositSummary: calculateSalesOrderDepositSummary({
      depositRequired: order.depositRequired,
      payments: order.payments ?? [],
    }),
  };
}
