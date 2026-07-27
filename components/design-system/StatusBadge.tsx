"use client";

import * as React from "react";
import { StatusLabel, StatusTone } from "@/components/ui/status-label";

const toneMap = {
  default: "neutral",
  draft: "neutral",
  quoted: "info",
  confirmed: "info",
  ready: "warning",
  fulfilled: "success",
  paid: "success",
  success: "success",
  cancelled: "critical",
  error: "critical",
  warning: "warning",
  lowStock: "warning",
  info: "info",
} satisfies Record<string, StatusTone>;

export type StatusBadgeVariant = keyof typeof toneMap;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
  children: React.ReactNode;
}

/** Compatibility wrapper for the former glass badge API. */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ variant = "default", children, ...props }, ref) => (
    <StatusLabel ref={ref} tone={toneMap[variant]} {...props}>
      {children}
    </StatusLabel>
  ),
);
StatusBadge.displayName = "StatusBadge";
