"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "sm" | "default" | "lg";
  children: React.ReactNode;
}

/** Compatibility wrapper. The historical name remains; rendered output is flat UI-1C. */
export const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ className, variant = "primary", size = "default", children, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant === "primary" ? "primary" : "secondary"}
      size={size}
      className={cn(className)}
      {...props}
    >
      {children}
    </Button>
  ),
);
GradientButton.displayName = "GradientButton";
