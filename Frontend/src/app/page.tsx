"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-provider";
import { ArrowRight, BarChart3, CheckCircle2, Sparkles, Target, Users } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Turn strategy into action",
    description: "Organize campaigns, niche insights, prospects, and the work that moves them forward.",
  },
  {
    icon: Users,
    title: "Keep execution human",
    description: "Give every teammate a clear queue, with evidence and ownership built into the workflow.",
  },
  {
    icon: BarChart3,
    title: "Measure what matters",
    description: "See progress, performance, and workload targets in one focused operating system.",
  },
];

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const destination = isAuthenticated ? "/dashboard" : "/auth/signup";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-luxe-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-luxe-border) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to bottom, black, transparent 75%)",
        }}
      />
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-[32rem] w-[48rem] -translate-x-1/2 rounded-full blur-[130px]"
        aria-hidden="true"
        style={{ background: "radial-gradient(circle, rgba(201,162,39,0.12), transparent 68%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <header className="flex h-20 items-center justify-between border-b border-[var(--color-luxe-border)]">
          <Link href="/" className="flex items-center gap-3" aria-label="1999 GrowthOS home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-luxe-accent)]/30 bg-[var(--color-luxe-surface)]">
              <Sparkles className="h-5 w-5 text-[var(--color-luxe-accent)]" aria-hidden="true" />
            </span>
            <span className="font-semibold tracking-tight">1999 GrowthOS</span>
          </Link>
          <nav className="flex items-center gap-3" aria-label="Account">
            <Link href={isAuthenticated ? "/dashboard" : "/auth/login"} className="luxe-btn luxe-btn-ghost">
              Sign in
            </Link>
            <Link
              href={destination}
              aria-disabled={isLoading}
              className="luxe-btn luxe-btn-primary"
            >
              {isAuthenticated ? "Open dashboard" : "Create account"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <section className="grid min-h-[620px] items-center gap-14 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="max-w-2xl">
            <div className="luxe-badge luxe-badge-accent mb-6 gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-luxe-accent)]" aria-hidden="true" />
              The human-first growth workspace
            </div>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Make growth work
              <span className="block text-[var(--color-luxe-accent-strong)]">move with purpose.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--color-luxe-muted)]">
              From campaign insight to completed work, give your team one clear place to prepare,
              execute, and measure the next move.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={destination} className="luxe-btn luxe-btn-primary min-h-12 px-6 text-base">
                {isAuthenticated ? "Go to your dashboard" : "Get started"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/auth/login" className="luxe-btn luxe-btn-secondary min-h-12 px-6 text-base">
                Sign in to GrowthOS
              </Link>
            </div>
            <p className="mt-5 text-sm text-[var(--color-luxe-muted-2)]">
              AI prepares. Human executes. GrowthOS records and measures.
            </p>
          </div>

          <div className="luxe-card relative mx-auto w-full max-w-lg p-5 shadow-[0_24px_100px_rgba(0,0,0,0.35)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--color-luxe-muted)]">Your work, in motion</p>
                <h2 className="mt-1 text-xl font-semibold">A clearer path to growth</h2>
              </div>
              <span className="rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)] p-2.5">
                <BarChart3 className="h-5 w-5 text-[var(--color-luxe-accent)]" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-7 space-y-3">
              {[
                ["Campaign strategy", "Niche insight → focused priorities"],
                ["Team execution", "Clear ownership → useful evidence"],
                ["Performance", "Real work → measurable progress"],
              ].map(([title, detail], index) => (
                <div
                  className="flex items-center gap-4 rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)]/70 p-4"
                  key={title}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-luxe-accent-muted)] text-sm font-semibold text-[var(--color-luxe-accent-strong)]">
                    0{index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 text-sm text-[var(--color-luxe-muted)]">{detail}</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-luxe-success)]" aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3 border-t border-[var(--color-luxe-border)] pt-5 text-sm text-[var(--color-luxe-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-luxe-success)]" aria-hidden="true" />
              Built for real teams and accountable execution
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-[var(--color-luxe-border)] py-10 md:grid-cols-3 md:py-14" aria-label="Product benefits">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="rounded-xl p-4 sm:p-5" key={title}>
              <Icon className="h-5 w-5 text-[var(--color-luxe-accent)]" aria-hidden="true" />
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-luxe-muted)]">{description}</p>
            </article>
          ))}
        </section>

        <footer className="flex flex-col gap-2 border-t border-[var(--color-luxe-border)] py-6 text-xs text-[var(--color-luxe-muted-2)] sm:flex-row sm:items-center sm:justify-between">
          <span>© 1999 GrowthOS</span>
          <span>Built for focused, accountable growth.</span>
        </footer>
      </div>
    </main>
  );
}
