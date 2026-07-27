import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-11 w-full rounded-sc border border-border bg-surface px-3 text-sm text-foreground shadow-none transition-colors duration-fast placeholder:text-foreground-muted hover:border-border-strong focus:border-focus focus:ring-1 focus:ring-focus disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-surface disabled:text-disabled-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
