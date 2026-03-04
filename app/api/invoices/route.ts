import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus, generateNextInvoiceNumber } from "@/lib/invoices";
import { generateNextSalesOrderNumber } from "@/lib/sales-orders";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getDefaultTaxRate } from "@/lib/settings";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type ManualInvoiceItem = {
  variantId: string | null;
  skuSnapshot: string | null;
  titleSnapshot: string;
  description: string | null;
  uomSnapshot: string;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
};

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") ?? "").trim().toLowerCase();
    const customer = String(searchParams.get("customer") ?? "").trim();
    const search = String(searchParams.get("search") ?? "").trim();
    const startDate = String(searchParams.get("startDate") ?? "").trim();
    const endDate = String(searchParams.get("endDate") ?? "").trim();
    const salesOrderId = String(searchParams.get("salesOrderId") ?? "").trim();

    const where: any = {
      ...(status ? { status } : {}),
      ...(salesOrderId ? { salesOrderId } : {}),
      ...(customer
        ? {
            customer: {
              is: {
                name: { contains: customer },
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search } },
              { salesOrder: { is: { orderNumber: { contains: search } } } },
              { customer: { is: { name: { contains: search } } } },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            issueDate: {
              ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
              ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        salesOrder: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const invoiceIds = invoices.map((it) => it.id);
    const salesOrderIds = Array.from(new Set(invoices.map((it) => it.salesOrderId).filter(Boolean))) as string[];
    const postedPayments = invoiceIds.length
      ? await prisma.salesOrderPayment.findMany({
          where: {
            invoiceId: { in: invoiceIds },
            status: "POSTED",
          },
          select: { invoiceId: true, amount: true },
        })
      : [];
    const postedPaymentsBySalesOrder = salesOrderIds.length
      ? await prisma.salesOrderPayment.findMany({
          where: {
            salesOrderId: { in: salesOrderIds },
            status: "POSTED",
          },
          select: { salesOrderId: true, amount: true },
        })
      : [];

    const paidByInvoice = new Map<string, number>();
    for (const payment of postedPayments) {
      const prev = paidByInvoice.get(payment.invoiceId ?? "") ?? 0;
      paidByInvoice.set(payment.invoiceId ?? "", roundCurrency(prev + Number(payment.amount)));
    }
    const paidBySalesOrder = new Map<string, number>();
    for (const payment of postedPaymentsBySalesOrder) {
      const prev = paidBySalesOrder.get(payment.salesOrderId) ?? 0;
      paidBySalesOrder.set(payment.salesOrderId, roundCurrency(prev + Number(payment.amount)));
    }

    const data = invoices.map((invoice) => {
      const directPaid = roundCurrency(paidByInvoice.get(invoice.id) ?? 0);
      const paidTotal =
        directPaid > 0
          ? directPaid
          : roundCurrency(
              invoice.salesOrderId ? (paidBySalesOrder.get(invoice.salesOrderId) ?? 0) : 0,
            );
      const total = Number(invoice.total);
      const balanceDue = roundCurrency(total - paidTotal);
      const effectiveStatus = deriveInvoiceStatus(invoice.status, paidTotal, total);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        salesOrderId: invoice.salesOrderId,
        salesOrderNumber: invoice.salesOrder?.orderNumber ?? null,
        customer: invoice.customer,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: effectiveStatus,
        taxRate: invoice.taxRate != null ? Number(invoice.taxRate) : null,
        total: String(invoice.total),
        paidTotal: String(paidTotal),
        balanceDue: String(balanceDue),
      };
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const payload = await request.json();
    const customerId = String(payload?.customerId ?? "").trim();
    const notes = String(payload?.notes ?? "").trim() || null;
    const issueDateRaw = String(payload?.issueDate ?? "").trim();
    const dueDateRaw = String(payload?.dueDate ?? "").trim();
    const requestedTaxRate =
      payload?.taxRate === null || payload?.taxRate === undefined || payload?.taxRate === ""
        ? null
        : Number(payload?.taxRate);
    const issueDate = issueDateRaw ? new Date(issueDateRaw) : new Date();
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    const inputItems = Array.isArray(payload?.items) ? payload.items : [];

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required." }, { status: 400 });
    }
    if (inputItems.length === 0) {
      return NextResponse.json({ error: "At least one invoice item is required." }, { status: 400 });
    }
    if (Number.isNaN(issueDate.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) {
      return NextResponse.json({ error: "Invalid issue/due date." }, { status: 400 });
    }
    if (requestedTaxRate !== null && (!Number.isFinite(requestedTaxRate) || requestedTaxRate < 0)) {
      return NextResponse.json({ error: "Tax rate must be a non-negative number." }, { status: 400 });
    }

    const normalizedItems: ManualInvoiceItem[] = inputItems.map((item: any, idx: number) => {
      const qty = Number(item?.qty ?? item?.quantity ?? 0);
      const unitPrice = Number(item?.unitPrice ?? 0);
      const discount = Number(item?.discount ?? item?.lineDiscount ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`ITEM_QTY_INVALID:${idx + 1}`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`ITEM_UNIT_PRICE_INVALID:${idx + 1}`);
      if (!Number.isFinite(discount) || discount < 0) throw new Error(`ITEM_DISCOUNT_INVALID:${idx + 1}`);
      const lineTotal = roundCurrency(qty * unitPrice - discount);
      return {
        variantId: item?.variantId ? String(item.variantId) : null,
        skuSnapshot: String(item?.skuSnapshot ?? item?.sku ?? "").trim() || null,
        titleSnapshot: String(item?.titleSnapshot ?? item?.title ?? `Item ${idx + 1}`).trim(),
        description: String(item?.description ?? "").trim() || null,
        uomSnapshot: String(item?.uomSnapshot ?? "PIECE").trim().toUpperCase(),
        qty,
        unitPrice,
        discount,
        lineTotal,
      };
    });

    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.salesCustomer.findUnique({
        where: { id: customerId },
        select: { id: true, address: true, taxExempt: true, taxRate: true },
      });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

      const invoiceNumber = await generateNextInvoiceNumber(tx);
      const orderNumber = await generateNextSalesOrderNumber(tx, "SALES_ORDER");
      const subtotal = roundCurrency(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const defaultTaxRate = await getDefaultTaxRate(tx);
      const resolvedTaxRate = customer.taxExempt
        ? 0
        : requestedTaxRate ??
          (customer.taxRate != null ? Number(customer.taxRate) : defaultTaxRate);
      const taxAmount = roundCurrency((subtotal * resolvedTaxRate) / 100);
      const total = roundCurrency(subtotal + taxAmount);
      const salesOrder = await tx.salesOrder.create({
        data: {
          orderNumber,
          customerId,
          docType: "SALES_ORDER",
          status: "DRAFT",
          discount: 0,
          taxRate: resolvedTaxRate,
          tax: taxAmount,
          subtotal,
          total,
          paidAmount: 0,
          balanceDue: total,
          paymentStatus: "unpaid",
          hidePrices: false,
          depositRequired: 0,
          commissionRate: 0,
          commissionAmount: 0,
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          salesOrderId: salesOrder.id,
          customerId,
          issueDate,
          dueDate,
          status: "draft",
          subtotal,
          taxRate: resolvedTaxRate,
          taxAmount,
          total,
          billingAddress: customer.address ?? null,
          notes,
        },
      });

      await tx.invoiceItem.createMany({
        data: normalizedItems.map((item) => ({
          invoiceId: invoice.id,
          variantId: item.variantId,
          skuSnapshot: item.skuSnapshot ?? "",
          titleSnapshot: item.titleSnapshot,
          description: item.description,
          uomSnapshot: item.uomSnapshot,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal: item.lineTotal,
        })),
      });

      return tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { items: { orderBy: { createdAt: "asc" } }, customer: true },
      });
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("ITEM_QTY_INVALID:")) {
      const row = error.message.split(":")[1] ?? "?";
      return NextResponse.json({ error: `Item ${row}: qty must be greater than 0.` }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("ITEM_UNIT_PRICE_INVALID:")) {
      const row = error.message.split(":")[1] ?? "?";
      return NextResponse.json({ error: `Item ${row}: unitPrice must be >= 0.` }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("ITEM_DISCOUNT_INVALID:")) {
      const row = error.message.split(":")[1] ?? "?";
      return NextResponse.json({ error: `Item ${row}: discount must be >= 0.` }, { status: 400 });
    }
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to create invoice." }, { status: 500 });
  }
}
