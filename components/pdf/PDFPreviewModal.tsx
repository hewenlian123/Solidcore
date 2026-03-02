"use client";

import { useEffect, useState } from "react";

type PDFPreviewModalProps = {
  open: boolean;
  title?: string;
  src: string;
  onClose: () => void;
};

export function PDFPreviewModal({ open, title = "PDF Preview", src, onClose }: PDFPreviewModalProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
  }, [open, src]);

  if (!open) return null;

  const downloadHref = src.includes("?") ? `${src}&download=true` : `${src}?download=true`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px]">
      <div className="linear-card flex h-[90vh] w-full max-w-5xl flex-col p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-2">
            <a
              href={downloadHref}
              className="ios-secondary-btn h-9 px-3 text-xs"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
            <button type="button" onClick={onClose} className="ios-secondary-btn h-9 px-3 text-xs">
              Close
            </button>
          </div>
        </div>
        <div className="relative flex-1">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Loading PDF...
              </div>
            </div>
          ) : null}
          <iframe
            title={title}
            src={src}
            className="h-full w-full rounded-b-2xl"
            onLoad={() => setLoading(false)}
          />
        </div>
      </div>
    </div>
  );
}
