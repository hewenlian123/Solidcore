import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveInvoiceStatus } from "@/lib/invoices";
import { calculateAvailable } from "@/lib/inventory-availability";
import { sumSignedPaymentAmount } from "@/lib/payment-ledger";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

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
    if (!id)
      return NextResponse.json(
        { error: "Missing invoice id." },
        { status: 400 },
      );

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: {
          select: { id: true, orderNumber: true, depositRequired: true },
        },
        items: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                width: true,
                height: true,
                color: true,
                displayName: true,
                glassTypeOverride: true,
                slidingConfigOverride: true,
                glassCoatingOverride: true,
                glassThicknessMmOverride: true,
                glassFinishOverride: true,
                screenOverride: true,
                openingTypeOverride: true,
                product: {
                  select: {
                    frameMaterialDefault: true,
                    openingTypeDefault: true,
                    slidingConfigDefault: true,
                    glassTypeDefault: true,
                    glassCoatingDefault: true,
                    glassThicknessMmDefault: true,
                    glassFinishDefault: true,
                    screenDefault: true,
                    flooringMaterial: true,
                    flooringWearLayer: true,
                    flooringThicknessMm: true,
                    flooringPlankLengthIn: true,
                    flooringPlankWidthIn: true,
                    flooringCoreThicknessMm: true,
                    flooringInstallation: true,
                    flooringUnderlayment: true,
                    flooringUnderlaymentType: true,
                    flooringUnderlaymentMm: true,
                    flooringBoxCoverageSqft: true,
                  },
                },
                inventoryStock: {
                  select: { onHand: true, reserved: true, hold: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!invoice)
      return NextResponse.json(
        { error: "Invoice not found." },
        { status: 404 },
      );

    const [invoicePayments, unallocatedPayments] = await Promise.all([
      prisma.salesOrderPayment.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { receivedAt: "desc" },
      }),
      prisma.salesOrderPayment.findMany({
        where: {
          salesOrderId: invoice.salesOrderId,
          invoiceId: null,
          status: "POSTED",
        },
        orderBy: { receivedAt: "desc" },
      }),
    ]);
    const paidTotal = roundCurrency(sumSignedPaymentAmount(invoicePayments));
    const grossPaidTotal = roundCurrency(
      invoicePayments
        .filter(
          (payment) =>
            payment.status === "POSTED" && payment.paymentType !== "REFUND",
        )
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
    );
    const refundedTotal = roundCurrency(
      invoicePayments
        .filter(
          (payment) =>
            payment.status === "POSTED" && payment.paymentType === "REFUND",
        )
        .reduce((sum, payment) => sum + Math.abs(Number(payment.amount)), 0),
    );
    const depositPaid = roundCurrency(
      invoicePayments
        .filter(
          (payment) =>
            payment.status === "POSTED" && payment.paymentType === "DEPOSIT",
        )
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
    );
    const unallocatedPaymentTotal = roundCurrency(
      sumSignedPaymentAmount(unallocatedPayments),
    );
    const total = Number(invoice.total);
    const balanceDue = roundCurrency(total - paidTotal);
    const effectiveStatus = deriveInvoiceStatus(
      invoice.status,
      paidTotal,
      total,
    );

    return NextResponse.json(
      {
        data: {
          ...invoice,
          taxRate: invoice.taxRate != null ? Number(invoice.taxRate) : null,
          items: invoice.items.map((item) => ({
            ...item,
            available: item.variant?.inventoryStock
              ? calculateAvailable(item.variant.inventoryStock)
              : null,
          })),
          status: effectiveStatus,
          payments: invoicePayments,
          unallocatedPayments,
          unallocatedPaymentTotal: String(unallocatedPaymentTotal),
          originalTotal: String(
            roundCurrency(
              Number(invoice.total) + Number(invoice.discountAmount),
            ),
          ),
          commercialReduction: String(
            roundCurrency(Number(invoice.discountAmount)),
          ),
          requiredDeposit: String(
            Number(invoice.salesOrder?.depositRequired ?? 0),
          ),
          depositPaid: String(depositPaid),
          grossPaidTotal: String(grossPaidTotal),
          refundedTotal: String(refundedTotal),
          paidTotal: String(paidTotal),
          balanceDue: String(balanceDue),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/invoices/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    if (!id)
      return NextResponse.json(
        { error: "Missing invoice id." },
        { status: 400 },
      );

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!invoice)
      return NextResponse.json(
        { error: "Invoice not found." },
        { status: 404 },
      );

    const postedPaymentCount = await prisma.salesOrderPayment.count({
      where: { invoiceId: id, status: "POSTED" },
    });
    if (postedPaymentCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete invoice with posted payments. Void payments first.",
        },
        { status: 400 },
      );
    }
    if (String(invoice.status).toLowerCase() !== "draft") {
      return NextResponse.json(
        {
          error:
            "Issued invoices are immutable. Void the invoice or use linked financial events instead.",
        },
        { status: 409 },
      );
    }

    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ data: { id } }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/invoices/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete invoice." },
      { status: 500 },
    );
  }
}
