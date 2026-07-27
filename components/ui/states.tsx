import * as React from "react";
import { AlertTriangle, CheckCircle2, Inbox, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type StateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

function StateFrame({
  className,
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: StateProps & { icon: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center",
        className,
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center text-foreground-secondary">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm leading-[22px] text-foreground-secondary">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateFrame {...props} icon={<Inbox aria-hidden="true" className="h-6 w-6" />} />;
}

export function ErrorState(props: StateProps) {
  return (
    <StateFrame
      {...props}
      icon={<AlertTriangle aria-hidden="true" className="h-6 w-6 text-critical" />}
    />
  );
}

export function SuccessState(props: StateProps) {
  return (
    <StateFrame
      {...props}
      icon={<CheckCircle2 aria-hidden="true" className="h-6 w-6 text-success" />}
    />
  );
}

export function LoadingState({
  title = "Loading",
  description = "Please wait.",
  className,
}: Partial<StateProps>) {
  return (
    <StateFrame
      className={className}
      title={title}
      description={description}
      icon={<LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin" />}
    />
  );
}
