import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { COMPANY_SETTINGS } from "@/lib/company-settings";

type FulfillmentPdfType = "pick" | "slip";

type FulfillmentPdfData = {
  type: FulfillmentPdfType;
  fulfillmentId: string;
  salesOrderNumber: string;
  generatedAt: string | Date;
  fulfillmentType: "DELIVERY" | "PICKUP";
  customerName: string;
  customerPhone?: string | null;
  scheduledAt?: string | Date | null;
  timeWindow?: string | null;
  driverName?: string | null;
  pickupContact?: string | null;
  address?: string | null;
  notes?: string | null;
  items: Array<{
    title: string;
    sku?: string | null;
    orderedQty: number;
    fulfilledQty: number;
    unit?: string | null;
  }>;
};

function fmtDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function fmtDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fitText(text: string, max: number, font: any, size: number) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  if (font.widthOfTextAtSize(value, size) <= max) return value;
  let out = value;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > max) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

export async function generateFulfillmentPDF(data: FulfillmentPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage(PageSizes.Letter);
  let y = pageHeight - margin;

  const drawAccent = (target: typeof page) => {
    target.drawRectangle({
      x: 0,
      y: pageHeight - 5,
      width: pageWidth,
      height: 5,
      color: rgb(0.22, 0.24, 0.27),
    });
  };

  const drawText = (text: string, x: number, size = 10, bold = false, color = rgb(0.14, 0.15, 0.18)) => {
    page.drawText(String(text ?? ""), {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  const drawRight = (text: string, rightX: number, size = 10, bold = false) => {
    const active = bold ? fontBold : font;
    const width = active.widthOfTextAtSize(text, size);
    drawText(text, rightX - width, size, bold);
  };

  const drawSectionHeader = (label: string) => {
    page.drawRectangle({
      x: margin,
      y: y - 14,
      width: contentWidth,
      height: 16,
      color: rgb(0.95, 0.95, 0.95),
    });
    drawText(label, margin + 6, 9, true, rgb(0.24, 0.26, 0.3));
    y -= 22;
  };

  const newPage = () => {
    page = pdfDoc.addPage(PageSizes.Letter);
    drawAccent(page);
    y = pageHeight - margin;
  };

  const ensureSpace = (need: number) => {
    if (y - need > margin + 24) return;
    newPage();
  };

  const title = data.type === "pick" ? "PICK LIST" : data.fulfillmentType === "DELIVERY" ? "DELIVERY SLIP" : "PICKUP SLIP";

  drawAccent(page);
  drawText(COMPANY_SETTINGS.name, margin, 18, true);
  y -= 16;
  drawText(COMPANY_SETTINGS.address, margin, 9, false, rgb(0.45, 0.47, 0.52));
  y -= 12;
  drawText(`${COMPANY_SETTINGS.phone} / ${COMPANY_SETTINGS.email}`, margin, 9, false, rgb(0.45, 0.47, 0.52));

  const titleWidth = fontBold.widthOfTextAtSize(title, 22);
  page.drawText(title, {
    x: pageWidth - margin - titleWidth,
    y: pageHeight - margin + 2,
    size: 22,
    font: fontBold,
    color: rgb(0.16, 0.17, 0.2),
  });

  y = pageHeight - margin - 42;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.8,
    color: rgb(0.85, 0.86, 0.9),
  });
  y -= 18;

  drawText(`Fulfillment #: ${data.fulfillmentId}`, margin, 10, true);
  drawText(`Sales Order #: ${data.salesOrderNumber}`, margin + 220, 10, true);
  y -= 14;
  drawText(`Date: ${fmtDate(data.generatedAt)}`, margin, 10);
  drawText(`Type: ${data.fulfillmentType === "DELIVERY" ? "Delivery" : "Pickup"}`, margin + 220, 10);
  y -= 14;
  drawText(`Customer: ${data.customerName || "-"}`, margin, 10);
  drawText(`Phone: ${data.customerPhone || "-"}`, margin + 220, 10);
  y -= 14;
  drawText(`Scheduled: ${fmtDateTime(data.scheduledAt)}`, margin, 10);
  drawText(`Window: ${data.timeWindow || "-"}`, margin + 220, 10);
  y -= 14;
  if (data.fulfillmentType === "DELIVERY") {
    drawText(`Address: ${data.address || "-"}`, margin, 10);
    drawText(`Driver: ${data.driverName || "-"}`, margin + 320, 10);
  } else {
    drawText(`Pickup Contact: ${data.pickupContact || "-"}`, margin, 10);
    drawText(`Pickup Location: ${COMPANY_SETTINGS.address || "-"}`, margin + 220, 10);
  }
  y -= 18;

  drawSectionHeader("Items");
  if (data.type === "pick") {
    page.drawRectangle({ x: margin, y: y - 14, width: contentWidth, height: 16, color: rgb(0.95, 0.95, 0.95) });
    drawText("Item", margin + 6, 9, true);
    drawText("SKU", margin + 250, 9, true);
    drawRight("Ordered", pageWidth - 150, 9, true);
    drawRight("Fulfilled", pageWidth - 90, 9, true);
    drawRight("Pick", pageWidth - 38, 9, true);
    y -= 20;

    for (const item of data.items) {
      ensureSpace(18);
      const itemText = fitText(`${item.title}${item.unit ? ` (${item.unit})` : ""}`, 230, font, 9);
      drawText(itemText || "-", margin + 6, 9);
      drawText(fitText(item.sku || "-", 110, font, 9), margin + 250, 9, false, rgb(0.4, 0.43, 0.49));
      drawRight(Number(item.orderedQty || 0).toFixed(2), pageWidth - 150, 9);
      drawRight(Number(item.fulfilledQty || 0).toFixed(2), pageWidth - 90, 9);
      page.drawRectangle({
        x: pageWidth - 50,
        y: y - 2,
        width: 10,
        height: 10,
        borderWidth: 0.8,
        borderColor: rgb(0.35, 0.36, 0.4),
      });
      y -= 16;
      page.drawLine({
        start: { x: margin, y: y + 4 },
        end: { x: pageWidth - margin, y: y + 4 },
        thickness: 0.35,
        color: rgb(0.9, 0.9, 0.92),
      });
    }
  } else {
    page.drawRectangle({ x: margin, y: y - 14, width: contentWidth, height: 16, color: rgb(0.95, 0.95, 0.95) });
    drawText("Item", margin + 6, 9, true);
    drawRight("Qty", pageWidth - 40, 9, true);
    y -= 20;
    for (const item of data.items) {
      ensureSpace(18);
      const itemText = fitText(`${item.title}${item.unit ? ` (${item.unit})` : ""}`, 430, font, 9);
      drawText(itemText || "-", margin + 6, 9);
      drawRight(Number(item.fulfilledQty || 0).toFixed(2), pageWidth - 40, 9);
      y -= 16;
      page.drawLine({
        start: { x: margin, y: y + 4 },
        end: { x: pageWidth - margin, y: y + 4 },
        thickness: 0.35,
        color: rgb(0.9, 0.9, 0.92),
      });
    }
  }

  y -= 12;
  ensureSpace(64);
  drawSectionHeader("Notes");
  drawText(data.notes || "-", margin + 6, 9, false, rgb(0.35, 0.38, 0.43));
  y -= 20;

  if (data.type === "slip") {
    ensureSpace(80);
    drawSectionHeader("Signature");
    drawText("Signature:", margin + 6, 10, true);
    page.drawLine({
      start: { x: margin + 76, y: y + 2 },
      end: { x: margin + 300, y: y + 2 },
      thickness: 0.8,
      color: rgb(0.45, 0.46, 0.5),
    });
    y -= 18;
    drawText("Printed Name:", margin + 6, 10, true);
    page.drawLine({
      start: { x: margin + 96, y: y + 2 },
      end: { x: margin + 300, y: y + 2 },
      thickness: 0.8,
      color: rgb(0.45, 0.46, 0.5),
    });
    y -= 18;
    drawText("Date:", margin + 6, 10, true);
    page.drawLine({
      start: { x: margin + 42, y: y + 2 },
      end: { x: margin + 180, y: y + 2 },
      thickness: 0.8,
      color: rgb(0.45, 0.46, 0.5),
    });
  }

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    const footer = `Page ${idx + 1} of ${totalPages}`;
    const width = font.widthOfTextAtSize(footer, 9);
    p.drawText(footer, {
      x: pageWidth - margin - width,
      y: 10,
      size: 9,
      font,
      color: rgb(0.36, 0.37, 0.41),
    });
  });

  return pdfDoc.save();
}
