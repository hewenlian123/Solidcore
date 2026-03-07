"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const glassCardBase =
  "relative isolate overflow-hidden rounded-2xl border border-white/[0.10] bg-gradient-to-b from-white/[0.12] to-white/[0.03] backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-all duration-200";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Enable hover state (slightly brighter background on hover) */
  hover?: boolean;
  /** Content is wrapped in a layer with z-index so overlays work correctly */
  children: React.ReactNode;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hover = true, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(glassCardBase, hover && "hover:border-white/[0.14] hover:bg-white/[0.06]", className)}
      {...props}
    >
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none z-0 bg-[radial-gradient(1200px_400px_at_50%_-10%,rgba(255,255,255,0.14),transparent_55%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  ),
);
GlassCard.displayName = "GlassCard";
