export type DepositSummaryPayment = {
  amount: unknown;
  invoiceId?: string | null;
  paymentType?: string | null;
  status?: string | null;
};

export type SalesOrderDepositSummary = {
  allocatedDeposit: string;
  depositDue: string;
  depositReceived: string;
  depositRequired: string;
  unallocatedDeposit: string;
};

function moneyToCents(value: unknown) {
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    raw = String(value);
  } else if (typeof value === "string") {
    raw = value.trim();
  } else if (value && typeof (value as { toFixed?: unknown }).toFixed === "function") {
    raw = (value as { toFixed: () => string }).toFixed();
  } else {
    return 0;
  }

  if (!raw || !/^-?(?:\d+|\d*\.\d+)$/.test(raw)) return 0;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  if (fractionRaw.length > 2 && !/^0+$/.test(fractionRaw.slice(2))) return 0;
  const whole = Number(wholeRaw || "0");
  const fraction = Number(fractionRaw.slice(0, 2).padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) return 0;
  const cents = whole * 100 + fraction;
  return negative ? -cents : cents;
}

function centsToMoney(cents: number) {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safeCents < 0 ? "-" : "";
  const absolute = Math.abs(safeCents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function calculateSalesOrderDepositSummary(args: {
  depositRequired: unknown;
  payments: DepositSummaryPayment[];
}): SalesOrderDepositSummary {
  const depositRequiredCents = Math.max(0, moneyToCents(args.depositRequired));
  let depositReceivedCents = 0;
  let allocatedDepositCents = 0;
  let unallocatedDepositCents = 0;

  for (const payment of args.payments) {
    if (String(payment.status ?? "").toUpperCase() !== "POSTED") continue;
    if (String(payment.paymentType ?? "").toUpperCase() !== "DEPOSIT") continue;

    const amountCents = moneyToCents(payment.amount);
    depositReceivedCents += amountCents;
    if (payment.invoiceId) {
      allocatedDepositCents += amountCents;
    } else {
      unallocatedDepositCents += amountCents;
    }
  }

  return {
    allocatedDeposit: centsToMoney(allocatedDepositCents),
    depositDue: centsToMoney(Math.max(depositRequiredCents - depositReceivedCents, 0)),
    depositReceived: centsToMoney(depositReceivedCents),
    depositRequired: centsToMoney(depositRequiredCents),
    unallocatedDeposit: centsToMoney(unallocatedDepositCents),
  };
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
