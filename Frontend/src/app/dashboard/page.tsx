"use client";

import { useAuth } from "@/lib/auth-provider";
import { ProtectedRoute } from "@/lib/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/reports.api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import type { DashboardStats, Campaign } from "@/lib/types";

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { label?: string; positive: boolean };
  className?: string;
}) {
  return (
    <div className="luxe-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[var(--color-luxe-muted)] uppercase tracking-wider">
            {title}
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-[var(--color-luxe-text)]">
            {value}
          </p>
          {trend && (
            <p
              className={`mt-1 text-xs ${
                trend.positive ? "text-[var(--color-luxe-success)]" : "text-[var(--color-luxe-danger)]"
              }`}
            >
              {trend.label}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-luxe-accent-muted)]">
          <Icon className="h-5 w-5 text-[var(--color-luxe-accent-strong)]" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function DashboardGrid({
  stats,
  campaigns,
  isLoading,
  isError,
  onRetry,
  role,
}: {
  stats: DashboardStats | null;
  campaigns: Campaign[];
  isLoading: boolean;
  isError: boolean | undefined;
  onRetry: () => void;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
}) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-[var(--color-luxe-danger)]/20 bg-[var(--color-luxe-danger)]/5 p-8 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-[var(--color-luxe-danger)]" aria-hidden="true" />
        <p className="text-sm text-[var(--color-luxe-muted)]">
          Could not load dashboard data
        </p>
        <button className="luxe-btn luxe-btn-secondary mt-4" type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-[var(--color-luxe-border)] p-8 text-center">
        <BarChart3 className="mb-3 h-10 w-10 text-[var(--color-luxe-muted-2)]" aria-hidden="true" />
        <p className="text-sm text-[var(--color-luxe-muted)]">
          No data yet — campaigns and activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Campaigns"
          value={stats.campaignsCount}
          icon={Briefcase}
          trend={{ label: `${stats.activeCampaignsCount} active`, positive: true }}
        />
        <StatCard
          title="Prospects"
          value={stats.prospectsCount}
          icon={Users}
          trend={{ label: "Last 30 days", positive: true }}
        />
        <StatCard
          title="Tasks completed"
          value={stats.completedTasksCount}
          icon={CheckCircle2}
          trend={{
            label:
              stats.tasksCount > 0
                ? `${Math.round((stats.completedTasksCount / stats.tasksCount) * 100)}% done`
                : undefined,
            positive: true,
          }}
        />
        <StatCard
          title="Pending tasks"
          value={stats.pendingTasksCount}
          icon={Clock}
          trend={{
            label: stats.pendingTasksCount > 0 ? "Action needed" : "All clear",
            positive: stats.pendingTasksCount === 0,
          }}
        />
      </div>

      {/* Primary content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active campaigns */}
        <div className="lg:col-span-2">
          <div className="luxe-card-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-luxe-muted)]">
                Active campaigns
              </h3>
              <TrendingUp className="h-4 w-4 text-[var(--color-luxe-accent-strong)]" aria-hidden="true" />
            </div>

            {campaigns.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[var(--color-luxe-muted)]">
                  No active campaigns yet.
                </p>
                <p className="mt-1 text-xs text-[var(--color-luxe-muted-2)]">
                  Create a campaign to get started.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {campaigns.map((campaign) => (
                  <li
                    key={campaign.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-4 py-3 transition-colors hover:border-[var(--color-luxe-border-strong)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-luxe-text)]">
                        {campaign.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-luxe-muted)]">
                        {campaign.niche}
                      </p>
                    </div>
                    <span
                      className={`flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${
                        campaign.status === "ACTIVE"
                          ? "bg-[var(--color-luxe-success)]/10 text-[var(--color-luxe-success)] border border-[var(--color-luxe-success)]/20"
                          : campaign.status === "PAUSED"
                          ? "bg-[var(--color-luxe-warning)]/10 text-[var(--color-luxe-warning)] border border-[var(--color-luxe-warning)]/20"
                          : "bg-[var(--color-luxe-surface-2)] text-[var(--color-luxe-muted)] border border-[var(--color-luxe-border)]"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Quick actions / conversion */}
        <div>
          <div className="luxe-card-elevated p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-luxe-muted)]">
              Performance snapshot
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-luxe-muted)]">Conversion rate</span>
                <span className="text-sm font-semibold text-[var(--color-luxe-text)]">
                  {stats.conversionRate ? `${stats.conversionRate.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-luxe-muted)]">Revenue opportunity</span>
                <span className="text-sm font-semibold text-[var(--color-luxe-text)]">
                  {stats.revenueOpportunity
                    ? `$${stats.revenueOpportunity.toLocaleString()}`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-luxe-muted)]">Task completion</span>
                <span className="text-sm font-semibold text-[var(--color-luxe-text)]">
                  {stats.tasksCount > 0
                    ? `${stats.completedTasksCount}/${stats.tasksCount}`
                    : "—"}
                </span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Link
                href={role === "EMPLOYEE" ? "/my-performance" : "/reports"}
                className="luxe-btn luxe-btn-primary flex-1"
              >
                {role === "EMPLOYEE" ? "My performance" : "View reports"}
              </Link>
              <Link
                href={role === "ADMIN" ? "/workload" : role === "MANAGER" ? "/team-tasks" : "/my-tasks"}
                className="luxe-btn luxe-btn-secondary flex-1"
              >
                {role === "ADMIN" ? "Workload" : role === "MANAGER" ? "Team tasks" : "My tasks"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? "EMPLOYEE";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => reportsApi.getDashboardData(),
    staleTime: 1000 * 60,
  });

  const stats = (data?.data?.stats as DashboardStats | undefined) ?? null;
  const recent: Campaign[] = (data?.data?.recentCampaigns as Campaign[]) ?? [];
  const activeCampaigns = recent.filter((c) => c.status === "ACTIVE");
  const campaigns = activeCampaigns.length > 0 ? activeCampaigns : recent;

  return (
    <ProtectedRoute>
      <AppShell title="Dashboard" breadcrumbs={[{ label: "Dashboard" }]}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-luxe-text)]">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-[var(--color-luxe-muted)]">
              Good {getTimeGreeting()}, {user?.name?.split(" ")[0] ?? "there"}.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface)] px-3 py-1.5 text-xs text-[var(--color-luxe-muted)]">
            <span className="uppercase tracking-wider text-[var(--color-luxe-accent-strong)]">
              {role}
            </span>
          </div>
        </div>

        <DashboardGrid
          stats={stats}
          campaigns={campaigns}
          isLoading={isLoading}
          isError={error ? true : undefined}
          onRetry={() => refetch()}
          role={role}
        />
      </AppShell>
    </ProtectedRoute>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
