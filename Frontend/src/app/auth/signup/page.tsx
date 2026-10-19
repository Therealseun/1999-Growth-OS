"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Lock, Mail, Sparkles, UserRound } from "lucide-react";
import { authApi } from "@/lib/auth.api";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await authApi.register({ name, email, password });
      setAccountMessage(result.message);
      setConfirmationSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn't create your account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--color-luxe-accent)]" aria-hidden="true" />
      </div>
    );
  }

  return (
    <main className="auth-page relative flex min-h-screen justify-center overflow-x-hidden overflow-y-auto px-5 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-luxe-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-luxe-border) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]" aria-hidden="true" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.13), transparent 70%)" }} />

      <div className="relative z-10 w-full max-w-[440px]">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--color-luxe-muted)] transition-colors hover:text-[var(--color-luxe-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to GrowthOS
        </Link>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-luxe-accent)]/30 bg-[var(--color-luxe-surface)]">
            <Sparkles className="h-5 w-5 text-[var(--color-luxe-accent)]" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-[var(--color-luxe-muted)]">
            Join your team and get your work moving.
          </p>
        </div>

        <section className="luxe-card p-6 sm:p-7">
          {confirmationSent ? (
            <div className="space-y-4 text-center" role="status">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-luxe-accent-muted)]">
                <Mail className="h-5 w-5 text-[var(--color-luxe-accent)]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold">Account request received</h2>
              <p className="text-sm leading-6 text-[var(--color-luxe-muted)]">
                {accountMessage} Your request was submitted for{" "}
                <span className="font-medium text-[var(--color-luxe-text)]">{email}</span>.
              </p>
              <Link className="luxe-btn luxe-btn-primary w-full" href="/auth/login">
                Continue to sign in
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
          <>
            {error && (
              <div className="mb-5 rounded-lg border border-[var(--color-luxe-danger)]/30 bg-[var(--color-luxe-danger)]/10 p-3 text-sm text-[var(--color-luxe-danger)]" role="alert">
                {error}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--color-luxe-muted)]">Full name</label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
                <input
                  className="luxe-input luxe-input-with-leading-icon w-full"
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Your name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--color-luxe-muted)]">Work email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
                <input
                  className="luxe-input luxe-input-with-leading-icon w-full"
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--color-luxe-muted)]">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
                <input
                  className="luxe-input luxe-input-with-leading-icon w-full"
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <p className="mt-1.5 text-xs text-[var(--color-luxe-muted-2)]">Use at least 8 characters.</p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-[var(--color-luxe-muted)]">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
                <input
                  className="luxe-input luxe-input-with-leading-icon w-full"
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={cn("luxe-btn luxe-btn-primary mt-2 min-h-11 w-full", submitting && "cursor-not-allowed opacity-70")}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--color-luxe-muted)]">
              Already have an account?{" "}
              <Link className="font-medium text-[var(--color-luxe-accent-strong)] hover:underline" href="/auth/login">
                Sign in
              </Link>
            </p>
          </>
          )}
        </section>
        <p className="mt-5 text-center text-xs text-[var(--color-luxe-muted-2)]">
          New accounts start with employee access. Your team administrator manages elevated roles.
        </p>
      </div>
    </main>
  );
}
