"use client";

import { Suspense } from "react";
import { SalesOrderEntryContent } from "../entry-content";

export default function NewSalesOrderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Loading...</div>}>
      <SalesOrderEntryContent />
    </Suspense>
  );
}
