import { Prisma } from "@prisma/client";

const DECIMAL_MONEY_PATTERN = /^-?(?:\d+|\d*\.\d+)$/;

export type PaymentLedgerPayment = {
  amount: unknown;
  id?: string | null;
  invoiceId?: string | null;
  paymentType?: string | null;
  refundOfPaymentId?: string | null;
  status?: string | null;
};

export function moneyToCents(value: unknown) {
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("MONEY_VALUE_INVALID");
    raw = String(value);
  } else if (typeof value === "string") {
    raw = value.trim();
  } else if (value instanceof Prisma.Decimal) {
    raw = value.toFixed();
  } else {
    throw new Error("MONEY_VALUE_INVALID");
  }

  if (!raw || !DECIMAL_MONEY_PATTERN.test(raw)) {
    throw new Error("MONEY_VALUE_INVALID");
  }

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const whole = wholeRaw || "0";
  let fraction = fractionRaw;
  if (fraction.length > 2) {
    if (!/^0*$/.test(fraction.slice(2))) {
      throw new Error("MONEY_VALUE_INVALID");
    }
    fraction = fraction.slice(0, 2);
  }

  const wholeNumber = Number(whole);
  const fractionNumber = Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(wholeNumber) || !Number.isSafeInteger(fractionNumber)) {
    throw new Error("MONEY_VALUE_INVALID");
  }

  const cents = wholeNumber * 100 + fractionNumber;
  if (!Number.isSafeInteger(cents)) {
    throw new Error("MONEY_VALUE_INVALID");
  }
  return negative ? -cents : cents;
}

export function centsToNumber(cents: number) {
  return Math.round(cents) / 100;
}

export function centsToMoney(cents: number) {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safeCents < 0 ? "-" : "";
  const absolute = Math.abs(safeCents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function isPostedPayment(payment: Pick<PaymentLedgerPayment, "status">) {
  return String(payment.status ?? "").toUpperCase() === "POSTED";
}

export function isRefundPayment(payment: Pick<PaymentLedgerPayment, "paymentType">) {
  return String(payment.paymentType ?? "").toUpperCase() === "REFUND";
}

export function signedPaymentCents(payment: PaymentLedgerPayment) {
  if (!isPostedPayment(payment)) return 0;
  const amountCents = moneyToCents(payment.amount);
  return isRefundPayment(payment) ? -amountCents : amountCents;
}

export function sumSignedPaymentCents(payments: PaymentLedgerPayment[]) {
  return payments.reduce((sum, payment) => sum + signedPaymentCents(payment), 0);
}

export function sumSignedPaymentAmount(payments: PaymentLedgerPayment[]) {
  return centsToNumber(sumSignedPaymentCents(payments));
}

export function sumPostedRefundCentsForPayment(
  originalPaymentId: string,
  payments: PaymentLedgerPayment[],
) {
  return payments.reduce((sum, payment) => {
    if (!isPostedPayment(payment) || !isRefundPayment(payment)) return sum;
    if (payment.refundOfPaymentId !== originalPaymentId) return sum;
    return sum + moneyToCents(payment.amount);
  }, 0);
}

export function remainingRefundableCents(
  originalPayment: PaymentLedgerPayment,
  allPayments: PaymentLedgerPayment[],
) {
  if (!originalPayment.id || !isPostedPayment(originalPayment) || isRefundPayment(originalPayment)) return 0;
  const originalAmountCents = moneyToCents(originalPayment.amount);
  const refundedCents = sumPostedRefundCentsForPayment(originalPayment.id, allPayments);
  return Math.max(originalAmountCents - refundedCents, 0);
}
