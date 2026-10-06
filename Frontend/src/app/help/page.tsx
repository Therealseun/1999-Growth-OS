"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";
import { Card } from "@/components/ui";
import { ArrowRight, BookOpen, CircleHelp, LifeBuoy, Mail, ShieldCheck } from "lucide-react";

const topics = [
  {
    question: "How do I get started with my work?",
    answer:
      "Open your task queue from the navigation. Review the task details, update its status as you work, and submit evidence when it is complete.",
  },
  {
    question: "Does GrowthOS send emails or post to social media?",
    answer:
      "No. GrowthOS can help prepare drafts and organize work, but you review and send messages yourself using your approved tools.",
  },
  {
    question: "How are workload targets used?",
    answer:
      "Administrators configure targets in Workload Settings. Snapshots retain the target values that were active when the snapshot was recorded.",
  },
  {
    question: "I cannot access a page or update information. What should I do?",
    answer:
      "Access depends on your team role and account status. Contact your GrowthOS administrator to review your permissions or account details.",
  },
];

export default function HelpPage() {
  return (
    <ProtectedRoute>
      <AppShell title="Help & support" breadcrumbs={[{ label: "Help & support" }]}>
        <div className="mx-auto max-w-4xl space-y-7">
          <header>
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface)]">
              <LifeBuoy className="h-5 w-5 text-[var(--color-luxe-accent)]" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-luxe-text)]">
              Help &amp; support
            </h1>
            <p className="mt-1 text-sm text-[var(--color-luxe-muted)]">
              Quick answers about working with GrowthOS.
            </p>
          </header>

          <section aria-labelledby="quick-links">
            <h2 id="quick-links" className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-luxe-muted)]">
              Quick links
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/my-tasks" className="group">
                <Card className="flex h-full items-center gap-4 p-4 transition-colors group-hover:border-[var(--color-luxe-border-strong)]">
                  <BookOpen className="h-5 w-5 shrink-0 text-[var(--color-luxe-accent)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[var(--color-luxe-text)]">Go to my tasks</span>
                    <span className="mt-1 block text-sm text-[var(--color-luxe-muted)]">Review assigned work and submit evidence.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
                </Card>
              </Link>
              <Link href="/profile" className="group">
                <Card className="flex h-full items-center gap-4 p-4 transition-colors group-hover:border-[var(--color-luxe-border-strong)]">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-luxe-accent)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[var(--color-luxe-text)]">Manage your profile</span>
                    <span className="mt-1 block text-sm text-[var(--color-luxe-muted)]">Update your display name and review account details.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
                </Card>
              </Link>
            </div>
          </section>

          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-luxe-muted)]">
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              Frequently asked questions
            </h2>
            <Card className="divide-y divide-[var(--color-luxe-border)] px-5 sm:px-6">
              {topics.map(({ question, answer }) => (
                <details className="group py-4" key={question}>
                  <summary className="cursor-pointer list-none pr-2 font-medium text-[var(--color-luxe-text)] marker:hidden focus-visible:rounded-sm">
                    <span className="flex items-start justify-between gap-4">
                      <span>{question}</span>
                      <span className="text-lg leading-5 text-[var(--color-luxe-accent)] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-3xl pr-8 text-sm leading-6 text-[var(--color-luxe-muted)]">
                    {answer}
                  </p>
                </details>
              ))}
            </Card>
          </section>

          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-luxe-accent)]" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-[var(--color-luxe-text)]">Need more help?</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-luxe-muted)]">
                  Contact your GrowthOS administrator for account access, team settings, or technical support.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
