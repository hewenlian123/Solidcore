import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type ReturnPdfItem = {
  title: string;
  sku: string | null;
  qtyReturn: number;
  unitPrice: number;
  lineRefund: number;
};

type ReturnPdfPayload = {
  returnNumber: string;
  createdAt: Date;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  salesOrderNumber: string | null;
  invoiceNumber: string | null;
  refundMethod: string;
  refundTotal: number;
  notes: string | null;
  items: ReturnPdfItem[];
};

export async function generateAfterSalesReturnPDF(payload: ReturnPdfPayload) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  let y = height - 36;
  page.drawText("Solidcore - Return Receipt", {
    x: 32,
    y,
    size: 16,
    font: bold,
    color: rgb(0.12, 0.16, 0.22),
  });
  y -= 22;
  page.drawText(
    `Return #: ${payload.returnNumber}    Date: ${payload.createdAt.toLocaleDateString("en-US", {
      timeZone: "UTC",
    })}`,
    {
      x: 32,
      y,
      size: 10,
      font,
      color: rgb(0.22, 0.27, 0.33),
    },
  );
  y -= 16;
  page.drawText(`Customer: ${payload.customerName}`, { x: 32, y, size: 10, font });
  y -= 14;
  page.drawText(
    `Phone: ${payload.customerPhone || "-"}    Email: ${payload.customerEmail || "-"}`,
    { x: 32, y, size: 9, font, color: rgb(0.3, 0.36, 0.44) },
  );
  y -= 16;
  page.drawText(`Linked SO: ${payload.salesOrderNumber || "-"}    Linked Invoice: ${payload.invoiceNumber || "-"}`, {
    x: 32,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.36, 0.44),
  });

  y -= 24;
  const tableX = 32;
  const col = { title: 250, sku: 120, qty: 80, unit: 90, refund: 110 };
  page.drawRectangle({
    x: tableX,
    y: y - 4,
    width: width - 64,
    height: 18,
    color: rgb(0.94, 0.96, 0.98),
  });
  page.drawText("Title", { x: tableX + 6, y, size: 9, font: bold });
  page.drawText("SKU", { x: tableX + col.title + 6, y, size: 9, font: bold });
  page.drawText("Qty Return", { x: tableX + col.title + col.sku + 6, y, size: 9, font: bold });
  page.drawText("Unit Price", { x: tableX + col.title + col.sku + col.qty + 6, y, size: 9, font: bold });
  page.drawText("Line Refund", { x: tableX + col.title + col.sku + col.qty + col.unit + 6, y, size: 9, font: bold });

  y -= 18;
  for (const item of payload.items) {
    if (y < 72) break;
    page.drawText(String(item.title || "-").slice(0, 44), { x: tableX + 6, y, size: 9, font });
    page.drawText(String(item.sku || "-").slice(0, 18), { x: tableX + col.title + 6, y, size: 9, font });
    page.drawText(Number(item.qtyReturn || 0).toFixed(2), { x: tableX + col.title + col.sku + 6, y, size: 9, font });
    page.drawText(`$${Number(item.unitPrice || 0).toFixed(2)}`, {
      x: tableX + col.title + col.sku + col.qty + 6,
      y,
      size: 9,
      font,
    });
    page.drawText(`$${Number(item.lineRefund || 0).toFixed(2)}`, {
      x: tableX + col.title + col.sku + col.qty + col.unit + 6,
      y,
      size: 9,
      font,
    });
    y -= 14;
  }

  y -= 10;
  page.drawText(`Refund Method: ${payload.refundMethod}`, { x: 32, y, size: 10, font: bold });
  y -= 14;
  page.drawText(`Refund Total: $${Number(payload.refundTotal || 0).toFixed(2)}`, { x: 32, y, size: 10, font: bold });
  y -= 18;
  page.drawText(`Notes: ${payload.notes || "-"}`, {
    x: 32,
    y,
    size: 9,
    font,
    color: rgb(0.3, 0.36, 0.44),
  });

  return pdf.save();
}
