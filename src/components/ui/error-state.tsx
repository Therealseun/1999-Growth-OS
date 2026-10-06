import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

function ErrorState({ title, description, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-[var(--color-luxe-danger)]/20 bg-[var(--color-luxe-danger)]/5 py-12 px-6 text-center",
        className
      )}
    >
      <AlertCircle className="mb-3 h-10 w-10 text-[var(--color-luxe-danger)]" aria-hidden="true" />
      <h4 className="text-base font-medium text-[var(--color-luxe-text)]">
        {title ?? "Something went wrong"}
      </h4>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-luxe-muted)]">{description}</p>
      )}
      {onRetry && (
        <button
          className="luxe-btn luxe-btn-secondary mt-4"
          onClick={onRetry}
          type="button"
          aria-label="Retry"
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export { ErrorState };
