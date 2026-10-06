"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full border border-zinc-700 border-t-zinc-50" />
      </div>
    );
  }

  return (
    <div className="auth-page relative flex min-h-screen justify-center overflow-y-auto p-6">
      {/* Background grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(var(--color-luxe-border) 1px, transparent 1px),
                            linear-gradient(90deg, var(--color-luxe-border) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          opacity: 0.25,
        }}
      />

      {/* Accent gradient glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(201,162,39,0.18) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-luxe-accent)]/30 bg-[var(--color-luxe-surface)] shadow-[0_0_30px_var(--color-luxe-accent)_20%]">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#0b0d10" />
              <path
                d="M8 10h16v2H8zm0 5h12v2H8zm0 5h16v2H8z"
                fill="#c9a227"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-luxe-text)]">
            1999 GrowthOS
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-luxe-muted)]">
            AI prepares. Human executes.
          </p>
        </div>

        {/* Login card */}
        <div className="luxe-card p-6">
          <h2 className="mb-1 text-lg font-semibold text-[var(--color-luxe-text)]">
            Welcome back
          </h2>
          <p className="mb-6 text-sm text-[var(--color-luxe-muted)]">
            Sign in to your account to continue
          </p>

          {error && (
            <div
              className="mb-4 rounded-lg border border-[var(--color-luxe-danger)]/30 bg-[var(--color-luxe-danger)]/10 p-3 text-sm text-[var(--color-luxe-danger)]"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[var(--color-luxe-muted)]"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="luxe-input luxe-input-with-leading-icon w-full"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--color-luxe-muted)]"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="luxe-input luxe-input-with-leading-icon w-full"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className={cn(
                "luxe-btn luxe-btn-primary w-full",
                loading && "opacity-70 cursor-not-allowed"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--color-luxe-muted)]">
            New to GrowthOS?{" "}
            <Link className="font-medium text-[var(--color-luxe-accent-strong)] hover:underline" href="/auth/signup">
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-luxe-muted-2)]">
          Protected area — authorized personnel only.
        </p>
      </div>
    </div>
  );
}
