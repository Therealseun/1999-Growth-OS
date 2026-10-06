import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "accent" | "muted" | "success" | "warning" | "danger";
}

function Badge({ className, variant = "muted", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "luxe-badge",
        variant === "accent" && "luxe-badge-accent",
        variant === "muted" && "luxe-badge-muted",
        variant === "success" && "bg-[var(--color-luxe-success)]/10 text-[var(--color-luxe-success)] border border-[var(--color-luxe-success)]/20",
        variant === "warning" && "bg-[var(--color-luxe-warning)]/10 text-[var(--color-luxe-warning)] border border-[var(--color-luxe-warning)]/20",
        variant === "danger" && "bg-[var(--color-luxe-danger)]/10 text-[var(--color-luxe-danger)] border border-[var(--color-luxe-danger)]/20",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
