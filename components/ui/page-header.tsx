"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, title, subtitle, actions, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className,
      )}
      {...props}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white/90">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-white/70">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  ),
);
PageHeader.displayName = "PageHeader";

