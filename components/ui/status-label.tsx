import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Circle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "blocking" | "critical";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-border bg-surface-secondary text-foreground-secondary",
  info: "border-info/20 bg-info-surface text-info",
  success: "border-success/20 bg-success-surface text-success",
  warning: "border-warning/20 bg-warning-surface text-warning",
  blocking: "border-blocking/20 bg-blocking-surface text-blocking",
  critical: "border-critical/20 bg-critical-surface text-critical",
};

const icons = {
  neutral: Circle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  blocking: AlertCircle,
  critical: AlertCircle,
} as const;

export type StatusLabelProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  showIcon?: boolean;
};

export const StatusLabel = React.forwardRef<HTMLSpanElement, StatusLabelProps>(
  ({ className, tone = "neutral", showIcon = true, children, ...props }, ref) => {
    const Icon = icons[tone];
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex min-h-6 items-center gap-1.5 rounded-sc-sm border px-2 py-0.5 text-xs font-semibold leading-4",
          toneClasses[tone],
          className,
        )}
        {...props}
      >
        {showIcon ? <Icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
        {children}
      </span>
    );
  },
);
StatusLabel.displayName = "StatusLabel";
