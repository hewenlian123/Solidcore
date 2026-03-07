import * as React from "react";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className = "", ...props }: LabelProps) {
  return <label className={`text-sm font-medium text-slate-300 ${className}`.trim()} {...props} />;
}
