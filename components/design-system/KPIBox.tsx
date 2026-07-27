"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type KPIBoxBaseProps = {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

type KPIBoxDivProps = KPIBoxBaseProps & React.HTMLAttributes<HTMLDivElement> & { as?: "div" };
type KPIBoxButtonProps = KPIBoxBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { as: "button" };

export type KPIBoxProps = KPIBoxDivProps | KPIBoxButtonProps;

const base =
  "rounded-sc border border-border bg-surface px-4 py-3 text-left shadow-sc-low transition-colors duration-fast";

function KPIContent({
  label,
  value,
  subtitle,
  children,
}: Pick<KPIBoxBaseProps, "label" | "value" | "subtitle" | "children">) {
  return (
    <>
      <p className="text-xs font-semibold leading-4 text-foreground-secondary">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-6 text-foreground tabular-nums">{value}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-foreground-secondary">{subtitle}</p> : null}
      {children}
    </>
  );
}

export const KPIBox = React.forwardRef<HTMLDivElement | HTMLButtonElement, KPIBoxProps>(
  ({ className, label, value, subtitle, as, children, ...rest }, ref) => {
    if (as === "button") {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          className={cn(base, "hover:border-border-strong hover:bg-hover", className)}
          {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          <KPIContent label={label} value={value} subtitle={subtitle}>
            {children}
          </KPIContent>
        </button>
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(base, className)}
        {...(rest as React.HTMLAttributes<HTMLDivElement>)}
      >
        <KPIContent label={label} value={value} subtitle={subtitle}>
          {children}
        </KPIContent>
      </div>
    );
  },
);
KPIBox.displayName = "KPIBox";
