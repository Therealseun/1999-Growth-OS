"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

function Modal({ open, onClose, children, className }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[var(--color-luxe-bg)]/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn("relative z-10 w-full max-w-lg rounded-2xl p-6 shadow-2xl", className)}>
        {children}
      </div>
    </div>
  );
}

export { Modal };
