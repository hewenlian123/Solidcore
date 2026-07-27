"use client";

import { Suspense } from "react";
import { CreateSaleContent } from "../create-sale-content";

export default function NewSalesOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-foreground-secondary">
          Loading sale...
        </div>
      }
    >
      <CreateSaleContent />
    </Suspense>
  );
}
