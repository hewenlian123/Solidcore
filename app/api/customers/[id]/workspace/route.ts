import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoices";
import { sumSignedPaymentAmount } from "@/lib/payment-ledger";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { buildCustomerOrderMetrics } from "@/lib/customers/customer-order-metrics";

type Params = {
  params: Promise<{ id: string }>;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;

    const customer = await prisma.salesCustomer.findUnique({
      where: { id },
      include: {
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        jobSites: {
          include: {
            contact: {
              select: { id: true, name: true, phone: true, email: true },
            },
          },
          orderBy: [{ active: "desc" }, { createdAt: "asc" }],
        },
        followUps: {
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
          take: 50,
        },
        customerNotes: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        aliases: {
          orderBy: [{ kind: "asc" }, { value: "asc" }],
        },
        mergedCustomers: {
          orderBy: { mergedAt: "desc" },
          select: {
            id: true,
            name: true,
            companyName: true,
            mergedAt: true,
            mergedBy: true,
            mergeReason: true,
          },
        },
        lifecycleEvents: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            sourceCustomer: {
              select: { id: true, name: true, companyName: true },
            },
          },
        },
      },
    });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 },
      );
    }
    if (customer.mergedIntoId) {
      return NextResponse.json(
        {
          code: "CUSTOMER_MERGED",
          error: "This customer was merged into another customer.",
          redirectCustomerId: customer.mergedIntoId,
        },
        { status: 409 },
      );
    }

    const customerIds = [
      customer.id,
      ...customer.mergedCustomers.map((item) => item.id),
    ];
    const [orderMetrics, invoices, payments, returns] = await Promise.all([
      buildCustomerOrderMetrics(customerIds),
      prisma.invoice.findMany({
        where: { customerId: { in: customerIds } },
        orderBy: { issueDate: "desc" },
        take: 50,
      }),
      prisma.salesOrderPayment.findMany({
        where: { salesOrder: { customerId: { in: customerIds } } },
        include: {
          salesOrder: { select: { orderNumber: true } },
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: 100,
      }),
      prisma.afterSalesReturn.findMany({
        where: { customerId: { in: customerIds } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    const postedByInvoice = new Map<string, typeof payments>();
    for (const payment of payments) {
      if (payment.status !== "POSTED" || !payment.invoiceId) continue;
      const rows = postedByInvoice.get(payment.invoiceId) ?? [];
      rows.push(payment);
      postedByInvoice.set(payment.invoiceId, rows);
    }
    const invoiceRows = invoices.map((invoice) => {
      const paid = roundCurrency(
        sumSignedPaymentAmount(postedByInvoice.get(invoice.id) ?? []),
      );
      const total = Number(invoice.total);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        salesOrderId: invoice.salesOrderId,
        status: deriveInvoiceStatus(invoice.status, paid, total),
        issueDate: invoice.issueDate,
        total,
        paid,
        balance: roundCurrency(total - paid),
      };
    });

    const activity = [
      ...customer.customerNotes.map((note) => ({
        id: `note-${note.id}`,
        kind: "NOTE",
        title: "Activity note",
        detail: note.note,
        actor: note.createdBy,
        occurredAt: note.createdAt,
        href: null,
      })),
      ...customer.followUps.map((followUp) => ({
        id: `follow-up-${followUp.id}`,
        kind: "FOLLOW_UP",
        title:
          followUp.status === "OPEN"
            ? `Follow-Up due for ${followUp.owner}`
            : `Follow-Up ${followUp.status.toLowerCase()}`,
        detail:
          followUp.status === "COMPLETED"
            ? followUp.completionNote || followUp.nextAction
            : followUp.nextAction,
        actor: followUp.createdBy,
        occurredAt: followUp.createdAt,
        href: null,
      })),
      ...customer.lifecycleEvents.map((event) => ({
        id: `lifecycle-${event.id}`,
        kind: event.action,
        title:
          event.action === "MERGED"
            ? `Merged ${event.sourceCustomer?.companyName || event.sourceCustomer?.name || "customer record"}`
            : `Customer ${event.action.toLowerCase()}`,
        detail: event.reason,
        actor: event.actor,
        occurredAt: event.createdAt,
        href: event.sourceCustomerId
          ? `/customers/${event.sourceCustomerId}`
          : null,
      })),
      ...orderMetrics.rows.map((order) => ({
        id: `order-${order.id}`,
        kind: "ORDER",
        title: `${order.orderNumber} · ${order.status}`,
        detail: `${roundCurrency(order.total).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })} total`,
        actor: null,
        occurredAt: order.createdAt,
        href: `/orders/${order.id}`,
      })),
      ...invoiceRows.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        kind: "INVOICE",
        title: `${invoice.invoiceNumber} · ${invoice.status}`,
        detail: `${roundCurrency(invoice.balance).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })} balance`,
        actor: null,
        occurredAt: invoice.issueDate,
        href: `/invoices/${invoice.id}`,
      })),
      ...payments.map((payment) => ({
        id: `payment-${payment.id}`,
        kind: payment.paymentType === "REFUND" ? "REFUND" : "PAYMENT",
        title: `${payment.paymentType} · ${payment.status}`,
        detail: `${Number(payment.amount).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })} · ${payment.method} · ${payment.salesOrder.orderNumber}`,
        actor: null,
        occurredAt: payment.receivedAt,
        href: payment.invoiceId ? `/invoices/${payment.invoiceId}` : null,
      })),
      ...returns.map((item) => ({
        id: `return-${item.id}`,
        kind: "RETURN",
        title: `${item.returnNumber} · ${item.status}`,
        detail: `${Number(item.refundTotal).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })} refund position`,
        actor: null,
        occurredAt: item.createdAt,
        href: `/after-sales/returns/${item.id}`,
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )
      .slice(0, 100);

    return NextResponse.json(
      {
        data: {
          profile: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            installAddress: customer.address,
            billingAddress: customer.billingAddress,
            city: customer.city,
            state: customer.state,
            zipCode: customer.zipCode,
            companyName: customer.companyName,
            customerType: customer.customerType,
            taxExempt: customer.taxExempt,
            taxRate: customer.taxRate != null ? Number(customer.taxRate) : null,
            referredBy: customer.referredBy,
            notes: customer.notes,
            archivedAt: customer.archivedAt,
            createdAt: customer.createdAt,
          },
          summary: orderMetrics.summary,
          contacts: customer.contacts,
          jobSites: customer.jobSites,
          followUps: customer.followUps,
          orders: orderMetrics.rows,
          invoices: invoiceRows,
          payments: payments.map((payment) => ({
            id: payment.id,
            amount: Number(payment.amount),
            method: payment.method,
            paymentType: payment.paymentType,
            status: payment.status,
            referenceNumber: payment.referenceNumber,
            receivedAt: payment.receivedAt,
            orderNumber: payment.salesOrder.orderNumber,
            invoiceNumber: payment.invoice?.invoiceNumber ?? null,
            invoiceId: payment.invoiceId,
          })),
          aliases: customer.aliases,
          mergedCustomers: customer.mergedCustomers,
          activity,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/customers/[id]/workspace error:", error);
    return NextResponse.json(
      { error: "Failed to load customer workspace." },
      { status: 500 },
    );
  }
}
