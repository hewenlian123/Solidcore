"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const glassCardBase =
  "relative isolate overflow-hidden rounded-2xl border border-white/[0.10] bg-gradient-to-b from-white/[0.12] to-white/[0.03] backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-all duration-200 will-change-transform";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  /** Softer, lighter variant for nested/filter panels */
  variant?: "default" | "soft";
  children: React.ReactNode;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hover = true, variant = "default", children, ...props }, ref) => {
    const variantClass =
      variant === "soft"
        ? "border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)]"
        : "";
    return (
      <div
        ref={ref}
        className={cn(
          glassCardBase,
          variant === "soft" && variantClass,
          hover && "hover:border-white/[0.14] hover:bg-white/[0.06] hover:-translate-y-0.5",
          className,
        )}
        {...props}
      >
        <div className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-[radial-gradient(1200px_400px_at_50%_-10%,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="relative z-10">{children}</div>
      </div>
    );
  },
);
GlassCard.displayName = "GlassCard";

