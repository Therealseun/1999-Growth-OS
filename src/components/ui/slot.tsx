import * as SlotPrimitive from "@radix-ui/react-slot";
import React from "react";

interface SlotProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  asChild?: boolean;
  type?: "button" | "submit" | "reset" | undefined;
}

function Slot({ asChild = false, type, ...props }: SlotProps) {
  const Comp = asChild ? SlotPrimitive.Root : "button";
  return (
    <Comp type={type} {...props} />
  );
}

export { Slot };
