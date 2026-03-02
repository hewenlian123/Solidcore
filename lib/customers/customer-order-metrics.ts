import { prisma } from "@/lib/prisma";

export type CustomerOrderFilter =
  | "ALL"
  | "OPEN"
  | "UNPAID"
  | "PENDING_DELIVERY"
  | "SPECIAL_ORDER";

export type CustomerOrderRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  total: number;
  paidTotal: number;
  balance: number;
  deliveryRequired: boolean;
  deliveryDate: Date | null;
  deliveryStatus: string | null;
  isSpecialOrder: boolean;
};

export type CustomerOrderSummary = {
  totalOrders: number;
  openOrders: number;
  unpaidBalance: number;
  lastOrderDate: Date | null;
  pendingDeliveryCount: number;
  specialOrderCount: number;
  unpaidCount: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isOpenStatus(status: string) {
  return status !== "FULFILLED" && status !== "CANCELLED";
}

function computeDeliveryMeta(
  fulfillments: Array<{ type: string; status: string; scheduledDate: Date }>,
): { deliveryRequired: boolean; deliveryDate: Date | null; deliveryStatus: string | null } {
  const deliveries = fulfillments.filter((item) => item.type === "DELIVERY");
  if (deliveries.length === 0) {
    return { deliveryRequired: false, deliveryDate: null, deliveryStatus: null };
  }
  const earliest = deliveries.reduce((acc, cur) => (cur.scheduledDate < acc ? cur.scheduledDate : acc), deliveries[0].scheduledDate);
  const allCompleted = deliveries.every((item) => item.status === "COMPLETED");
  const hasInProgress = deliveries.some((item) => item.status === "IN_PROGRESS");
  const hasScheduled = deliveries.some((item) => item.status === "SCHEDULED");
  let deliveryStatus: string = "PENDING";
  if (allCompleted) deliveryStatus = "DELIVERED";
  else if (hasInProgress) deliveryStatus = "IN_PROGRESS";
  else if (hasScheduled) deliveryStatus = "SCHEDULED";
  return {
    deliveryRequired: true,
    deliveryDate: earliest,
    deliveryStatus,
  };
}

export async function buildCustomerOrderMetrics(customerId: string) {
  const orders = await prisma.salesOrder.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      total: true,
      specialOrder: true,
      invoices: {
        where: { status: { not: "void" } },
        select: { id: true },
      },
      fulfillments: {
        select: { type: true, status: true, scheduledDate: true },
      },
    },
  });

  const orderIds = orders.map((item) => item.id);
  const invoiceIds = orders.flatMap((item) => item.invoices.map((invoice) => invoice.id));

  const [invoicePaymentGroup, legacyPaymentGroup] = await Promise.all([
    invoiceIds.length
      ? prisma.salesOrderPayment.groupBy({
          by: ["invoiceId"],
          where: { status: "POSTED", invoiceId: { in: invoiceIds } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.salesOrderPayment.groupBy({
          by: ["salesOrderId"],
          where: { status: "POSTED", invoiceId: null, salesOrderId: { in: orderIds } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const paidByInvoiceId = new Map<string, number>();
  for (const row of invoicePaymentGroup) {
    if (!row.invoiceId) continue;
    paidByInvoiceId.set(row.invoiceId, Number(row._sum.amount ?? 0));
  }
  const legacyByOrderId = new Map<string, number>();
  for (const row of legacyPaymentGroup) {
    legacyByOrderId.set(row.salesOrderId, Number(row._sum.amount ?? 0));
  }

  const rows: CustomerOrderRow[] = orders.map((order) => {
    const paidByInvoice = order.invoices.reduce(
      (sum, invoice) => sum + (paidByInvoiceId.get(invoice.id) ?? 0),
      0,
    );
    const legacyPaid = legacyByOrderId.get(order.id) ?? 0;
    const paidTotal = round2(paidByInvoice + legacyPaid);
    const total = round2(Number(order.total));
    const balance = round2(Math.max(total - paidTotal, 0));
    const delivery = computeDeliveryMeta(order.fulfillments);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      total,
      paidTotal,
      balance,
      deliveryRequired: delivery.deliveryRequired,
      deliveryDate: delivery.deliveryDate,
      deliveryStatus: delivery.deliveryStatus,
      isSpecialOrder: Boolean(order.specialOrder),
    };
  });

  const summary: CustomerOrderSummary = {
    totalOrders: rows.length,
    openOrders: rows.filter((row) => isOpenStatus(row.status)).length,
    unpaidBalance: round2(rows.reduce((sum, row) => sum + row.balance, 0)),
    lastOrderDate: rows[0]?.createdAt ?? null,
    pendingDeliveryCount: rows.filter(
      (row) => row.deliveryRequired && row.deliveryStatus !== "DELIVERED",
    ).length,
    specialOrderCount: rows.filter((row) => row.isSpecialOrder).length,
    unpaidCount: rows.filter((row) => row.balance > 0).length,
  };

  return { rows, summary };
}

export function filterCustomerOrders(rows: CustomerOrderRow[], filter: CustomerOrderFilter) {
  if (filter === "OPEN") return rows.filter((row) => isOpenStatus(row.status));
  if (filter === "UNPAID") return rows.filter((row) => row.balance > 0);
  if (filter === "PENDING_DELIVERY") {
    return rows.filter((row) => row.deliveryRequired && row.deliveryStatus !== "DELIVERED");
  }
  if (filter === "SPECIAL_ORDER") return rows.filter((row) => row.isSpecialOrder);
  return rows;
}
