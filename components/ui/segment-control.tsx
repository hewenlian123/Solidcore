"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentControlProps<T extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Toggle group for two or more options (e.g. Quotes / Sales Orders). Luxury glass style. */
export function SegmentControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  ...props
}: SegmentControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex rounded-xl border border-white/[0.10] bg-white/[0.04] p-1 backdrop-blur-xl",
        className,
      )}
      {...props}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150",
            value === opt.value
              ? "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg"
              : "text-white/70 hover:bg-white/[0.06] hover:text-white/90",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
