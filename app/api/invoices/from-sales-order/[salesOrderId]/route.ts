import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNextInvoiceNumber } from "@/lib/invoices";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ salesOrderId: string }>;
};

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
      return NextResponse.json({ data: { invoice: existing, existed: true } }, { status: 200 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: {
          customer: {
            select: { id: true, address: true },
          },
          items: {
            select: {
              variantId: true,
              skuSnapshot: true,
              titleSnapshot: true,
              uomSnapshot: true,
              productSku: true,
              productTitle: true,
              description: true,
              lineDescription: true,
              unitPrice: true,
              quantity: true,
              lineDiscount: true,
              lineTotal: true,
            },
          },
        },
      });

      if (!salesOrder) throw new Error("NOT_FOUND");
      if (salesOrder.docType !== "SALES_ORDER") throw new Error("NOT_SALES_ORDER");

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
          taxAmount: salesOrder.tax,
          total: salesOrder.total,
          billingAddress: salesOrder.customer.address,
          notes: salesOrder.notes,
        },
      });

      if (salesOrder.items.length > 0) {
        await tx.invoiceItem.createMany({
          data: salesOrder.items.map((item) => ({
            invoiceId: invoice.id,
            variantId: item.variantId,
            skuSnapshot: item.skuSnapshot ?? item.productSku ?? "",
            titleSnapshot: item.titleSnapshot ?? item.productTitle ?? item.lineDescription,
            description: item.description ?? (item.lineDescription || null),
            uomSnapshot: item.uomSnapshot,
            unitPrice: item.unitPrice,
            qty: item.quantity,
            discount: item.lineDiscount,
            lineTotal: item.lineTotal,
          })),
        });
      }

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
    console.error("POST /api/invoices/from-sales-order/[salesOrderId] error:", error);
    return NextResponse.json({ error: "Failed to create invoice from sales order." }, { status: 500 });
  }
}
