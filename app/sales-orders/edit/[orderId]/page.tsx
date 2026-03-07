"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SalesOrderEntryContent } from "../../entry-content";

function EditSalesOrderContent() {
  const params = useParams();
  const orderId = typeof params.orderId === "string" ? params.orderId : undefined;

  if (!orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Invalid order.
      </div>
    );
  }

  return <SalesOrderEntryContent editOrderId={orderId} />;
}

export default function EditSalesOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
          Loading...
        </div>
      }
    >
      <EditSalesOrderContent />
    </Suspense>
  );
}
