"use client";

import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/reports.api";
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
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, CheckCircle, Clock, Award, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const PERIOD_LABEL: Record<string, string> = {
  TODAY: "Today",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
};

export default function MyPerformancePage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-performance"],
    queryFn: () => reportsApi.getMyPerformance(),
  });

  const records = data?.data ?? [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">My performance</h2>              <Button variant="secondary" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {!isLoading && records.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-[var(--color-luxe-success)]" />
                <CardTitle>Completion rate</CardTitle>
              </div>
            </CardHeader>
            <p className="text-3xl font-semibold text-[var(--color-luxe-text)]">
              {records[0].completionRate.toFixed(1)}%
            </p>
            <p className="text-xs text-[var(--color-luxe-muted)]">
              {records[0].tasksCompleted} of {records[0].tasksTotal} tasks completed
            </p>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[var(--color-luxe-info)]" />
                <CardTitle>Avg. time to complete</CardTitle>
              </div>
            </CardHeader>
            <p className="text-3xl font-semibold text-[var(--color-luxe-text)]">
              {records[0].averageTimeToComplete}h
            </p>
            <p className="text-xs text-[var(--color-luxe-muted)]">
              Average across completed tasks
            </p>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-[var(--color-luxe-accent-strong)]" />
                <CardTitle>Evidence submitted</CardTitle>
              </div>
            </CardHeader>
            <p className="text-3xl font-semibold text-[var(--color-luxe-text)]">
              {records[0].evidenceSubmitted}
            </p>
            <p className="text-xs text-[var(--color-luxe-muted)]">
              Evidence items submitted
            </p>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <ErrorState
              title="Failed to load performance"
              description={error instanceof Error ? error.message : undefined}
              onRetry={() => refetch()}
            />
          ) : records.length === 0 ? (
            <EmptyState
              title="No performance data yet"
              description="Track your progress as you complete tasks and submit evidence."
              icon={<BarChart3 className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Performance over time */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance over time</CardTitle>
                </CardHeader>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={records.map((r) => ({
                        period: PERIOD_LABEL[r.period] ?? r.period,
                        completionRate: r.completionRate,
                        completed: r.tasksCompleted,
                      }))}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-luxe-border)" vertical={false} />
                      <XAxis
                        dataKey="period"
                        tick={{ fill: "var(--color-luxe-muted)", fontSize: 12 }}
                        axisLine={{ stroke: "var(--color-luxe-border)" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "var(--color-luxe-muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-luxe-surface-2)",
                          border: "1px solid var(--color-luxe-border)",
                          borderRadius: 8,
                          color: "var(--color-luxe-text)",
                        }}
                      />
                      <Bar
                        dataKey="completionRate"
                        name="Completion rate"
                        fill="var(--color-luxe-accent)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Rating & targets */}
              <Card>
                <CardHeader>
                  <CardTitle>Targets & rating</CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  {records.map((r) => (
                    <div
                      key={r.period}
                      className="rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-[var(--color-luxe-text)]">
                          {r.period === "TODAY" ? "Today" :
                           r.period === "THIS_WEEK" ? "This week" : "This month"}
                        </span>
                        <Badge variant={r.completionRate >= 80 ? "success" : r.completionRate >= 50 ? "accent" : "danger"}>
                          {r.completionRate >= 80 ? "On track" :
                           r.completionRate >= 50 ? "Needs improvement" : "Behind"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-[var(--color-luxe-muted)] text-xs">Completed</p>
                          <p className="text-[var(--color-luxe-text)] font-medium">{r.tasksCompleted}</p>
                        </div>
                        <div>
                          <p className="text-[var(--color-luxe-muted)] text-xs">Total</p>
                          <p className="text-[var(--color-luxe-text)] font-medium">{r.tasksTotal}</p>
                        </div>
                        <div>
                          <p className="text-[var(--color-luxe-muted)] text-xs">Evidence</p>
                          <p className="text-[var(--color-luxe-text)] font-medium">{r.evidenceSubmitted}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Task history</CardTitle>
            </CardHeader>
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : error ? (
              <ErrorState
                title="Failed to load history"
                description={error instanceof Error ? error.message : undefined}
                onRetry={() => refetch()}
              />
            ) : records.length === 0 ? (
              <EmptyState
                title="No history yet"
                description="Your completed tasks will appear here."
                icon={<Clock className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
              />
            ) : (
              <Table>
                <TableCaption>
                  Performance history by period.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Completion rate</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Avg time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.period}>
                      <TableCell className="font-medium text-[var(--color-luxe-text)]">
                        {r.period === "TODAY" ? "Today" :
                         r.period === "THIS_WEEK" ? "This week" : "This month"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.completionRate >= 80 ? "success" : r.completionRate >= 50 ? "accent" : "danger"}>
                          {r.completionRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-[var(--color-luxe-text)]">{r.tasksCompleted}</TableCell>
                      <TableCell className="text-sm text-[var(--color-luxe-text)]">{r.tasksTotal}</TableCell>
                      <TableCell className="text-sm text-[var(--color-luxe-text)]">{r.evidenceSubmitted}</TableCell>
                      <TableCell className="text-sm text-[var(--color-luxe-muted)]">
                        {r.averageTimeToComplete}h
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
