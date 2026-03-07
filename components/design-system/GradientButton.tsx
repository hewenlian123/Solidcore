"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const gradientPrimary =
  "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold shadow-lg hover:brightness-110";
const glassSecondary =
  "border border-white/[0.10] bg-white/[0.05] text-white backdrop-blur-xl hover:brightness-110";

export interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "sm" | "default" | "lg";
  children: React.ReactNode;
}

export const GradientButton = React.forwardRef<HTMLButtonElement, GradientButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      type = "button",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const sizeClass =
      size === "sm"
        ? "h-9 rounded-lg px-3 text-xs"
        : size === "lg"
          ? "h-12 rounded-xl px-6 text-base"
          : "h-11 rounded-xl px-5 text-sm";
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 tracking-tight transition-all duration-200 disabled:pointer-events-none disabled:opacity-60",
          variant === "primary" ? gradientPrimary : glassSecondary,
          sizeClass,
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
GradientButton.displayName = "GradientButton";
