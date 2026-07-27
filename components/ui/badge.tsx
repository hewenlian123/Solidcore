import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-sc-sm border px-2 py-0.5 text-xs font-semibold",
        variant === "secondary"
          ? "border-border bg-surface-secondary text-foreground-secondary"
          : "border-border-strong bg-selected text-foreground",
        className,
      )}
      {...props}
    />
  );
}
