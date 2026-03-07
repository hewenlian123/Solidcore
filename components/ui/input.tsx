import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`ios-input h-9 w-full rounded-xl px-3 py-2 text-sm ${className}`.trim()}
      {...props}
    />
  );
}
