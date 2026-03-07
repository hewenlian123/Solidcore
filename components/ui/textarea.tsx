import * as React from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = "", ...props }: TextareaProps) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none backdrop-blur-xl focus:ring-2 focus:ring-cyan-400/30 ${className}`.trim()}
      {...props}
    />
  );
}
