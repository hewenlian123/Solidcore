"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full appearance-none rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-sm text-white outline-none transition-all duration-200 backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 bg-no-repeat";

export interface GlassSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: Array<{ value: string; label: string }>;
  children?: React.ReactNode;
}

export const GlassSelect = React.forwardRef<HTMLSelectElement, GlassSelectProps>(
  ({ className, label, options, id: idProp, children, ...props }, ref) => {
    const id = idProp ?? React.useId();
    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={id} className="mb-1.5 block text-sm text-slate-300">
            {label}
          </label>
        ) : null}
        <select
          ref={ref}
          id={id}
          className={cn(base, "h-11 pr-10", className)}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: "right 0.5rem center",
            backgroundSize: "1.5em 1.5em",
          }}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
      </div>
    );
  },
);
GlassSelect.displayName = "GlassSelect";

