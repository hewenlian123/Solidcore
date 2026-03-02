"use client";

export function ReceiptPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ios-primary-btn h-10 px-4 text-sm print:hidden"
    >
      Print
    </button>
  );
}
