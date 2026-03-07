"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";

type TableSkeletonRowsProps = {
  columns: number;
  rows?: number;
  rowClassName?: string;
  cellClassName?: string;
};

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-md bg-white/[0.06]",
        className,
      )}
    >
      <div className="absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-[dashboardShimmer_1.6s_ease-in-out_infinite]" />
    </div>
  );
}

export function TableSkeletonRows({
  columns,
  rows = 8,
  rowClassName,
  cellClassName,
}: TableSkeletonRowsProps) {
  const safeCols = Math.max(1, Math.min(24, Number(columns) || 1));
  const safeRows = Math.max(1, Math.min(20, Number(rows) || 1));

  return (
    <>
      {Array.from({ length: safeRows }).map((_, rowIndex) => (
        <TableRow
          // eslint-disable-next-line react/no-array-index-key
          key={`sk-${rowIndex}`}
          className={cn("h-14 border-white/10", rowClassName)}
        >
          {Array.from({ length: safeCols }).map((__, colIndex) => (
            <TableCell
              // eslint-disable-next-line react/no-array-index-key
              key={`sk-${rowIndex}-${colIndex}`}
              className={cn("px-6 py-4", cellClassName)}
            >
              <SkeletonLine
                className={
                  colIndex === 0
                    ? "w-[70%]"
                    : colIndex === safeCols - 1
                      ? "w-[55%]"
                      : "w-full"
                }
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

