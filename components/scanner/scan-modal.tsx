"use client";

import { useEffect, useId } from "react";
import { Html5Qrcode } from "html5-qrcode";

type ScanModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  onDetected: (text: string) => void;
};

export function ScanModal({ open, title, onClose, onDetected }: ScanModalProps) {
  const scannerId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) return;

    const scanner = new Html5Qrcode(scannerId);
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          onDetected(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {},
      )
      .catch(() => {});

    return () => {
      scanner.stop().catch(() => {});
      scanner.clear();
    };
  }, [open, scannerId, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-md rounded-lg border border-slate-200/80 bg-white p-4 shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-900/90">
          <div id={scannerId} className="min-h-[320px] w-full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-60 w-60 rounded-lg border-2 border-white/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
