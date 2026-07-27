import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "primary"
  | "outline"
  | "secondary"
  | "ghost"
  | "quiet"
  | "destructive"
  | "link";

export type ButtonSize = "sm" | "default" | "lg" | "icon" | "icon-sm";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border-action bg-action text-action-foreground hover:border-action-hover hover:bg-action-hover active:border-action-pressed active:bg-action-pressed",
  primary:
    "border-action bg-action text-action-foreground hover:border-action-hover hover:bg-action-hover active:border-action-pressed active:bg-action-pressed",
  outline:
    "border-border-strong bg-surface text-foreground hover:bg-hover active:bg-selected",
  secondary:
    "border-border bg-surface-secondary text-foreground hover:border-border-strong hover:bg-hover active:bg-selected",
  ghost:
    "border-transparent bg-transparent text-foreground-secondary hover:bg-hover hover:text-foreground active:bg-selected",
  quiet:
    "border-transparent bg-transparent text-foreground-secondary hover:bg-hover hover:text-foreground active:bg-selected",
  destructive:
    "border-critical bg-critical text-action-foreground hover:brightness-95 active:brightness-90",
  link:
    "h-auto min-h-0 border-transparent bg-transparent px-0 text-accent underline-offset-4 hover:text-accent-hover hover:underline",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 min-h-9 px-3 text-[13px]",
  default: "h-11 min-h-11 px-4 text-sm",
  lg: "h-12 min-h-12 px-5 text-[15px]",
  icon: "h-11 w-11 min-h-11 min-w-11 p-0",
  "icon-sm": "h-9 w-9 min-h-9 min-w-9 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-sc border font-semibold transition-colors duration-fast disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-surface disabled:text-disabled-foreground",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
