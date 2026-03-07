"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 animate-spin text-white/70", className)}
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

