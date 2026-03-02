"use client";

import { useState } from "react";
import Link from "next/link";

export default function NewOrderEntryPage() {
  const [docType, setDocType] = useState<"QUOTE" | "SALES_ORDER">("SALES_ORDER");
  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New {docType === "QUOTE" ? "Quote" : "Sales Order"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Choose document type and continue to the professional order builder.
        </p>
      </div>
      <div className="linear-card p-8">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setDocType("QUOTE")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              docType === "QUOTE" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Quote
          </button>
          <button
            type="button"
            onClick={() => setDocType("SALES_ORDER")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              docType === "SALES_ORDER" ? "bg-white text-slate-900" : "text-slate-600"
            }`}
          >
            Sales Order
          </button>
        </div>
        <div className="mt-4">
          <Link
            href={`/sales-orders/new?docType=${docType}`}
            className="ios-primary-btn inline-flex h-11 items-center px-4 text-sm"
          >
            Continue
          </Link>
        </div>
      </div>
    </section>
  );
}
