"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

/** Compatibility wrapper for the former glass input API. */
export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, error, id: idProp, ...props }, ref) => {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;
    return (
      <div className="grid w-full gap-1.5">
        {label ? <Label htmlFor={id}>{label}</Label> : null}
        <Input
          ref={ref}
          id={id}
          className={cn(className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-xs text-critical">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
GlassInput.displayName = "GlassInput";
