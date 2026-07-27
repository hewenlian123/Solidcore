"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  variant?: "default" | "soft";
  children: React.ReactNode;
}

/** Compatibility wrapper for historical imports. */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hover = true, variant = "default", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-sc border bg-surface shadow-sc-low transition-colors duration-fast",
        variant === "soft" ? "border-divider bg-surface-secondary" : "border-border",
        hover && "hover:border-border-strong",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
GlassCard.displayName = "GlassCard";
