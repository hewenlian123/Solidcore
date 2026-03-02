export const SALES_ORDER_STATUSES = [
  "DRAFT",
  "QUOTED",
  "CONFIRMED",
  "READY",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CANCELLED",
] as const;

export type SalesOrderStatusUi = (typeof SALES_ORDER_STATUSES)[number];

export function getSalesOrderStatusLabel(status: string) {
  if (status === "DRAFT") return "Draft";
  if (status === "QUOTED") return "Quoted";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "READY") return "Ready";
  if (status === "PARTIALLY_FULFILLED") return "Partially Fulfilled";
  if (status === "FULFILLED") return "Fulfilled";
  if (status === "CANCELLED") return "Cancelled";
  return status;
}

export function getSalesOrderStatusBadge(status: string) {
  if (status === "DRAFT") return "bg-slate-100 text-slate-700";
  if (status === "QUOTED") return "bg-violet-100 text-violet-700";
  if (status === "CONFIRMED") return "bg-blue-100 text-blue-700";
  if (status === "READY") return "bg-sky-100 text-sky-700";
  if (status === "PARTIALLY_FULFILLED") return "bg-amber-100 text-amber-700";
  if (status === "FULFILLED") return "bg-emerald-100 text-emerald-700";
  if (status === "CANCELLED") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}
