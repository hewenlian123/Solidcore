export const ROLES = ["ADMIN", "SALES", "WAREHOUSE"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUS_FLOW = [
  "PENDING_PRODUCTION",
  "IN_PRODUCTION",
  "READY_DELIVERY",
  "SETTLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUS_FLOW)[number];

export function normalizeRole(input: string | null | undefined): Role {
  const role = (input ?? "").toUpperCase().trim();
  if (role === "ADMIN") return "ADMIN";
  if (role === "SALES") return "SALES";
  if (role === "WAREHOUSE") return "WAREHOUSE";
  return "ADMIN";
}

export function canViewPath(role: Role, path: string) {
  if (role === "ADMIN") return true;
  if (role === "SALES")
    return (
      path.startsWith("/dashboard") ||
      path.startsWith("/sales-orders") ||
      path.startsWith("/orders") ||
      path.startsWith("/invoices") ||
      path.startsWith("/finance") ||
      path.startsWith("/returns") ||
      path.startsWith("/inventory") ||
      path.startsWith("/products") ||
      path.startsWith("/warehouses") ||
      path.startsWith("/purchasing") ||
      path.startsWith("/suppliers") ||
      path.startsWith("/customers") ||
      path.startsWith("/store-credit") ||
      path.startsWith("/price-list") ||
      path.startsWith("/price-management") ||
      path.startsWith("/analytics") ||
      path.startsWith("/reports") ||
      path.startsWith("/reconciliation") ||
      path.startsWith("/after-sales")
    );
  if (role === "WAREHOUSE")
    return (
      path.startsWith("/dashboard") ||
      path.startsWith("/inventory") ||
      path.startsWith("/products") ||
      path.startsWith("/warehouses") ||
      path.startsWith("/warehouse") ||
      path.startsWith("/fulfillment") ||
      path.startsWith("/outbound") ||
      path.startsWith("/delivery") ||
      path.startsWith("/special-orders")
    );
  return false;
}

export function nextOrderStatus(current: string): OrderStatus | null {
  const idx = ORDER_STATUS_FLOW.findIndex((s) => s === current);
  if (idx < 0 || idx === ORDER_STATUS_FLOW.length - 1) return null;
  return ORDER_STATUS_FLOW[idx + 1];
}
