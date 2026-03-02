import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { getPdfThemeColors } from "@/lib/pdf/theme";
import { formatLineItemTitle } from "@/lib/display";
import { getCustomerSpecLine, getEffectiveSpecs } from "@/lib/specs/glass";

type SalesOrderPDFData = {
  orderNumber: string;
  docType?: string;
  status: string;
  createdAt: string | Date;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  projectName?: string | null;
  salespersonName?: string | null;
  notes?: string | null;
  items: Array<{
    productName?: string | null;
    variantSku?: string | null;
    variantTitle?: string | null;
    width?: number | string | null;
    height?: number | string | null;
    color?: string | null;
    detailText?: string | null;
    lineNote?: string | null;
    glassTypeDefault?: string | null;
    glassFinishDefault?: string | null;
    screenDefault?: string | null;
    openingTypeDefault?: string | null;
    glassTypeOverride?: string | null;
    glassFinishOverride?: string | null;
    screenOverride?: string | null;
    openingTypeOverride?: string | null;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
};

function formatMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

export async function generateSalesOrderPDF(data: SalesOrderPDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const theme = getPdfThemeColors();
  const margin = 40;
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const contentWidth = pageWidth - margin * 2;
  let page = pdfDoc.addPage(PageSizes.Letter);
  let y = pageHeight - margin;

  const drawAccent = (targetPage: typeof page) => {
    targetPage.drawRectangle({
      x: 0,
      y: pageHeight - 6,
      width: pageWidth,
      height: 6,
      color: theme.rgbPrimary,
      opacity: 0.95,
    });
  };
  drawAccent(page);

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
    const f = bold ? fontBold : font;
    const width = f.widthOfTextAtSize(text, size);
    drawText(text, rightX - width, size, { bold });
  };

  const wrapText = (text: string, maxWidth: number, size: number, bold = false) => {
    const activeFont = bold ? fontBold : font;
    const words = String(text ?? "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (activeFont.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };
  const fitSingleLine = (text: string, maxWidth: number, size: number, bold = false) => {
    const activeFont = bold ? fontBold : font;
    const input = String(text ?? "").trim();
    if (!input) return "";
    if (activeFont.widthOfTextAtSize(input, size) <= maxWidth) return input;
    const ellipsis = "...";
    let out = input;
    while (out.length > 1 && activeFont.widthOfTextAtSize(`${out}${ellipsis}`, size) > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out}${ellipsis}`;
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 20,
      color: rgb(0.956, 0.956, 0.956),
    });
    drawText("Description", margin + 8, 10, { bold: true });
    drawRight("Qty", pageWidth - 215, 10, true);
    drawRight("Unit Price", pageWidth - 130, 10, true);
    drawRight("Line Total", pageWidth - 48, 10, true);
    y -= 30;
  };

  const newPage = () => {
    page = pdfDoc.addPage(PageSizes.Letter);
    drawAccent(page);
    y = pageHeight - margin;
    drawTableHeader();
  };

  const ensureSpace = (need = 26) => {
    if (y - need > margin + 28) return;
    newPage();
  };

  // Header
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

  const title = data.docType === "QUOTE" ? "QUOTE" : "SALES ORDER";
  const titleWidth = fontBold.widthOfTextAtSize(title, 28);
  page.drawText(title, {
    x: pageWidth - margin - titleWidth,
    y: pageHeight - margin,
    size: 28,
    font: fontBold,
    color: theme.rgbTitle,
  });
  const noText = `# ${data.orderNumber}`;
  const noWidth = fontBold.widthOfTextAtSize(noText, 12);
  page.drawText(noText, {
    x: pageWidth - margin - noWidth,
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

  const metaX = pageWidth - margin - 220;
  const metaTop = y + 26;
  page.drawText("Date", { x: metaX, y: metaTop, size: 10, font: fontBold, color: rgb(0.35, 0.38, 0.43) });
  page.drawText(formatDate(data.createdAt), { x: metaX + 90, y: metaTop, size: 10, font, color: rgb(0.15, 0.16, 0.2) });
  page.drawText("Status", { x: metaX, y: metaTop - 14, size: 10, font: fontBold, color: rgb(0.35, 0.38, 0.43) });
  page.drawText(data.status, { x: metaX + 90, y: metaTop - 14, size: 10, font, color: rgb(0.15, 0.16, 0.2) });
  page.drawText("Salesperson", { x: metaX, y: metaTop - 28, size: 10, font: fontBold, color: rgb(0.35, 0.38, 0.43) });
  page.drawText(data.salespersonName || "-", { x: metaX + 90, y: metaTop - 28, size: 10, font, color: rgb(0.15, 0.16, 0.2) });
  page.drawText("Project", { x: metaX, y: metaTop - 42, size: 10, font: fontBold, color: rgb(0.35, 0.38, 0.43) });
  page.drawText(data.projectName || "-", { x: metaX + 90, y: metaTop - 42, size: 10, font, color: rgb(0.15, 0.16, 0.2) });

  y -= 26;

  // Table
  drawTableHeader();
  for (const item of data.items) {
    const leftX = margin + 8;
    const leftMaxWidth = pageWidth - 250 - leftX;
    const productLine = fitSingleLine(
      formatLineItemTitle({
        productName: item.productName,
        variant: {
          title: item.variantTitle,
          sku: item.variantSku,
          width: item.width,
          height: item.height,
          color: item.color,
          detailText: item.detailText,
        },
      }),
      leftMaxWidth,
      10,
      true,
    );
    const windowSummary = fitSingleLine(
      getCustomerSpecLine(
        getEffectiveSpecs(
          {
            glassTypeDefault: item.glassTypeDefault,
            glassFinishDefault: item.glassFinishDefault,
            screenDefault: item.screenDefault,
            openingTypeDefault: item.openingTypeDefault,
          },
          {
            glassTypeOverride: item.glassTypeOverride,
            glassFinishOverride: item.glassFinishOverride,
            screenOverride: item.screenOverride,
            openingTypeOverride: item.openingTypeOverride,
          },
        ),
      ),
      leftMaxWidth,
      9,
      false,
    );
    const rowLinesCount = windowSummary ? 2 : 1;
    const rowHeight = Math.max(24, rowLinesCount * 12 + 8);
    ensureSpace(rowHeight + 4);
    const rowTopY = y;
    let textY = rowTopY;
    y = textY;
    drawText(productLine || "-", leftX, 10, { bold: true });
    textY -= 12;
    if (windowSummary) {
      y = textY;
      drawText(windowSummary, leftX, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
      textY -= 12;
    }
    y = rowTopY;
    drawRight(Number(item.qty).toFixed(2), pageWidth - 215, 10);
    drawRight(formatMoney(item.unitPrice), pageWidth - 130, 10);
    drawRight(formatMoney(item.lineTotal), pageWidth - 48, 10);
    const rowBottomY = Math.min(rowTopY - rowHeight, textY - 4);
    page.drawLine({
      start: { x: margin, y: rowBottomY },
      end: { x: pageWidth - margin, y: rowBottomY },
      thickness: 0.4,
      color: rgb(0.9, 0.91, 0.93),
    });
    y = rowBottomY - 8;
  }

  // Totals
  y -= 10;
  ensureSpace(120);
  const totalsLeft = pageWidth - margin - 210;
  const totalsRight = pageWidth - margin;
  drawText("Subtotal", totalsLeft, 10);
  drawRight(formatMoney(data.subtotal), totalsRight, 10);
  y -= 14;
  drawText("Discount", totalsLeft, 10);
  drawRight(formatMoney(data.discount), totalsRight, 10);
  y -= 14;
  drawText("Tax", totalsLeft, 10);
  drawRight(formatMoney(data.tax), totalsRight, 10);
  y -= 12;
  page.drawLine({
    start: { x: totalsLeft, y },
    end: { x: totalsRight, y },
    thickness: 0.8,
    color: rgb(0.78, 0.8, 0.84),
  });
  y -= 16;
  drawText("Total", totalsLeft, 16, { bold: true });
  drawRight(formatMoney(data.total), totalsRight, 16, true);
  y -= 16;
  drawText("Paid", totalsLeft, 10, { color: { r: 0.12, g: 0.5, b: 0.23 } });
  drawRight(formatMoney(data.paidAmount), totalsRight, 10);
  y -= 14;
  drawText("Balance", totalsLeft, 10, { color: { r: 0.7, g: 0.15, b: 0.15 } });
  drawRight(formatMoney(data.balanceDue), totalsRight, 10, true);
  y -= 20;

  if (data.notes) {
    ensureSpace(40);
    drawText("Notes", margin, 10, { bold: true, color: { r: 0.3, g: 0.33, b: 0.38 } });
    y -= 14;
    const note = data.notes.length > 180 ? `${data.notes.slice(0, 177)}...` : data.notes;
    drawText(note, margin, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
  }

  // Footer
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, i) => {
    const footer = "Thank you for your business.";
    const fw = font.widthOfTextAtSize(footer, 9);
    p.drawText(footer, {
      x: (pageWidth - fw) / 2,
      y: 10,
      size: 9,
      font,
      color: rgb(0.5, 0.52, 0.56),
    });
    const pageNo = `Page ${i + 1} of ${totalPages}`;
    const pw = font.widthOfTextAtSize(pageNo, 9);
    p.drawText(pageNo, {
      x: pageWidth - margin - pw,
      y: 10,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  return pdfDoc.save();
}
