"use client";

import { Suspense } from "react";
import POSEntryContent from "./pos-entry-content";

export default function POSOrderPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f1117",
            color: "#9aa0b8",
          }}
        >
          Loading…
        </div>
      }
    >
      <POSEntryContent />
    </Suspense>
  );
}
