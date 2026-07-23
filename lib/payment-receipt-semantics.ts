export function getPaymentTypeLabel(paymentType: string | null | undefined) {
  const value = String(paymentType ?? "").toUpperCase();
  if (value === "DEPOSIT") return "Deposit";
  if (value === "FINAL") return "Final Payment";
  if (value === "REFUND") return "Refund";
  return value || "-";
}

export function getPaymentStatusLabel(status: string | null | undefined) {
  const value = String(status ?? "").toUpperCase();
  if (value === "POSTED") return "Posted";
  if (value === "VOIDED") return "Voided";
  return value || "-";
}

export function getPaymentAllocationLabel(invoiceNumber: string | null | undefined) {
  const number = String(invoiceNumber ?? "").trim();
  return number ? `Applied to Invoice ${number}` : "Unallocated";
}
