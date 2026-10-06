import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface SuccessStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function SuccessState({ title, description, action, className }: SuccessStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-[var(--color-luxe-success)]/20 bg-[var(--color-luxe-success)]/5 py-12 px-6 text-center",
        className
      )}
    >
      <CheckCircle2 className="mb-3 h-10 w-10 text-[var(--color-luxe-success)]" aria-hidden="true" />
      <h4 className="text-base font-medium text-[var(--color-luxe-text)]">
        {title ?? "Done"}
      </h4>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-luxe-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { SuccessState };
