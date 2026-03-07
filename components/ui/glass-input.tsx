"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-sm text-white placeholder:text-white/40 outline-none transition-all duration-200 backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30";

export interface GlassInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, error, id: idProp, ...props }, ref) => {
    const id = idProp ?? React.useId();
    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={id} className="mb-1.5 block text-sm text-white/70">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={id}
          className={cn(base, "h-11", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        {error ? (
          <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
GlassInput.displayName = "GlassInput";

