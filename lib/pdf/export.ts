"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type OrderLine = {
  productName: string;
  spec: string;
  unitPrice: number;
  quantity: number;
};

export function exportOrderPdf(params: {
  companyName?: string;
  orderNo: string;
  customerName: string;
  customerAddress: string;
  lines: OrderLine[];
  footerNote?: string;
}) {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(params.companyName ?? "Solidcore Building Materials", 14, 16);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Order #: ${params.orderNo}`, 14, 24);
  doc.text(`Customer: ${params.customerName}`, 14, 30);
  doc.text(`Address: ${params.customerAddress}`, 14, 36);

  autoTable(doc, {
    startY: 42,
    head: [["Product Specification", "Size (L x W)", "Unit Price", "Qty"]],
    body: params.lines.map((l) => [l.productName, l.spec, `$${l.unitPrice.toFixed(2)}`, String(l.quantity)]),
    styles: { fontSize: 10, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  doc.text("Payment: Please pay according to contract terms.", 14, y);
  doc.text("Warranty: Coverage period depends on product category after installation completion.", 14, y + 6);
  doc.text("Customer Signature: ____________________", 14, y + 18);
  if (params.footerNote) doc.text(params.footerNote, 14, y + 24);
  doc.save(`${params.orderNo}.pdf`);
}

export function exportStatementPdf(params: {
  customerName: string;
  rows: Array<{ date: string; productName: string; total: number; paid: number; unpaid: number }>;
}) {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Solidcore Statement", 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Customer: ${params.customerName}`, 14, 24);

  autoTable(doc, {
    startY: 30,
    head: [["Date", "Product", "Total", "Paid", "Unpaid"]],
    body: params.rows.map((r) => [r.date, r.productName, `$${r.total.toFixed(2)}`, `$${r.paid.toFixed(2)}`, `$${r.unpaid.toFixed(2)}`]),
    styles: { fontSize: 10, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.text("Payment: Please settle after confirming statement accuracy.", 14, (doc as any).lastAutoTable.finalY + 10);
  doc.text("Customer Signature: ____________________", 14, (doc as any).lastAutoTable.finalY + 20);
  doc.save(`statement-${params.customerName}.pdf`);
}

export function exportInvoicePdf(params: {
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  orderNo: string;
  customerName: string;
  customerAddress: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  taxRatePercent: number;
  paid: number;
}) {
  const taxAmount = (params.subtotal * params.taxRatePercent) / 100;
  const total = params.subtotal + taxAmount;
  const balanceDue = Math.max(total - params.paid, 0);
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("INVOICE", 14, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice #: ${params.invoiceNo}`, 14, 24);
  doc.text(`Order #: ${params.orderNo}`, 14, 30);
  doc.text(`Issue Date: ${params.issueDate}`, 14, 36);
  doc.text(`Due Date: ${params.dueDate}`, 14, 42);
  doc.text(`Bill To: ${params.customerName}`, 120, 24);
  doc.text(`Address: ${params.customerAddress}`, 120, 30);

  autoTable(doc, {
    startY: 48,
    head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: params.lines.map((line) => [
      line.description,
      String(line.quantity),
      `$${line.unitPrice.toFixed(2)}`,
      `$${line.amount.toFixed(2)}`,
    ]),
    styles: { fontSize: 10, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal: $${params.subtotal.toFixed(2)}`, 140, y);
  doc.text(`Tax (${params.taxRatePercent.toFixed(2)}%): $${taxAmount.toFixed(2)}`, 140, y + 6);
  doc.text(`Total: $${total.toFixed(2)}`, 140, y + 12);
  doc.text(`Paid: $${params.paid.toFixed(2)}`, 140, y + 18);
  doc.text(`Balance Due: $${balanceDue.toFixed(2)}`, 140, y + 24);
  doc.setFont("helvetica", "normal");
  doc.text("Thank you for your business.", 14, y + 30);

  doc.save(`invoice-${params.invoiceNo}.pdf`);
}
