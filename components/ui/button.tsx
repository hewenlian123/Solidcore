import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "icon";
};

export function Button({ className = "", variant = "default", size = "default", type = "button", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
  const variantClass =
    variant === "outline"
      ? "border border-white/[0.10] bg-white/[0.05] text-white backdrop-blur-xl hover:brightness-110"
      : variant === "secondary"
        ? "border border-white/[0.10] bg-white/[0.05] text-white backdrop-blur-xl hover:brightness-110"
        : variant === "ghost"
          ? "text-slate-200 hover:bg-white/[0.06]"
          : "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg hover:brightness-110";
  const sizeClass = size === "icon" ? "h-9 w-9" : "h-9 px-4";
  return <button type={type} className={`${base} ${variantClass} ${sizeClass} ${className}`.trim()} {...props} />;
}
