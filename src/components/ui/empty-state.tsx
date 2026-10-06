import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface)] py-12 px-6 text-center",
        className
      )}
    >
      {icon ?? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)]">
          <Inbox className="h-6 w-6 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
        </div>
      )}
      <h4 className="mb-1 text-base font-medium text-[var(--color-luxe-text)]">{title}</h4>
      {description && (
        <p className="max-w-sm text-sm text-[var(--color-luxe-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
