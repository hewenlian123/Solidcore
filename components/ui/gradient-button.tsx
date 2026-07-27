"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "default" | "lg";
  children: React.ReactNode;
}

/** Compatibility wrapper. The historical name remains; output is flat UI-1C. */
export const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  ({ variant = "primary", size = "default", children, ...props }, ref) => (
    <Button
      ref={ref}
      variant={
        variant === "primary" ? "primary" : variant === "danger" ? "destructive" : "secondary"
      }
      size={size}
      {...props}
    >
      {children}
    </Button>
  ),
);
GradientButton.displayName = "GradientButton";
