"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function NewOrderEntryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<"QUOTE" | "SALES_ORDER">("SALES_ORDER");

  useEffect(() => {
    const requested = String(searchParams.get("docType") ?? "").toUpperCase();
    const type: "QUOTE" | "SALES_ORDER" = requested === "QUOTE" ? "QUOTE" : "SALES_ORDER";
    setDocType(type);
    try {
      setError(null);
      router.replace(`/sales-orders/new?docType=${type}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open order form");
    }
  }, [router, searchParams]);

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New {docType === "QUOTE" ? "Quote" : "Sales Order"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Redirecting to full order creation form...
        </p>
        {error ? (
          <p className="mt-2 text-sm text-rose-600">{error}</p>
        ) : null}
      </div>
    </section>
  );
}

export default function NewOrderEntryPage() {
  return (
    <Suspense fallback={<section className="p-6 text-sm text-slate-500">Creating order...</section>}>
      <NewOrderEntryPageContent />
    </Suspense>
  );
}
