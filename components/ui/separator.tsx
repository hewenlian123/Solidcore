import * as React from "react";

type SeparatorProps = React.HTMLAttributes<HTMLHRElement>;

export function Separator({ className = "", ...props }: SeparatorProps) {
  return <hr className={`border-0 border-t border-white/10 ${className}`.trim()} {...props} />;
}
