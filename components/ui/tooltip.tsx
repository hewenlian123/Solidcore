import * as React from "react";
import { cn } from "@/lib/utils";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function Tooltip({ content, children, className }: TooltipProps) {
  const id = React.useId();
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[70] mt-2 hidden w-max max-w-64 -translate-x-1/2 rounded-sc-sm bg-action px-2 py-1.5 text-xs leading-4 text-action-foreground shadow-sc-raised group-focus-within/tooltip:block group-hover/tooltip:block"
      >
        {content}
      </span>
    </span>
  );
}
