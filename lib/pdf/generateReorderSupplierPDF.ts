import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { COMPANY_SETTINGS } from "@/lib/company-settings";

type ReorderSupplierPDFData = {
  title: "Purchase Order (Draft)" | "Reorder Request";
  poNumber?: string | null;
  date: string | Date;
  supplierName: string;
  supplierContactName?: string | null;
  supplierPhone?: string | null;
  items: Array<{
    sku: string;
    itemName: string;
    qtyBoxes: number;
    qtySqft?: number | null;
    unitCost?: number | null;
    notes?: string | null;
  }>;
};

function formatDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

export async function generateReorderSupplierPDF(data: ReorderSupplierPDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const [pageWidth, pageHeight] = PageSizes.Letter;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const theme = {
    bgHeader: rgb(0.1, 0.1, 0.12),
    textMain: rgb(0.11, 0.13, 0.17),
    textMuted: rgb(0.38, 0.41, 0.46),
    line: rgb(0.86, 0.87, 0.9),
    tableHeader: rgb(0.93, 0.94, 0.96),
  };

  let page = pdfDoc.addPage(PageSizes.Letter);
  let y = pageHeight - margin;

  const drawHeaderBar = () => {
    page.drawRectangle({
      x: 0,
      y: pageHeight - 26,
      width: pageWidth,
      height: 26,
      color: theme.bgHeader,
    });
  };
  drawHeaderBar();

  const drawText = (text: string, x: number, size = 10, bold = false, color = theme.textMain) => {
    page.drawText(String(text ?? ""), {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
  };

  const drawRight = (text: string, rightX: number, size = 10, bold = false, color = theme.textMain) => {
    const f = bold ? fontBold : font;
    const width = f.widthOfTextAtSize(text, size);
    drawText(text, rightX - width, size, bold, color);
  };

  const wrap = (text: string, maxWidth: number, size: number) => {
    const words = String(text ?? "").split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 20,
      color: theme.tableHeader,
    });
    drawText("SKU", margin + 8, 9, true);
    drawText("Item Name", margin + 92, 9, true);
    drawRight("Qty (boxes)", pageWidth - 250, 9, true);
    drawRight("Qty (sqft)", pageWidth - 178, 9, true);
    drawRight("Unit Cost", pageWidth - 108, 9, true);
    drawRight("Notes", pageWidth - 48, 9, true);
    y -= 30;
  };

  const newPage = () => {
    page = pdfDoc.addPage(PageSizes.Letter);
    drawHeaderBar();
    y = pageHeight - margin;
    drawTableHeader();
  };

  const ensure = (need = 28) => {
    if (y - need > margin + 42) return;
    newPage();
  };

  // Header block
  page.drawRectangle({
    x: margin,
    y: y - 26,
    width: 180,
    height: 18,
    borderColor: rgb(0.72, 0.74, 0.78),
    borderWidth: 0.8,
    color: rgb(0.97, 0.97, 0.98),
  });
  drawText("LOGO PLACEHOLDER", margin + 8, 8, true, theme.textMuted);
  y -= 28;
  drawText(COMPANY_SETTINGS.name, margin, 18, true);
  y -= 16;
  drawText(COMPANY_SETTINGS.address, margin, 9, false, theme.textMuted);
  y -= 12;
  drawText(`${COMPANY_SETTINGS.phone} · ${COMPANY_SETTINGS.email}`, margin, 9, false, theme.textMuted);

  const title = data.title;
  const titleWidth = fontBold.widthOfTextAtSize(title, 22);
  page.drawText(title, {
    x: pageWidth - margin - titleWidth,
    y: pageHeight - margin,
    size: 22,
    font: fontBold,
    color: theme.textMain,
  });
  y = pageHeight - margin - 58;
  drawText("Supplier", margin, 10, true, theme.textMuted);
  y -= 12;
  drawText(data.supplierName || "-", margin, 11, true);
  y -= 12;
  drawText(
    `Contact: ${data.supplierContactName || "-"}  Phone: ${data.supplierPhone || "-"}`,
    margin,
    9,
    false,
    theme.textMuted,
  );

  const metaX = pageWidth - margin - 200;
  y += 24;
  page.drawText("Date", { x: metaX, y, size: 10, font: fontBold, color: theme.textMuted });
  page.drawText(formatDate(data.date), { x: metaX + 80, y, size: 10, font, color: theme.textMain });
  y -= 14;
  page.drawText("PO Number", { x: metaX, y, size: 10, font: fontBold, color: theme.textMuted });
  page.drawText(data.poNumber || "-", { x: metaX + 80, y, size: 10, font, color: theme.textMain });

  y -= 20;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.8,
    color: theme.line,
  });
  y -= 16;

  // Table rows
  drawTableHeader();
  for (const item of data.items) {
    const note = String(item.notes ?? "").trim();
    const noteLines = note ? wrap(note, 92, 8).slice(0, 2) : [];
    const rowHeight = Math.max(24, 20 + noteLines.length * 10);
    ensure(rowHeight + 4);
    const rowTop = y;
    drawText(item.sku || "-", margin + 8, 9);
    drawText(item.itemName || "-", margin + 92, 9, true);
    drawRight(String(Math.ceil(Number(item.qtyBoxes ?? 0))), pageWidth - 250, 9);
    drawRight(item.qtySqft != null ? Number(item.qtySqft).toFixed(2) : "-", pageWidth - 178, 9);
    drawRight(item.unitCost != null && Number(item.unitCost) > 0 ? `$${Number(item.unitCost).toFixed(2)}` : "-", pageWidth - 108, 9);
    if (noteLines.length > 0) {
      let noteY = rowTop;
      for (const line of noteLines) {
        y = noteY;
        drawRight(line, pageWidth - 48, 8, false, theme.textMuted);
        noteY -= 10;
      }
    }
    const rowBottom = rowTop - rowHeight;
    page.drawLine({
      start: { x: margin, y: rowBottom },
      end: { x: pageWidth - margin, y: rowBottom },
      thickness: 0.5,
      color: theme.line,
    });
    y = rowBottom - 6;
  }

  ensure(80);
  y -= 10;
  drawText("Terms & Conditions", margin, 10, true, theme.textMuted);
  y -= 12;
  drawText(
    "Please confirm item availability, lead time, and delivery schedule before processing.",
    margin,
    9,
    false,
    theme.textMuted,
  );

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
      color: rgb(0.42, 0.44, 0.48),
    });
  });

  return pdfDoc.save();
}

