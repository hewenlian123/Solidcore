import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  centsToNumber,
  moneyToCents,
  sumSignedPaymentCents,
} from "@/lib/payment-ledger";

export { centsToNumber, moneyToCents } from "@/lib/payment-ledger";

export type ParsedPaymentAmount = {
  amount: string;
  cents: number;
};

export type ParsedIdempotencyKey =
  | { ok: true; key: string | null }
  | { ok: false; error: string };

const MONEY_PATTERN = /^(?:\d+|\d*\.\d+)$/;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export function parsePositivePaymentAmount(value: unknown): ParsedPaymentAmount | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const raw = String(value).trim();
  if (!raw || !MONEY_PATTERN.test(raw)) return null;

  const [wholeRaw, fractionRaw = ""] = raw.split(".");
  if (fractionRaw.length > 2) return null;

  const whole = wholeRaw || "0";
  const fraction = fractionRaw.padEnd(2, "0");
  const wholeNumber = Number(whole);
  const fractionNumber = Number(fraction);
  if (!Number.isSafeInteger(wholeNumber) || !Number.isSafeInteger(fractionNumber)) return null;

  const cents = wholeNumber * 100 + fractionNumber;
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;

  return {
    amount: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
    cents,
  };
}

export function parseIdempotencyKey(raw: string | null): ParsedIdempotencyKey {
  if (raw == null) return { ok: true, key: null };
  const key = raw.trim();
  if (!key) return { ok: false, error: "Idempotency key cannot be empty." };
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return { ok: false, error: "Idempotency key is too long." };
  }
  return { ok: true, key };
}

export function requirePaymentIdempotencyKey(parsed: ParsedIdempotencyKey) {
  if (!parsed.ok) return parsed;
  if (!parsed.key) {
    return { ok: false as const, error: "Idempotency key is required for payment creation." };
  }
  return { ok: true as const, key: parsed.key };
}

export function normalizeOptionalText(value: unknown, options: { trim?: boolean } = {}) {
  if (value == null) return null;
  const text = String(value);
  const normalized = options.trim === false ? text : text.trim();
  return normalized ? normalized : null;
}

export function parseOptionalReceivedAt(value: unknown) {
  if (value == null || value === "") {
    return { ok: true as const, receivedAt: new Date(), fingerprintValue: null };
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false as const, error: "Invalid received date." };
  }
  const raw = String(value).trim();
  if (!raw) return { ok: true as const, receivedAt: new Date(), fingerprintValue: null };
  const receivedAt = new Date(raw);
  if (Number.isNaN(receivedAt.getTime())) {
    return { ok: false as const, error: "Invalid received date." };
  }
  return { ok: true as const, receivedAt, fingerprintValue: receivedAt.toISOString() };
}

export function buildPaymentIdempotencyFingerprint(payload: Record<string, unknown>) {
  const stable = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {});
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function isPaymentOverBalance(amountCents: number, balanceCents: number) {
  return amountCents > Math.max(balanceCents, 0);
}

export async function lockSalesOrderForPayment(tx: Prisma.TransactionClient, salesOrderId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "sales_orders" WHERE id = ${salesOrderId} FOR UPDATE`,
  );
  return rows.length > 0;
}

export async function lockInvoiceForPayment(tx: Prisma.TransactionClient, invoiceId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "invoices" WHERE id = ${invoiceId} FOR UPDATE`,
  );
  return rows.length > 0;
}

export async function lockSalesOrderPaymentForRefund(
  tx: Prisma.TransactionClient,
  paymentId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "sales_order_payments" WHERE id = ${paymentId} FOR UPDATE`,
  );
  return rows.length > 0;
}

export async function getSalesOrderRemainingCents(tx: Prisma.TransactionClient, salesOrderId: string) {
  const [order, payments] = await Promise.all([
    tx.salesOrder.findUnique({
      where: { id: salesOrderId },
      select: { id: true, total: true },
    }),
    tx.salesOrderPayment.findMany({
      where: { salesOrderId, status: "POSTED" },
      select: { amount: true, paymentType: true, status: true },
    }),
  ]);

  if (!order) throw new Error("ORDER_NOT_FOUND");
  const totalCents = moneyToCents(order.total);
  const paidCents = sumSignedPaymentCents(payments);
  return totalCents - paidCents;
}

export async function getInvoiceRemainingCents(tx: Prisma.TransactionClient, invoiceId: string) {
  const [invoice, payments] = await Promise.all([
    tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, total: true },
    }),
    tx.salesOrderPayment.findMany({
      where: { invoiceId, status: "POSTED" },
      select: { amount: true, paymentType: true, status: true },
    }),
  ]);

  if (!invoice) throw new Error("NOT_FOUND");
  const totalCents = moneyToCents(invoice.total);
  const paidCents = sumSignedPaymentCents(payments);
  return totalCents - paidCents;
}
