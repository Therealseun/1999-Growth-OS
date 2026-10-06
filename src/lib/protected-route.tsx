"use client";

import { useAuth } from "@/lib/auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import type { UserRole } from "@/lib/types";

const ALLOWED_ROLES: Record<string, UserRole[]> = {
  "/dashboard": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "/campaigns": ["ADMIN", "MANAGER"],
  "/prospects": ["ADMIN", "MANAGER"],
  "/tasks": ["ADMIN"],
  "/team-tasks": ["MANAGER"],
  "/reports": ["ADMIN", "MANAGER"],
  "/workload": ["ADMIN"],
  "/employees": ["ADMIN"],
  "/my-tasks": ["EMPLOYEE"],
  "/email": ["EMPLOYEE"],
  "/seo": ["EMPLOYEE"],
  "/lead-magnets": ["EMPLOYEE"],
  "/my-performance": ["EMPLOYEE"],
};

const LOGIN_PATH = "/auth/login";

function FullScreenLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-luxe-border)] border-t-[var(--color-luxe-accent)]" />
    </div>
  );
}

function Unauthorized({ onBack }: { onBack: () => void }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-[var(--color-luxe-warning)]/30 bg-[var(--color-luxe-warning)]/5 p-10 text-center"
      role="alert"
    >
      <ShieldAlert className="mb-4 h-12 w-12 text-[var(--color-luxe-warning)]" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">Unauthorized</h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--color-luxe-muted)]">
        Your account does not have permission to view this page. If you believe this is a mistake,
        contact an administrator.
      </p>
      <button className="luxe-btn luxe-btn-secondary mt-5" type="button" onClick={onBack}>
        Go to my dashboard
      </button>
    </div>
  );
}

export function ProtectedRoute({
  children,
  requiredRoles,
}: {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const effectiveRoles = requiredRoles ?? ALLOWED_ROLES[pathname] ?? [];
  const roleMismatch = Boolean(user && effectiveRoles.length > 0 && !effectiveRoles.includes(user.role));

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(LOGIN_PATH);
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <FullScreenLoader />;
  }

  if (roleMismatch) {
    return <Unauthorized onBack={() => router.replace("/dashboard")} />;
  }

  return <>{children}</>;
}
