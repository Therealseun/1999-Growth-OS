"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "@/lib/workspace.api";
import { campaignsApi } from "@/lib/campaigns.api";
import type { Campaign } from "@/lib/types";
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
import { Lighthouse, Target, RefreshCw } from "lucide-react";

type KeywordRow = { keyword: string; volume: string; difficulty: string; intent: string };

function ScoreRing({ score, label }: { score: number; label: string }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const size = 80;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const color =
    pct >= 80
      ? "var(--color-luxe-success)"
      : pct >= 60
      ? "var(--color-luxe-warning)"
      : "var(--color-luxe-danger)";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-luxe-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute mt-3 text-2xl font-semibold text-[var(--color-luxe-text)]">
        {Math.round(pct)}
      </span>
      <span className="mt-1 text-xs text-[var(--color-luxe-muted)]">{label}</span>
    </div>
  );
}

export default function SeoPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("audits");
  const [campaignId, setCampaignId] = useState("");

  const { data: campaignsData } = useQuery({
    queryKey: ["seo-campaigns"],
    queryFn: () => campaignsApi.list({ pageSize: 100 }),
  });
  const campaigns: Campaign[] = (campaignsData?.data as Campaign[]) ?? [];

  const { data: auditsData, isLoading: auditsLoading, error: auditsError } = useQuery({
    queryKey: ["seo-audits", campaignId || undefined],
    queryFn: () => workspaceApi.getSeoAudits(campaignId || undefined),
    enabled: !!campaignId,
  });

  const { data: keywordsData, isLoading: keywordsLoading, error: keywordsError } = useQuery({
    queryKey: ["seo-keywords", campaignId],
    queryFn: () => workspaceApi.getKeywordResearch(campaignId),
    enabled: !!campaignId && activeTab === "keywords",
  });

  const { data: recsData, isLoading: recsLoading, error: recsError } = useQuery({
    queryKey: ["seo-recommendations", campaignId],
    queryFn: () => workspaceApi.getSeoRecommendations(campaignId),
    enabled: !!campaignId && activeTab === "recommendations",
  });

  const audits = auditsData?.data ?? [];
  const keywordRows = (keywordsData?.data as { keywords?: KeywordRow[] } | undefined)?.keywords ?? [];
  const recsPayload = (recsData?.data as { recommendations?: string[]; errors?: { message?: string; severity?: string }[] } | undefined) ?? {};
  const recsList = recsPayload.recommendations ?? [];
  const recsErrors = recsPayload.errors ?? [];

  const runAudit = useMutation({
    mutationFn: (id: string) => workspaceApi.createSeoAudit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seo-audits", campaignId] });
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">SEO workspace</h2>
        <div className="flex items-center gap-2">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="luxe-input w-56"
            aria-label="Select campaign"
          >
            <option value="">Select a campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="gap-2"
            disabled={!campaignId || runAudit.isPending}
            onClick={() => runAudit.mutate(campaignId)}
          >
            <RefreshCw className={`h-4 w-4 ${runAudit.isPending ? "animate-spin" : ""}`} />
            {runAudit.isPending ? "Running…" : "Run audit"}
          </Button>
        </div>
      </div>
      {runAudit.isError && (
        <p role="alert" className="mb-4 text-sm text-[var(--color-luxe-danger)]">{runAudit.error.message}</p>
      )}
      {runAudit.isSuccess && (
        <p role="status" className="mb-4 text-sm text-[var(--color-luxe-success)]">
          Audit record saved. Automated site scanning is not connected yet, so no score has been generated.
        </p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="audits">Audits</TabsTrigger>
          <TabsTrigger value="keywords">Keywords</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="audits">
          {auditsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : auditsError ? (
            <ErrorState
              title="Failed to load audits"
              description={auditsError instanceof Error ? auditsError.message : undefined}
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["seo-audits", campaignId] })}
            />
          ) : audits.length === 0 ? (
            <EmptyState
              title="No SEO audits yet"
              description="Run an audit for a selected campaign to see performance, SEO, and accessibility scores."
              icon={<Lighthouse className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
              action={
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={!campaignId}
                  onClick={() => runAudit.mutate(campaignId)}
                >
                  <RefreshCw className="h-4 w-4" />
                  Run audit
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {audits.map((audit: unknown) => {
                const a = audit as {
                  id?: string;
                  campaignId?: string;
                  overallScore?: number;
                  categories?: Record<string, number>;
                };
                return (
                  <Card key={a.id} className="group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Audit result</CardTitle>
                        <Badge variant={a.overallScore && a.overallScore >= 80 ? "success" : a.overallScore && a.overallScore >= 60 ? "warning" : "danger"}>
                          {a.overallScore != null ? `${Math.round(a.overallScore)}` : "—"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <div className="flex items-center gap-4 py-2">
                      <ScoreRing score={a.overallScore ?? 0} label="Overall" />
                      <div className="flex gap-3 text-xs text-[var(--color-luxe-muted)]">
                        {Object.entries(a.categories ?? {}).map(([k, v]) => (
                          <div key={k} className="text-left">
                            <p className="capitalize text-[var(--color-luxe-muted-2)]">{k}</p>
                            <p className="text-[var(--color-luxe-text)] font-medium">{Math.round(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              }              )}

              {audits.length === 0 && (
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle>No audits for this campaign</CardTitle>
                  </CardHeader>
                  <p className="text-sm text-[var(--color-luxe-muted)]">
                    Run an audit to score performance, accessibility, SEO and best practices.
                  </p>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="keywords">
          <Card>
            <CardHeader>
              <CardTitle>Keyword research</CardTitle>
            </CardHeader>
            {!campaignId ? (
              <EmptyState
                title="Select a campaign to research keywords"
                description="Keyword data is scoped to a campaign and its niche."
                icon={<Target className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
              />
            ) : keywordsLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : keywordsError ? (
              <ErrorState
                title="Failed to load keywords"
                description={keywordsError instanceof Error ? keywordsError.message : undefined}
                onRetry={() => queryClient.invalidateQueries({ queryKey: ["seo-keywords", campaignId] })}
              />
            ) : keywordRows.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {keywordRows.map((kw, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-4 py-3"
                    >
                      <p className="text-sm font-medium text-[var(--color-luxe-text)]">{kw.keyword}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-xs text-[var(--color-luxe-muted)]">{kw.volume} / mo</span>
                        <Badge variant={kw.difficulty === "Low" ? "success" : kw.difficulty === "Medium" ? "accent" : "danger"}>
                          {kw.difficulty}
                        </Badge>
                        <span className="text-xs text-[var(--color-luxe-muted-2)]">{kw.intent}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <p className="text-xs text-[var(--color-luxe-muted-2)]">
                  Keyword research is generated from this campaign’s niche by the GrowthOS research layer.
                </p>
              </div>
            ) : (
              <EmptyState
                title="No keyword data yet"
                description="Keyword research appears after niche intelligence runs for this campaign."
                icon={<Target className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="recommendations">
          {!campaignId ? (
            <EmptyState
              title="Select a campaign"
              description="Recommendations are scoped to a campaign’s latest audit."
              icon={<Target className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
            />
          ) : recsLoading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : recsError ? (
            <ErrorState
              title="Failed to load recommendations"
              description={recsError instanceof Error ? recsError.message : undefined}
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["seo-recommendations", campaignId] })}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              {recsList.length === 0 ? (
                <EmptyState
                  title="No recommendations yet"
                  description="Run an audit to generate prioritized recommendations."
                  icon={<Lighthouse className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
                  action={
                    <Button
                      variant="secondary"
                      className="gap-2"
                      disabled={!campaignId || runAudit.isPending}
                      onClick={() => runAudit.mutate(campaignId)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Run audit
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {recsList.map((rec, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-4 py-3"
                    >
                      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-luxe-accent)]" />
                      <p className="text-sm text-[var(--color-luxe-text)]">{rec}</p>
                    </div>
                  ))}
                </div>
              )}
              <Separator className="my-3" />
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-[var(--color-luxe-text)]">Errors</h4>
                {recsErrors.length === 0 ? (
                  <p className="text-sm text-[var(--color-luxe-muted)]">No errors detected.</p>
                ) : (
                  recsErrors.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-[var(--color-luxe-danger)]/20 bg-[var(--color-luxe-danger)]/5 px-4 py-3"
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-luxe-danger)]" />
                      <div>
                        <p className="text-sm text-[var(--color-luxe-text)]">{e.message}</p>
                        <p className="text-xs text-[var(--color-luxe-danger)] mt-0.5">
                          {e.severity}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
