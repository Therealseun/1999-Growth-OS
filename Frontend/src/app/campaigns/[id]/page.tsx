"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "@/lib/campaigns.api";
import { reportsApi } from "@/lib/reports.api";
import { downloadBlob } from "@/lib/download";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  EmptyState,
  ErrorState,
  Skeleton,
  Separator,
} from "@/components/ui";
import {
  ArrowLeft,
  Play,
  Pause,
  Archive,
  BarChart3,
  Lightbulb,
  AlertTriangle,
  Users,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { Campaign } from "@/lib/types";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState("details");

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => campaignsApi.get(id),
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["campaign-metrics", id],
    queryFn: () => campaignsApi.getMetrics(id),
    enabled: !!id && activeTab === "metrics",
  });

  const { data: intelligence, isLoading: intelLoading } = useQuery({
    queryKey: ["campaign-intelligence", id],
    queryFn: () => campaignsApi.getNicheIntelligence(id),
    enabled: !!id && activeTab === "intelligence",
  });

  const toggleStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "PAUSED" | "ARCHIVED") =>
      campaignsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const report = await reportsApi.generate({
        type: "PIPELINE",
        campaignId: id,
        format: "CSV",
      });
      const file = await reportsApi.download(report.data.reportId);
      downloadBlob(file, `growthos-campaign-${id}.csv`);
    },
  });

  const campaign: Campaign | undefined = data?.data;

  if (isLoading) {
    return (
      <AppShell title="Campaign" breadcrumbs={[{ label: "Campaigns", href: "/campaigns" }, { label: "Loading…" }]}>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (error || !campaign) {
    return (
      <AppShell title="Campaign" breadcrumbs={[{ label: "Campaigns", href: "/campaigns" }, { label: "Not found" }]}>
        <ErrorState
          title="Campaign not found"
          description={error instanceof Error ? error.message : "The campaign could not be loaded."}
          onRetry={() => router.push("/campaigns")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={campaign.name}
      breadcrumbs={[
        { label: "Campaigns", href: "/campaigns" },
        { label: campaign.name },
      ]}
    >
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Button>
        <div className="flex items-center gap-2">
          {campaign.status !== "ARCHIVED" && (
            <>
              <Button
                variant={campaign.status === "ACTIVE" ? "secondary" : "primary"}
                onClick={() => toggleStatus.mutate(campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                disabled={toggleStatus.isPending}
              >
                {campaign.status === "ACTIVE" ? (
                  <><Pause className="h-4 w-4" /> Pause</>
                ) : (
                  <><Play className="h-4 w-4" /> Activate</>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => toggleStatus.mutate("ARCHIVED")}
                disabled={toggleStatus.isPending}
              >
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <FileText className="h-4 w-4" />
            {exportMutation.isPending ? "Preparing…" : "Export CSV"}
          </Button>
        </div>
      </div>
      {toggleStatus.isError && (
        <p role="alert" className="mb-4 text-sm text-[var(--color-luxe-danger)]">{toggleStatus.error.message}</p>
      )}
      {exportMutation.isError && (
        <p role="alert" className="mb-4 text-sm text-[var(--color-luxe-danger)]">{exportMutation.error.message}</p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="intelligence">Niche Intelligence</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-[var(--color-luxe-muted)] uppercase tracking-wider">Niche</span>
                  <p className="mt-1 text-[var(--color-luxe-text)]">{campaign.niche}</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--color-luxe-muted)] uppercase tracking-wider">Offer</span>
                  <p className="mt-1 text-[var(--color-luxe-text)]">{campaign.offer}</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--color-luxe-muted)] uppercase tracking-wider">Location</span>
                  <p className="mt-1 text-[var(--color-luxe-text)]">{campaign.location}</p>
                </div>
                <div>
                  <span className="text-xs text-[var(--color-luxe-muted)] uppercase tracking-wider">Objective</span>
                  <p className="mt-1 text-[var(--color-luxe-text)]">{campaign.objective}</p>
                </div>
                <Separator className="my-2" />
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-luxe-muted)]">
                  <span>Created {new Date(campaign.createdAt).toLocaleDateString()}</span>
                  <span>Updated {new Date(campaign.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status summary</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-luxe-muted)]">Prospects</span>
                  <span className="text-sm font-semibold text-[var(--color-luxe-text)]">
                    {campaign.prospectCount ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-luxe-muted)]">Tasks</span>
                  <span className="text-sm font-semibold text-[var(--color-luxe-text)]">
                    {campaign.taskCount ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-luxe-muted)]">Status</span>
                  <Badge variant={campaign.status === "ACTIVE" ? "success" : "warning"}>
                    {campaign.status}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="intelligence">
          {intelLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : !intelligence?.data ? (
            <EmptyState
              title="No niche intelligence yet"
              description="Intelligence will appear here after AI research completes for this campaign."
              action={
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["campaign-intelligence", id] })}
                  disabled={intelLoading}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh research
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-[var(--color-luxe-accent-strong)]" />
                    <CardTitle>Niche insights</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-2">
                  {(intelligence.data.insights ?? []).length === 0 ? (
                    <p className="text-sm text-[var(--color-luxe-muted)]">No insights available yet.</p>
                  ) : (
                    (intelligence.data.insights ?? []).map((insight, i) => (
                      <p key={i} className="flex gap-3 text-sm text-[var(--color-luxe-text)]">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-luxe-accent)]" />
                        {typeof insight === "string" ? insight : String(insight)}
                      </p>
                    ))
                  )}
                </div>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-l-2 border-l-[var(--color-luxe-success)]">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-[var(--color-luxe-success)]" />
                      <CardTitle>Opportunities</CardTitle>
                    </div>
                  </CardHeader>
                  <div className="space-y-2">
                    {(intelligence.data.opportunities ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--color-luxe-muted)]">No opportunities identified.</p>
                    ) : (
                      (intelligence.data.opportunities ?? []).map((o, i) => (
                        <p key={i} className="text-sm text-[var(--color-luxe-text)]">
                          • {typeof o === "string" ? o : String(o)}
                        </p>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="border-l-2 border-l-[var(--color-luxe-danger)]">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-[var(--color-luxe-danger)]" />
                      <CardTitle>Risks</CardTitle>
                    </div>
                  </CardHeader>
                  <div className="space-y-2">
                    {(intelligence.data.risks ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--color-luxe-muted)]">No risks identified.</p>
                    ) : (
                      (intelligence.data.risks ?? []).map((r, i) => (
                        <p key={i} className="text-sm text-[var(--color-luxe-text)]">
                          • {typeof r === "string" ? r : String(r)}
                        </p>
                      ))
                    )}
                  </div>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-[var(--color-luxe-info)]" />
                      <CardTitle>Competitors</CardTitle>
                    </div>
                  </CardHeader>
                  <div className="space-y-2">
                    {(intelligence.data.competitors ?? []).length === 0 ? (
                      <p className="text-sm text-[var(--color-luxe-muted)]">No competitor data.</p>
                    ) : (
                      (intelligence.data.competitors ?? []).map((c, i) => (
                        <p key={i} className="text-sm text-[var(--color-luxe-text)]">
                          • {typeof c === "string" ? c : JSON.stringify(c)}
                        </p>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="metrics">
          {metricsLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : !metrics?.data ? (
            <EmptyState
              title="No metrics yet"
              description="Metrics will appear as prospects and tasks are tracked."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Campaign metrics</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-6">
                <MetricItem label="Prospects" value={metrics.data.prospectCount} />
                <MetricItem label="Sent email tasks" value={metrics.data.contactedCount} />
                <MetricItem label="Qualified" value={metrics.data.qualifiedCount} />
                <MetricItem label="Rejected" value={metrics.data.rejectedCount ?? 0} />
                <MetricItem label="Converted" value={metrics.data.convertedCount == null ? "—" : metrics.data.convertedCount} />
                <MetricItem label="Tasks completed" value={metrics.data.tasksCompleted ?? 0} />
                <MetricItem label="Tasks total" value={metrics.data.tasksTotal ?? 0} />
                {(metrics.data.leadsGenerated ?? 0) > 0 && (
                  <MetricItem label="Leads generated" value={metrics.data.leadsGenerated} />
                )}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function MetricItem({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--color-luxe-border)] p-3">
      <span className="text-xs text-[var(--color-luxe-muted)] uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-semibold text-[var(--color-luxe-text)]">{value ?? "—"}</span>
    </div>
  );
}
