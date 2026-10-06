"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { reportsApi } from "@/lib/reports.api";
import { downloadBlob } from "@/lib/download";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { BarChart3, Download, RefreshCw, TrendingUp, Users, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

const DISTRIBUTION_COLORS: Record<string, string> = {
  Completed: "var(--color-luxe-success)",
  "In progress": "var(--color-luxe-info)",
  Pending: "var(--color-luxe-warning)",
  Blocked: "var(--color-luxe-danger)",
};

type DistributionRow = { name?: string; value?: number; count?: number };

export default function ReportsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-reports"],
    queryFn: () => reportsApi.getDashboardData(),
  });
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const report = await reportsApi.generate({ type: "PIPELINE", format: "CSV" });
      const file = await reportsApi.download(report.data.reportId);
      downloadBlob(file, `growthos-pipeline-${report.data.reportId}.csv`);
      return report;
    },
    onSuccess: (result) => setExportStatus(result.data.status),
  });

  const stats: DashboardStats | undefined = data?.data?.stats;
  const recentCampaigns: unknown[] = data?.data?.recentCampaigns ?? [];
  const taskDistribution: DistributionRow[] = (data?.data?.taskDistribution as DistributionRow[]) ?? [];
  const distributionTotal = taskDistribution.reduce(
    (sum, row) => sum + (row.value ?? row.count ?? 0),
    0
  );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">Reports & analytics</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            className="gap-2"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !stats}
          >
            <Download className={cn("h-4 w-4", exportMutation.isPending && "animate-spin")} />
            {exportMutation.isPending ? "Generating…" : exportStatus ? "Download report" : "Export report"}
          </Button>
        </div>
      </div>
      {exportMutation.isError && (
        <p role="alert" className="mb-4 text-sm text-[var(--color-luxe-danger)]">
          {exportMutation.error.message}
        </p>
      )}
      {exportMutation.isSuccess && (
        <p role="status" className="mb-4 text-sm text-[var(--color-luxe-success)]">
          Report generated and downloaded.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load reports"
          description={error instanceof Error ? error.message : undefined}
          onRetry={refetch}
        />
      ) : !stats ? (
        <EmptyState
          title="No data yet"
          description="Campaign activity and reports will appear here once data is available."
          icon={<BarChart3 className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
        />
      ) : (
        <div className="space-y-6">
          {/* Stats cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[var(--color-luxe-info)]" />
                  <CardTitle>Prospects</CardTitle>
                </div>
              </CardHeader>
              <p className="text-3xl font-semibold text-[var(--color-luxe-text)]">{stats.prospectsCount}</p>
              <p className="text-xs text-[var(--color-luxe-muted)]">Total prospects tracked</p>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-[var(--color-luxe-accent)]" />
                  <CardTitle>Tasks completed</CardTitle>
                </div>
              </CardHeader>
              <p className="text-3xl font-semibold text-[var(--color-luxe-text)]">{stats.completedTasksCount}</p>
              <p className="text-xs text-[var(--color-luxe-muted)]">
                of {stats.tasksCount} total tasks
              </p>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[var(--color-luxe-success)]" />
                  <CardTitle>Conversion rate</CardTitle>
                </div>
              </CardHeader>
              <p className="text-3xl font-semibold text-[var(--color-luxe-text)]">
                {stats.conversionRate != null ? `${stats.conversionRate.toFixed(1)}%` : "—"}
              </p>
              <p className="text-xs text-[var(--color-luxe-muted)]">
                Prospect conversion
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Task distribution chart (live backend data) */}
            <Card>
              <CardHeader>
                <CardTitle>Task distribution</CardTitle>
              </CardHeader>
              {distributionTotal === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] text-sm text-[var(--color-luxe-muted)]">
                  No tasks recorded yet.
                </div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={taskDistribution
                          .map((row) => ({
                            name: row.name ?? "Other",
                            value: row.value ?? row.count ?? 0,
                          }))
                          .filter((row) => row.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {taskDistribution.map((row, i) => (
                          <Cell
                            key={i}
                            fill={DISTRIBUTION_COLORS[row.name ?? ""] ?? "var(--color-luxe-accent)"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-luxe-surface-2)",
                          border: "1px solid var(--color-luxe-border)",
                          borderRadius: 8,
                          color: "var(--color-luxe-text)",
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, color: "var(--color-luxe-muted)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Recent campaigns */}
            <Card>
              <CardHeader>
                <CardTitle>Recent campaigns</CardTitle>
              </CardHeader>
              {recentCampaigns.length === 0 ? (
                <p className="text-sm text-[var(--color-luxe-muted)] py-4 text-center">
                  No recent campaigns.
                </p>
              ) : (
                <Table>
                  <TableCaption>Campaign activity</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Prospects</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCampaigns.map((item: unknown, i: number) => {
                      const c = item as { id?: string; name?: string; status?: string; prospectCount?: number };
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-[var(--color-luxe-text)]">
                            {c.name ?? "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.status === "ACTIVE" ? "success" : "muted"}>
                              {c.status ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm text-[var(--color-luxe-muted)]">
                            {c.prospectCount ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          {/* Revenue opportunity */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue opportunity</CardTitle>
            </CardHeader>
            <p className="text-2xl font-semibold text-[var(--color-luxe-text)]">
              {stats.revenueOpportunity != null ? `$${stats.revenueOpportunity.toLocaleString()}` : "—"}
            </p>
            <p className="text-xs text-[var(--color-luxe-muted)]">
              Projected based on qualified prospects and average deal size.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
