import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  onClear?: () => void;
};

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, label = "Search", value, onClear, ...props }, ref) => (
    <div
      className={cn(
        "flex h-11 w-full items-center gap-2 rounded-sc border border-border bg-surface px-3 transition-colors duration-fast hover:border-border-strong focus-within:border-focus focus-within:ring-1 focus-within:ring-focus",
        className,
      )}
    >
      <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-foreground-secondary" />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        className="h-full min-w-0 flex-1 appearance-none bg-transparent text-sm text-foreground placeholder:text-foreground-muted [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {onClear && String(value ?? "").length > 0 ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={onClear}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sc-sm text-foreground-secondary hover:bg-hover hover:text-foreground"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  ),
);
SearchField.displayName = "SearchField";
