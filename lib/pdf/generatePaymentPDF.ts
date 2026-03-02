import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { getPdfThemeColors } from "@/lib/pdf/theme";

type PaymentPDFData = {
  receiptNumber: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  amount: number;
  method: string;
  referenceNumber?: string | null;
  receivedAt: string | Date;
  status: string;
  total: number;
  paidAmount: number;
  balanceDue: number;
  notes?: string | null;
};

function formatMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", { timeZone: "UTC" });
}

export async function generatePaymentPDF(data: PaymentPDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const theme = getPdfThemeColors();
  const margin = 40;
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const contentWidth = pageWidth - margin * 2;
  const page = pdfDoc.addPage(PageSizes.Letter);

  let y = pageHeight - margin;

  const drawText = (
    text: string,
    x: number,
    size = 10,
    opts?: { bold?: boolean; color?: { r: number; g: number; b: number } },
  ) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: opts?.bold ? fontBold : font,
      color: opts?.color ? rgb(opts.color.r, opts.color.g, opts.color.b) : theme.rgbText,
    });
  };

  const drawRight = (text: string, rightX: number, size = 10, bold = false) => {
    const active = bold ? fontBold : font;
    const width = active.widthOfTextAtSize(text, size);
    drawText(text, rightX - width, size, { bold });
  };

  page.drawRectangle({
    x: 0,
    y: pageHeight - 6,
    width: pageWidth,
    height: 6,
    color: theme.rgbPrimary,
    opacity: 0.95,
  });

  drawText(COMPANY_SETTINGS.name, margin, 20, {
    bold: true,
    color: theme.title,
  });
  y -= 18;
  drawText(COMPANY_SETTINGS.address, margin, 10, { color: { r: 0.42, g: 0.45, b: 0.5 } });
  y -= 13;
  drawText(`${COMPANY_SETTINGS.phone} / ${COMPANY_SETTINGS.email}`, margin, 10, {
    color: { r: 0.42, g: 0.45, b: 0.5 },
  });

  const title = "PAYMENT RECEIPT";
  const titleWidth = fontBold.widthOfTextAtSize(title, 28);
  page.drawText(title, {
    x: pageWidth - margin - titleWidth,
    y: pageHeight - margin,
    size: 28,
    font: fontBold,
    color: theme.rgbTitle,
  });
  const receiptLabel = `# ${data.receiptNumber}`;
  const receiptWidth = fontBold.widthOfTextAtSize(receiptLabel, 12);
  page.drawText(receiptLabel, {
    x: pageWidth - margin - receiptWidth,
    y: pageHeight - margin - 18,
    size: 12,
    font: fontBold,
    color: theme.rgbText,
  });

  y = pageHeight - margin - 54;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.8,
    color: rgb(0.87, 0.89, 0.92),
  });
  y -= 20;

  drawText("Bill To", margin, 11, { bold: true });
  y -= 14;
  drawText(data.customerName || "-", margin, 10);
  y -= 13;
  drawText(`Phone: ${data.customerPhone || "-"}`, margin, 10);
  y -= 13;
  drawText(`Email: ${data.customerEmail || "-"}`, margin, 10);

  const metaX = pageWidth - margin - 225;
  const metaTop = y + 26;
  page.drawText("Sales Order", {
    x: metaX,
    y: metaTop,
    size: 10,
    font: fontBold,
    color: rgb(0.35, 0.38, 0.43),
  });
  page.drawText(data.orderNumber, {
    x: metaX + 92,
    y: metaTop,
    size: 10,
    font,
    color: rgb(0.15, 0.16, 0.2),
  });
  page.drawText("Received", {
    x: metaX,
    y: metaTop - 14,
    size: 10,
    font: fontBold,
    color: rgb(0.35, 0.38, 0.43),
  });
  page.drawText(formatDateTime(data.receivedAt), {
    x: metaX + 92,
    y: metaTop - 14,
    size: 10,
    font,
    color: rgb(0.15, 0.16, 0.2),
  });
  page.drawText("Status", {
    x: metaX,
    y: metaTop - 28,
    size: 10,
    font: fontBold,
    color: rgb(0.35, 0.38, 0.43),
  });
  page.drawText(data.status, {
    x: metaX + 92,
    y: metaTop - 28,
    size: 10,
    font,
    color: rgb(0.15, 0.16, 0.2),
  });

  y -= 28;

  page.drawRectangle({
    x: margin,
    y: y - 84,
    width: contentWidth,
    height: 88,
    borderWidth: 1,
    borderColor: rgb(0.88, 0.9, 0.94),
    color: rgb(0.99, 0.99, 0.995),
  });
  drawText("Payment Summary", margin + 12, 11, { bold: true });
  y -= 18;
  drawText(`Method: ${data.method}`, margin + 12, 10);
  y -= 14;
  drawText(`Reference: ${data.referenceNumber || "-"}`, margin + 12, 10);
  y -= 14;
  drawText("Amount", margin + 12, 10, { bold: true });
  drawRight(formatMoney(data.amount), pageWidth - margin - 12, 12, true);
  y -= 30;

  const totalsLeft = pageWidth - margin - 210;
  const totalsRight = pageWidth - margin;
  drawText("Order Total", totalsLeft, 10);
  drawRight(formatMoney(data.total), totalsRight, 10);
  y -= 14;
  drawText("Paid (Current)", totalsLeft, 10, { color: { r: 0.12, g: 0.5, b: 0.23 } });
  drawRight(formatMoney(data.paidAmount), totalsRight, 10);
  y -= 14;
  drawText("Balance Due", totalsLeft, 10, { color: { r: 0.7, g: 0.15, b: 0.15 } });
  drawRight(formatMoney(data.balanceDue), totalsRight, 10, true);
  y -= 20;

  if (data.notes) {
    drawText("Notes", margin, 10, { bold: true, color: { r: 0.3, g: 0.33, b: 0.38 } });
    y -= 14;
    const note = data.notes.length > 180 ? `${data.notes.slice(0, 177)}...` : data.notes;
    drawText(note, margin, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
    y -= 20;
  }

  page.drawText("Customer Signature", {
    x: margin,
    y: 58,
    size: 10,
    font: fontBold,
    color: rgb(0.2, 0.21, 0.24),
  });
  page.drawLine({
    start: { x: margin, y: 46 },
    end: { x: margin + 230, y: 46 },
    thickness: 0.8,
    color: rgb(0.55, 0.55, 0.58),
  });
  page.drawText("Date: ____________", {
    x: margin,
    y: 32,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.43),
  });

  const footer = "Thank you for your business.";
  const footerWidth = font.widthOfTextAtSize(footer, 9);
  page.drawText(footer, {
    x: (pageWidth - footerWidth) / 2,
    y: 10,
    size: 9,
    font,
    color: rgb(0.5, 0.52, 0.56),
  });
  const pageNo = "Page 1 of 1";
  const pageNoWidth = font.widthOfTextAtSize(pageNo, 9);
  page.drawText(pageNo, {
    x: pageWidth - margin - pageNoWidth,
    y: 10,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return pdfDoc.save();
}
