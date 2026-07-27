"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: Array<{ value: string; label: string }>;
  children?: React.ReactNode;
}

/** Compatibility wrapper for the former glass select API. */
export const GlassSelect = React.forwardRef<HTMLSelectElement, GlassSelectProps>(
  ({ className, label, options, id: idProp, children, ...props }, ref) => {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;
    return (
      <div className="grid w-full gap-1.5">
        {label ? <Label htmlFor={id}>{label}</Label> : null}
        <select
          ref={ref}
          id={id}
          className={cn(
            "h-11 w-full rounded-sc border border-border bg-surface px-3 text-sm text-foreground transition-colors duration-fast hover:border-border-strong focus:border-focus focus:ring-1 focus:ring-focus disabled:border-disabled-border disabled:bg-disabled-surface disabled:text-disabled-foreground",
            className,
          )}
          {...props}
        >
          {options
            ? options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            : children}
        </select>
      </div>
    );
  },
);
GlassSelect.displayName = "GlassSelect";
