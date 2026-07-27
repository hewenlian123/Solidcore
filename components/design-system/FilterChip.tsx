"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ className, active = false, type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 items-center rounded-sc-sm border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast",
        active
          ? "border-border-strong bg-selected text-foreground"
          : "border-border bg-surface text-foreground-secondary hover:bg-hover hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
FilterChip.displayName = "FilterChip";
