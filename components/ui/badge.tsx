import * as React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary";
};

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variantClass =
    variant === "secondary"
      ? "border border-white/[0.08] bg-white/[0.04] text-slate-200 backdrop-blur-xl"
      : "border border-white/[0.10] bg-white/[0.06] text-white backdrop-blur-xl";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClass} ${className}`.trim()} {...props} />;
}
