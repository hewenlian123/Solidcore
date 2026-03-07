"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const primary =
  "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold shadow-lg rounded-xl hover:brightness-110 active:scale-[0.97]";
const secondary =
  "border border-white/[0.10] bg-white/[0.05] text-white/90 backdrop-blur-xl rounded-xl hover:brightness-110 active:scale-[0.97]";
const danger =
  "border border-red-400/20 bg-red-500/15 text-red-300 backdrop-blur-xl rounded-xl hover:bg-red-500/25 hover:border-red-400/30 active:scale-[0.97]";

export interface GradientButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "default" | "lg";
  children: React.ReactNode;
}

export const GradientButton = React.forwardRef<
  HTMLButtonElement,
  GradientButtonProps
>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      type = "button",
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
    const variantClass =
      variant === "primary"
        ? primary
        : variant === "danger"
          ? danger
          : secondary;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 tracking-tight transition-all duration-150 disabled:pointer-events-none disabled:opacity-60",
          variantClass,
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

