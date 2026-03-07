"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.25)] transition-colors hover:bg-white/[0.06]";

export interface KPIBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  as?: "div" | "button";
  children?: React.ReactNode;
}

type KPIBoxBaseProps = {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

type KPIBoxDivProps = KPIBoxBaseProps &
  React.HTMLAttributes<HTMLDivElement> & {
    as?: "div";
  };

type KPIBoxButtonProps = KPIBoxBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    as: "button";
  };

export const KPIBox = React.forwardRef<HTMLDivElement | HTMLButtonElement, KPIBoxDivProps | KPIBoxButtonProps>(
  ({ className, label, value, subtitle, as, children, ...rest }, ref) => {
    if (as === "button") {
      const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type={buttonProps.type ?? "button"}
          className={cn(base, className)}
          {...buttonProps}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-white/90">{value}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-white/50">{subtitle}</p> : null}
          {children}
        </button>
      );
    }

    const divProps = rest as React.HTMLAttributes<HTMLDivElement>;
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={cn(base, className)} {...divProps}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-white/90">{value}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-white/50">{subtitle}</p> : null}
        {children}
      </div>
    );
  },
);
KPIBox.displayName = "KPIBox";

