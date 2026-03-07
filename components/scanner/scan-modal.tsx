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
    <div className="fixed inset-0 z-50 bg-black/40 p-4 backdrop-blur-sm">
      <div className="so-modal-shell mx-auto max-w-md p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="ios-secondary-btn h-10 px-3 text-sm"
          >
            Close
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.05] backdrop-blur-xl">
          <div id={scannerId} className="min-h-[320px] w-full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-60 w-60 rounded-lg border-2 border-white/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
