"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "border border-white/[0.10] bg-white/[0.05] text-white/80 backdrop-blur-xl",
  draft: "border border-white/20 bg-white/[0.06] text-white/70 backdrop-blur-xl",
  quoted: "border border-violet-400/30 bg-violet-500/20 text-violet-300 backdrop-blur-xl",
  confirmed: "border border-blue-400/30 bg-blue-500/20 text-blue-300 backdrop-blur-xl",
  ready: "border border-amber-400/30 bg-amber-500/20 text-amber-300 backdrop-blur-xl",
  fulfilled: "border border-emerald-400/30 bg-emerald-500/20 text-emerald-300 backdrop-blur-xl",
  paid: "border border-emerald-400/30 bg-emerald-500/20 text-emerald-300 backdrop-blur-xl",
  success: "border border-emerald-400/30 bg-emerald-500/20 text-emerald-300 backdrop-blur-xl",
  cancelled: "border border-rose-400/30 bg-rose-500/20 text-rose-300 backdrop-blur-xl",
  error: "border border-rose-400/30 bg-rose-500/20 text-rose-300 backdrop-blur-xl",
  warning: "border border-amber-400/30 bg-amber-500/20 text-amber-300 backdrop-blur-xl",
  lowStock: "border border-amber-400/30 bg-amber-500/20 text-amber-300 backdrop-blur-xl",
  info: "border border-blue-400/30 bg-blue-500/20 text-blue-300 backdrop-blur-xl",
} as const;

export type StatusBadgeVariant = keyof typeof variants;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
  children: React.ReactNode;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, variant = "default", children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-xl border px-2.5 py-1 text-xs font-medium backdrop-blur-xl transition-colors duration-150",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  ),
);
StatusBadge.displayName = "StatusBadge";
