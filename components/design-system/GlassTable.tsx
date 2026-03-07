"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const glassTableWrapper =
  "overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.45)]";
const headerRowClass = "border-white/10 bg-white/[0.06] hover:bg-white/[0.06]";
const bodyRowClass = "border-white/10 transition-colors hover:bg-white/[0.06]";

export interface GlassTableRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Wraps a table in a glass card container. Use with Table, TableHeader, TableBody, and GlassTableHeaderRow / TableRow for body. */
export const GlassTableRoot = React.forwardRef<HTMLDivElement, GlassTableRootProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn(glassTableWrapper, className)} {...props}>
      {children}
    </div>
  ),
);
GlassTableRoot.displayName = "GlassTableRoot";

/** Table header row with glass styling (no hover brighten) */
export const GlassTableHeaderRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <TableRow ref={ref} className={cn(headerRowClass, className)} {...props} />
));
GlassTableHeaderRow.displayName = "GlassTableHeaderRow";

/** Table body row with hover */
export const GlassTableBodyRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <TableRow ref={ref} className={cn(bodyRowClass, className)} {...props} />
));
GlassTableBodyRow.displayName = "GlassTableBodyRow";

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
};
