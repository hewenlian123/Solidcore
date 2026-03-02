import { PDFDocument, PageSizes, StandardFonts, degrees, rgb } from "pdf-lib";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { getPdfThemeColors } from "@/lib/pdf/theme";
import { formatLineItemTitle } from "@/lib/display";
import { getCustomerSpecLine, getEffectiveSpecs } from "@/lib/specs/glass";

type InvoicePDFData = {
  invoiceNumber: string;
  issueDate: string | Date;
  dueDate?: string | Date | null;
  status: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  salesOrderNumber?: string | null;
  items: Array<{
    sku?: string | null;
    title: string;
    description?: string | null;
    productName?: string | null;
    width?: number | null;
    height?: number | null;
    color?: string | null;
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
  taxAmount: number;
  total: number;
  paidTotal?: number;
  balanceDue?: number;
  notes?: string | null;
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

export async function generateInvoicePDF(data: InvoicePDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const theme = getPdfThemeColors();
  const margin = 40;
  const [pageWidth, pageHeight] = PageSizes.Letter;
  const contentWidth = pageWidth - margin * 2;
  let page = pdfDoc.addPage(PageSizes.Letter);
  let y = pageHeight - margin;

  const statusUpper = String(data.status || "").toUpperCase();
  const watermarkText =
    statusUpper === "PAID" ? "PAID" : statusUpper === "VOID" ? "VOID" : "DRAFT";

  const drawTextAt = (
    targetPage: typeof page,
    text: string,
    x: number,
    atY: number,
    size = 10,
    opts?: { bold?: boolean; color?: { r: number; g: number; b: number } },
  ) => {
    targetPage.drawText(text, {
      x,
      y: atY,
      size,
      font: opts?.bold ? fontBold : font,
      color: opts?.color ? rgb(opts.color.r, opts.color.g, opts.color.b) : theme.rgbText,
    });
  };

  const drawText = (
    text: string,
    x: number,
    size = 10,
    opts?: { bold?: boolean; color?: { r: number; g: number; b: number } },
  ) => drawTextAt(page, text, x, y, size, opts);

  const drawRight = (text: string, rightX: number, size = 10, bold = false) => {
    const activeFont = bold ? fontBold : font;
    const width = activeFont.widthOfTextAtSize(text, size);
    drawText(text, rightX - width, size, { bold });
  };

  const wrapText = (text: string, maxWidth: number, size: number, bold = false) => {
    const activeFont = bold ? fontBold : font;
    const words = String(text ?? "").split(/\s+/).filter(Boolean);
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

  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let logoWidth = 0;
  let logoHeight = 0;
  if (COMPANY_SETTINGS.company_logo_url) {
    try {
      const res = await fetch(COMPANY_SETTINGS.company_logo_url);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        try {
          logoImage = await pdfDoc.embedPng(bytes);
        } catch {
          logoImage = await pdfDoc.embedJpg(bytes);
        }
        const natural = logoImage.scale(1);
        const scale = Math.min(150 / natural.width, 50 / natural.height, 1);
        logoWidth = natural.width * scale;
        logoHeight = natural.height * scale;
      }
    } catch {
      logoImage = null;
    }
  }

  const drawBrandAccent = (targetPage: typeof page) => {
    targetPage.drawRectangle({
      x: 0,
      y: pageHeight - 6,
      width: pageWidth,
      height: 6,
      color: theme.rgbPrimary,
      opacity: 0.95,
    });
  };
  drawBrandAccent(page);

  const statusBadgeColor =
    statusUpper === "PAID"
      ? rgb(0.11, 0.55, 0.24)
      : statusUpper === "VOID"
        ? rgb(0.78, 0.2, 0.2)
        : rgb(0.45, 0.48, 0.53);

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
    // Header + 12pt breathing room before first row.
    y -= 36;
  };

  const newTablePage = () => {
    page = pdfDoc.addPage(PageSizes.Letter);
    drawBrandAccent(page);
    y = pageHeight - margin;
    drawTableHeader();
  };

  const ensureTableSpace = (need = 24) => {
    if (y - need > margin + 36) return;
    newTablePage();
  };

  const ensurePlainSpace = (need = 24) => {
    if (y - need > margin + 26) return;
    page = pdfDoc.addPage(PageSizes.Letter);
    drawBrandAccent(page);
    y = pageHeight - margin;
  };

  // Header
  const headerTopY = pageHeight - margin;
  let leftBottomY = headerTopY - 38;
  if (logoImage) {
    page.drawImage(logoImage, {
      x: margin,
      y: headerTopY - logoHeight + 2,
      width: logoWidth,
      height: logoHeight,
    });
    drawTextAt(page, COMPANY_SETTINGS.address, margin, headerTopY - logoHeight - 10, 10, {
      color: { r: 0.42, g: 0.45, b: 0.5 },
    });
    drawTextAt(
      page,
      `${COMPANY_SETTINGS.phone} / ${COMPANY_SETTINGS.email}`,
      margin,
      headerTopY - logoHeight - 23,
      10,
      { color: { r: 0.42, g: 0.45, b: 0.5 } },
    );
    leftBottomY = headerTopY - logoHeight - 23;
  } else {
    drawTextAt(page, COMPANY_SETTINGS.name, margin, headerTopY, 20, {
      bold: true,
      color: theme.title,
    });
    drawTextAt(page, COMPANY_SETTINGS.address, margin, headerTopY - 18, 10, {
      color: { r: 0.42, g: 0.45, b: 0.5 },
    });
    drawTextAt(
      page,
      `${COMPANY_SETTINGS.phone} / ${COMPANY_SETTINGS.email}`,
      margin,
      headerTopY - 31,
      10,
      { color: { r: 0.42, g: 0.45, b: 0.5 } },
    );
    leftBottomY = headerTopY - 31;
  }

  const rightTitle = "INVOICE";
  const titleWidth = fontBold.widthOfTextAtSize(rightTitle, 32);
  drawTextAt(page, rightTitle, pageWidth - margin - titleWidth, headerTopY, 32, { bold: true });
  const invoiceNoWidth = fontBold.widthOfTextAtSize(data.invoiceNumber, 13);
  drawTextAt(page, data.invoiceNumber, pageWidth - margin - invoiceNoWidth, headerTopY - 19, 13, {
    bold: true,
    color: theme.text,
  });

  const badgeText = statusUpper || "DRAFT";
  const badgeTextWidth = fontBold.widthOfTextAtSize(badgeText, 9);
  const badgeWidth = badgeTextWidth + 14;
  const badgeX = pageWidth - margin - badgeWidth;
  const badgeY = headerTopY - 30;
  page.drawRectangle({ x: badgeX, y: badgeY, width: badgeWidth, height: 14, color: statusBadgeColor });
  drawTextAt(page, badgeText, badgeX + 7, badgeY + 3, 9, { bold: true, color: { r: 1, g: 1, b: 1 } });

  const dividerY = Math.min(leftBottomY - 8, badgeY - 8);
  page.drawLine({
    start: { x: margin, y: dividerY },
    end: { x: pageWidth - margin, y: dividerY },
    thickness: 0.8,
    color: rgb(0.87, 0.89, 0.92),
  });
  y = dividerY - 24;

  // Customer section
  const rightMetaX = pageWidth - margin - 220;
  drawText("Bill To", margin, 11, { bold: true });
  y -= 14;
  drawText(data.customerName || "-", margin, 10);
  y -= 13;
  drawText(`Phone: ${data.customerPhone || "-"}`, margin, 10);
  y -= 13;
  drawText(`Email: ${data.customerEmail || "-"}`, margin, 10);
  y -= 13;
  drawText(`Address: ${data.customerAddress || "-"}`, margin, 10);

  const rightStartY = y + 39;
  const drawMeta = (label: string, value: string, offset: number) => {
    drawTextAt(page, label, rightMetaX, rightStartY - offset, 10, {
      bold: true,
      color: { r: 0.35, g: 0.38, b: 0.43 },
    });
    drawTextAt(page, value, rightMetaX + 92, rightStartY - offset, 10);
  };
  drawMeta("Issue Date", formatDate(data.issueDate), 0);
  drawMeta("Due Date", formatDate(data.dueDate), 14);
  drawMeta("Sales Order", data.salesOrderNumber || "-", 28);
  y -= 28;

  // Items table
  drawTableHeader();
  for (const item of data.items) {
    const leftX = margin + 8;
    const leftMaxWidth = pageWidth - 250 - leftX;
    const productLine = fitSingleLine(
      formatLineItemTitle({
        productName: item.productName,
        variant: {
          title: item.title,
          sku: item.sku,
          width: item.width,
          height: item.height,
          color: item.color,
          detailText: item.description,
        },
      }),
      leftMaxWidth,
      10,
      true,
    );
    const specLine = fitSingleLine(
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
    const rowLinesCount = specLine ? 2 : 1;
    const rowHeight = Math.max(24, rowLinesCount * 12 + 8);
    ensureTableSpace(rowHeight + 4);

    const rowTopY = y;
    let textY = rowTopY;
    y = textY;
    drawText(productLine || "-", leftX, 10, { bold: true });
    textY -= 12;
    if (specLine) {
      y = textY;
      drawText(specLine, leftX, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
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

  // Totals + payment methods + bank block
  y -= 10;
  ensurePlainSpace(150);
  const summaryTopY = y;
  const totalsLeft = pageWidth - margin - 200;
  const totalsRight = pageWidth - margin;
  drawText("Subtotal", totalsLeft, 10);
  drawRight(formatMoney(data.subtotal), totalsRight, 10);
  y -= 14;
  drawText("Tax", totalsLeft, 10);
  drawRight(formatMoney(data.taxAmount), totalsRight, 10);
  y -= 14;
  page.drawLine({
    start: { x: totalsLeft, y },
    end: { x: totalsRight, y },
    thickness: 0.8,
    color: rgb(0.78, 0.8, 0.84),
  });
  y -= 18;
  drawText("Total", totalsLeft, 16, { bold: true });
  drawRight(formatMoney(data.total), totalsRight, 16, true);
  y -= 16;
  drawText("Paid", totalsLeft, 10, { color: { r: 0.12, g: 0.5, b: 0.23 } });
  drawRight(formatMoney(data.paidTotal ?? 0), totalsRight, 10);
  y -= 14;
  drawText("Balance", totalsLeft, 10, { color: { r: 0.7, g: 0.15, b: 0.15 } });
  drawRight(formatMoney(data.balanceDue ?? data.total), totalsRight, 10, true);
  y -= 20;

  const methods = Array.isArray(COMPANY_SETTINGS.accepted_payment_methods)
    ? COMPANY_SETTINGS.accepted_payment_methods
    : [];
  if (methods.length > 0) {
    y -= 6;
    drawText("ACCEPTED PAYMENT METHODS", totalsLeft, 9, {
      bold: true,
      color: { r: 0.42, g: 0.45, b: 0.5 },
    });
    y -= 12;
    for (let i = 0; i < methods.length; i += 2) {
      const leftMethod = methods[i];
      const rightMethod = methods[i + 1];
      drawText(`- ${leftMethod}`, totalsLeft, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
      if (rightMethod) {
        drawText(`- ${rightMethod}`, totalsLeft + 105, 9, {
          color: { r: 0.42, g: 0.45, b: 0.5 },
        });
      }
      y -= 11;
    }
  }
  const rightBottomY = y;

  let leftBottom = summaryTopY;
  if (COMPANY_SETTINGS.bank_name) {
    let by = summaryTopY;
    drawTextAt(page, "Bank Details", margin, by, 10, {
      bold: true,
      color: { r: 0.3, g: 0.33, b: 0.38 },
    });
    by -= 14;
    const rows = [
      `Bank Name: ${COMPANY_SETTINGS.bank_name || "-"}`,
      `Account Name: ${COMPANY_SETTINGS.bank_account_name || "-"}`,
      `Account Number: ${COMPANY_SETTINGS.bank_account_number || "-"}`,
      `Routing: ${COMPANY_SETTINGS.bank_routing_number || "-"}`,
    ];
    for (const row of rows) {
      drawTextAt(page, row, margin, by, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
      by -= 12;
    }
    leftBottom = by;
  }
  y = Math.min(rightBottomY, leftBottom) - 16;

  // Terms & Conditions
  ensurePlainSpace(64);
  drawText("TERMS & CONDITIONS", margin, 10, { bold: true, color: { r: 0.3, g: 0.33, b: 0.38 } });
  y -= 14;
  const termsText = COMPANY_SETTINGS.invoice_terms_text || "";
  if (termsText) {
    const lines = wrapText(termsText, contentWidth, 10);
    for (const l of lines) {
      ensurePlainSpace(14);
      drawText(l, margin, 10, { color: { r: 0.45, g: 0.48, b: 0.53 } });
      y -= 12;
    }
  }
  y -= 8;

  if (data.notes) {
    ensurePlainSpace(40);
    drawText("Notes", margin, 10, { bold: true, color: { r: 0.3, g: 0.33, b: 0.38 } });
    y -= 14;
    const note = data.notes.length > 180 ? `${data.notes.slice(0, 177)}...` : data.notes;
    drawText(note, margin, 9, { color: { r: 0.42, g: 0.45, b: 0.5 } });
  }

  // Watermark + footer
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  pages.forEach((p, index) => {
    p.drawText(watermarkText, {
      x: pageWidth / 2 - 140,
      y: pageHeight / 2 - 30,
      size: 72,
      font: fontBold,
      color:
        watermarkText === "PAID"
          ? rgb(0.12, 0.55, 0.22)
          : watermarkText === "VOID"
            ? rgb(0.68, 0.18, 0.18)
            : rgb(0.45, 0.48, 0.53),
      opacity: 0.1,
      rotate: degrees(35),
    });
    drawBrandAccent(p);

    // Authorized signature block (bottom-left, above footer)
    const sigTitleY = 58;
    const sigLineY = 46;
    const sigDateY = 32;
    p.drawText("Authorized Signature", {
      x: margin,
      y: sigTitleY,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.21, 0.24),
    });
    p.drawLine({
      start: { x: margin, y: sigLineY },
      end: { x: margin + 230, y: sigLineY },
      thickness: 0.8,
      color: rgb(0.55, 0.55, 0.58),
    });
    p.drawText("Date: ____________", {
      x: margin,
      y: sigDateY,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.43),
    });

    const footer = "Thank you for your business.";
    const footerWidth = font.widthOfTextAtSize(footer, 9);
    p.drawText(footer, {
      x: (pageWidth - footerWidth) / 2,
      y: 8,
      size: 9,
      font,
      color: rgb(0.5, 0.52, 0.56),
    });
    const pageNo = `Page ${index + 1} of ${totalPages}`;
    const pageNoWidth = font.widthOfTextAtSize(pageNo, 9);
    p.drawText(pageNo, {
      x: pageWidth - margin - pageNoWidth,
      y: 8,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  return pdfDoc.save();
}
