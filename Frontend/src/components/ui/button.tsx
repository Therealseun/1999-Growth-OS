import * as React from "react";
import { Slot } from "@/components/ui/slot";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
  type?: "button" | "submit" | "reset" | undefined;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        type={type}
        className={cn(
          "luxe-btn",
          variant === "primary" && "luxe-btn-primary",
          variant === "secondary" && "luxe-btn-secondary",
          variant === "ghost" && "luxe-btn-ghost",
          variant === "destructive" && "luxe-btn-ghost text-[var(--color-luxe-danger)] hover:bg-[var(--color-luxe-danger)]/10",
          size === "sm" && "px-3 py-1.5 text-xs",
          size === "lg" && "px-5 py-2.5 text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
