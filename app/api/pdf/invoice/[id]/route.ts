import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { generateInvoicePDF } from "@/lib/pdf/generateInvoicePDF";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      salesOrder: { select: { id: true, orderNumber: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          variant: {
            select: {
              sku: true,
              width: true,
              height: true,
              color: true,
              glassTypeOverride: true,
              glassFinishOverride: true,
              screenOverride: true,
              openingTypeOverride: true,
              product: {
                select: {
                  name: true,
                  glassTypeDefault: true,
                  glassFinishDefault: true,
                  screenDefault: true,
                  openingTypeDefault: true,
                },
              },
            },
          },
        },
      },
      payments: {
        where: { status: "POSTED" },
        select: { amount: true },
      },
    },
  });
  if (!invoice) {
    return new Response("Invoice not found", { status: 404 });
  }

  const paidTotal = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(invoice.total);
  const pdfBytes = await generateInvoicePDF({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    customerName: invoice.customer?.name ?? "-",
    customerPhone: invoice.customer?.phone ?? null,
    customerEmail: invoice.customer?.email ?? null,
    customerAddress: invoice.customer?.address ?? null,
    salesOrderNumber: invoice.salesOrder?.orderNumber ?? null,
    items: invoice.items.map((item) => ({
      sku: item.skuSnapshot,
      title: item.titleSnapshot ?? "-",
      description: item.description ?? "",
      productName: item.variant?.product?.name ?? null,
      width: item.variant?.width != null ? Number(item.variant.width) : null,
      height: item.variant?.height != null ? Number(item.variant.height) : null,
      color: item.variant?.color ?? null,
      glassTypeDefault: item.variant?.product?.glassTypeDefault ?? null,
      glassFinishDefault: item.variant?.product?.glassFinishDefault ?? null,
      screenDefault: item.variant?.product?.screenDefault ?? null,
      openingTypeDefault: item.variant?.product?.openingTypeDefault ?? null,
      glassTypeOverride: item.variant?.glassTypeOverride ?? null,
      glassFinishOverride: item.variant?.glassFinishOverride ?? null,
      screenOverride: item.variant?.screenOverride ?? null,
      openingTypeOverride: item.variant?.openingTypeOverride ?? null,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    total,
    paidTotal,
    balanceDue: Math.max(total - paidTotal, 0),
    notes: invoice.notes,
  });

  const { searchParams } = new URL(request.url);
  const asDownload = searchParams.get("download") === "true";
  const disposition = asDownload ? "attachment" : "inline";
  const pdfBody = new Uint8Array(pdfBytes).buffer;
  return new Response(pdfBody, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename=invoice-${invoice.invoiceNumber}.pdf`,
    },
  });
}
