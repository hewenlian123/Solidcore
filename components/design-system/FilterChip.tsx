"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const chipInactive =
  "inline-flex items-center rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white backdrop-blur-xl transition-colors hover:bg-white/[0.06]";
const chipActive =
  "inline-flex items-center rounded-xl border-0 bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:brightness-110";

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** When true, uses gradient (active) style */
  active?: boolean;
  children: React.ReactNode;
}

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ className, active = false, type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(active ? chipActive : chipInactive, className)}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  ),
);
FilterChip.displayName = "FilterChip";
