import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAfterSalesReturnPDF } from "@/lib/pdf/generateAfterSalesReturnPDF";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const record = await prisma.afterSalesReturn.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        salesOrder: { select: { orderNumber: true } },
        invoice: { select: { invoiceNumber: true } },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            title: true,
            sku: true,
            qtyReturn: true,
            unitPrice: true,
            lineRefund: true,
          },
        },
      },
    });
    if (!record) return NextResponse.json({ error: "Return not found." }, { status: 404 });

    const bytes = await generateAfterSalesReturnPDF({
      returnNumber: record.returnNumber,
      createdAt: record.createdAt,
      customerName: record.customer.name,
      customerPhone: record.customer.phone,
      customerEmail: record.customer.email,
      salesOrderNumber: record.salesOrder?.orderNumber ?? null,
      invoiceNumber: record.invoice?.invoiceNumber ?? null,
      refundMethod: record.refundMethod,
      refundTotal: Number(record.refundTotal ?? 0),
      notes: record.notes ?? null,
      items: record.items.map((item) => ({
        title: item.title,
        sku: item.sku,
        qtyReturn: Number(item.qtyReturn ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        lineRefund: Number(item.lineRefund ?? 0),
      })),
    });

    const url = `/api/after-sales/returns/${id}/pdf?download=true`;
    await prisma.afterSalesReturn.update({
      where: { id },
      data: { pdfUrl: url },
    });

    return NextResponse.json(
      {
        data: {
          url,
          size: bytes.length,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/after-sales/returns/[id]/pdf error:", error);
    return NextResponse.json({ error: "Failed to generate return PDF." }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const record = await prisma.afterSalesReturn.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        salesOrder: { select: { orderNumber: true } },
        invoice: { select: { invoiceNumber: true } },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            title: true,
            sku: true,
            qtyReturn: true,
            unitPrice: true,
            lineRefund: true,
          },
        },
      },
    });
    if (!record) return NextResponse.json({ error: "Return not found." }, { status: 404 });

    const bytes = await generateAfterSalesReturnPDF({
      returnNumber: record.returnNumber,
      createdAt: record.createdAt,
      customerName: record.customer.name,
      customerPhone: record.customer.phone,
      customerEmail: record.customer.email,
      salesOrderNumber: record.salesOrder?.orderNumber ?? null,
      invoiceNumber: record.invoice?.invoiceNumber ?? null,
      refundMethod: record.refundMethod,
      refundTotal: Number(record.refundTotal ?? 0),
      notes: record.notes ?? null,
      items: record.items.map((item) => ({
        title: item.title,
        sku: item.sku,
        qtyReturn: Number(item.qtyReturn ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        lineRefund: Number(item.lineRefund ?? 0),
      })),
    });

    const download = request.nextUrl.searchParams.get("download") === "true";
    const filename = `${record.returnNumber}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/after-sales/returns/[id]/pdf error:", error);
    return NextResponse.json({ error: "Failed to build return PDF." }, { status: 500 });
  }
}
