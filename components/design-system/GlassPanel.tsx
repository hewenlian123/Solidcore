"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  children: React.ReactNode;
}

/** Compatibility wrapper for the former glass panel API. */
export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, strong = false, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-sc border bg-surface",
        strong ? "border-border-strong shadow-sc-raised" : "border-border shadow-sc-low",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
GlassPanel.displayName = "GlassPanel";
