import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type OperationalRowProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  detail?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "warning" | "critical";
};

export function OperationalRow({
  className,
  icon,
  title,
  description,
  detail,
  actionLabel = "Open item",
  onAction,
  tone = "default",
  ...props
}: OperationalRowProps) {
  const content = (
    <>
      {icon ? <div className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-foreground-secondary">
            {description}
          </div>
        ) : null}
      </div>
      {detail ? (
        <div
          className={cn(
            "shrink-0 text-right text-[13px] font-semibold tabular-nums",
            tone === "critical"
              ? "text-critical"
              : tone === "warning"
                ? "text-warning"
                : "text-foreground-secondary",
          )}
        >
          {detail}
        </div>
      ) : null}
      {onAction ? <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground-muted" /> : null}
    </>
  );

  if (onAction) {
    return (
      <button
        type="button"
        aria-label={actionLabel}
        onClick={onAction}
        className={cn(
          "flex min-h-[60px] w-full items-center gap-3 border-b border-divider px-1 py-3 text-left transition-colors duration-fast last:border-b-0 hover:bg-hover",
          className,
        )}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-[60px] w-full items-center gap-3 border-b border-divider px-1 py-3 last:border-b-0",
        className,
      )}
      {...props}
    >
      {content}
    </div>
  );
}
