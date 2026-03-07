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

const wrapper =
  "overflow-hidden rounded-2xl border border-white/[0.10] bg-gradient-to-b from-white/[0.12] to-white/[0.03] backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]";
const headerRow = "border-b border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.06]";
const bodyRow = "border-b border-white/10 transition-colors duration-150 hover:bg-white/[0.06]";

export interface GlassTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const GlassTable = React.forwardRef<HTMLDivElement, GlassTableProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn(wrapper, className)} {...props}>
      {children}
    </div>
  ),
);
GlassTable.displayName = "GlassTable";

export const GlassTableHeaderRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <TableRow ref={ref} className={cn(headerRow, className)} {...props} />
));
GlassTableHeaderRow.displayName = "GlassTableHeaderRow";

export const GlassTableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <TableRow ref={ref} className={cn(bodyRow, className)} {...props} />
));
GlassTableRow.displayName = "GlassTableRow";

export { Table, TableHeader, TableBody, TableHead, TableCell, TableRow };

