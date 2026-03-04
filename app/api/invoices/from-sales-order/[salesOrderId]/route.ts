import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNextInvoiceNumber } from "@/lib/invoices";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ salesOrderId: string }>;
};

const INVOICE_ELIGIBLE_SO_STATUSES = new Set(["CONFIRMED", "READY", "PARTIALLY_FULFILLED", "FULFILLED"]);

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { salesOrderId } = await params;
    if (!salesOrderId) {
      return NextResponse.json({ error: "Missing sales order id." }, { status: 400 });
    }

    const existing = await prisma.invoice.findFirst({
      where: { salesOrderId },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (existing) {
      const repaired = await prisma.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.findUnique({
          where: { id: salesOrderId },
          include: {
            items: true,
          },
        });
        if (!salesOrder) return existing;
        const existingItems = await tx.invoiceItem.findMany({
          where: { invoiceId: existing.id },
          orderBy: { createdAt: "asc" },
        });
        if (existingItems.length < salesOrder.items.length) {
          const missingItems = salesOrder.items.slice(existingItems.length);
          for (const item of missingItems) {
            const qty = Number(item.quantity ?? 0);
            const unitPrice = Number(item.unitPrice ?? 0);
            const discount = Number(item.lineDiscount ?? 0);
            const lineTotal = roundCurrency(qty * unitPrice - discount);
            await tx.invoiceItem.create({
              data: {
                invoiceId: existing.id,
                variantId: item.variantId,
                skuSnapshot: item.skuSnapshot ?? item.productSku ?? "",
                titleSnapshot: item.titleSnapshot ?? item.productTitle ?? item.lineDescription,
                description: item.description ?? (item.lineDescription || null),
                uomSnapshot: item.uomSnapshot,
                unitPrice: item.unitPrice,
                qty: item.quantity,
                discount: item.lineDiscount,
                lineTotal,
              },
            });
          }
          const subtotal = roundCurrency(
            salesOrder.items.reduce((sum, item) => {
              const qty = Number(item.quantity ?? 0);
              const unitPrice = Number(item.unitPrice ?? 0);
              const discount = Number(item.lineDiscount ?? 0);
              return sum + roundCurrency(qty * unitPrice - discount);
            }, 0),
          );
          const taxAmount = roundCurrency(Number(salesOrder.tax ?? 0));
          const total = roundCurrency(subtotal + taxAmount);
          await tx.invoice.update({
            where: { id: existing.id },
            data: { subtotal, taxRate: salesOrder.taxRate, taxAmount, total },
          });
        }
        const withItems = await tx.invoice.findUnique({
          where: { id: existing.id },
          include: {
            items: {
              orderBy: { createdAt: "asc" },
            },
          },
        });
        return withItems ?? existing;
      });
      return NextResponse.json({ data: { invoice: repaired, existed: true } }, { status: 200 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: {
          customer: {
            select: { id: true, address: true },
          },
          items: true,
        },
      });

      if (!salesOrder) throw new Error("NOT_FOUND");
      if (salesOrder.docType !== "SALES_ORDER") throw new Error("NOT_SALES_ORDER");
      if (!INVOICE_ELIGIBLE_SO_STATUSES.has(String(salesOrder.status ?? "").toUpperCase())) {
        throw new Error("INELIGIBLE_STATUS");
      }

      const invoiceNumber = await generateNextInvoiceNumber(tx);
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          salesOrderId: salesOrder.id,
          customerId: salesOrder.customerId,
          issueDate: new Date(),
          dueDate: null,
          status: "draft",
          subtotal: salesOrder.subtotal,
          taxRate: salesOrder.taxRate,
          taxAmount: salesOrder.tax,
          total: salesOrder.total,
          billingAddress: salesOrder.customer.address,
          notes: salesOrder.notes,
        },
      });

      let subtotal = 0;
      for (const item of salesOrder.items) {
        const qty = Number(item.quantity ?? 0);
        const unitPrice = Number(item.unitPrice ?? 0);
        const discount = Number(item.lineDiscount ?? 0);
        const lineTotal = roundCurrency(qty * unitPrice - discount);
        subtotal = roundCurrency(subtotal + lineTotal);
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            variantId: item.variantId,
            skuSnapshot: item.skuSnapshot ?? item.productSku ?? "",
            titleSnapshot: item.titleSnapshot ?? item.productTitle ?? item.lineDescription,
            description: item.description ?? (item.lineDescription || null),
            uomSnapshot: item.uomSnapshot,
            unitPrice: item.unitPrice,
            qty: item.quantity,
            discount: item.lineDiscount,
            lineTotal,
          },
        });
      }

      const taxAmount = roundCurrency(Number(salesOrder.tax ?? 0));
      const total = roundCurrency(subtotal + taxAmount);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal,
          taxRate: salesOrder.taxRate,
          taxAmount,
          total,
        },
      });

      const withItems = await tx.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!withItems) throw new Error("CREATE_FAILED");
      return withItems;
    });

    return NextResponse.json({ data: { invoice: created, existed: false } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "NOT_SALES_ORDER") {
      return NextResponse.json({ error: "Invoice can only be created from Sales Orders." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CREATE_FAILED") {
      return NextResponse.json({ error: "Failed to load created invoice." }, { status: 500 });
    }
    if (error instanceof Error && error.message === "INELIGIBLE_STATUS") {
      return NextResponse.json(
        { error: "Confirm the sales order to create an invoice." },
        { status: 400 },
      );
    }
    console.error("POST /api/invoices/from-sales-order/[salesOrderId] error:", error);
    return NextResponse.json({ error: "Failed to create invoice from sales order." }, { status: 500 });
  }
}
