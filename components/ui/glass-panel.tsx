"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const glassPanelBase =
  "rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.45)] transition-all duration-200";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  children: React.ReactNode;
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, strong = false, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        glassPanelBase,
        strong && "from-white/[0.12] to-white/[0.04] shadow-[0_10px_40px_rgba(0,0,0,0.55)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
GlassPanel.displayName = "GlassPanel";

