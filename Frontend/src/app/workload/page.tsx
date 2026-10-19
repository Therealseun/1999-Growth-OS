"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "@/lib/campaigns.api";
import { workloadApi } from "@/lib/workload.api";
import { Button, Card, CardHeader, CardTitle, Input, Label, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import type { WorkloadTarget, WorkloadSnapshot } from "@/lib/types";
import { RefreshCw } from "lucide-react";

export default function WorkloadPage() {
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [emailTarget, setEmailTarget] = useState("0");
  const [seoTarget, setSeoTarget] = useState("0");
  const [leadTarget, setLeadTarget] = useState("0");
  const [workdays, setWorkdays] = useState("25");

  const campaigns = useQuery({
    queryKey: ["campaigns", "workload-targets"],
    queryFn: () => campaignsApi.list({ page: 1, pageSize: 100 }),
  });
  const targets = useQuery({
    queryKey: ["workload-targets", campaignId],
    queryFn: () => workloadApi.getTargets(campaignId ? { campaignId } : undefined),
  });
  const snapshots = useQuery({
    queryKey: ["workload-snapshots"],
    queryFn: () => workloadApi.getAllSnapshots(),
  });
  const save = useMutation({
    mutationFn: () => workloadApi.updateTarget({
      campaignId: campaignId || undefined,
      effectiveFrom,
      emailDailyTarget: Number(emailTarget),
      seoDailyTarget: Number(seoTarget),
      leadMagnetDailyTarget: Number(leadTarget),
      workdaysPerMonth: Number(workdays),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workload-targets"] });
      queryClient.invalidateQueries({ queryKey: ["workload-snapshots"] });
    },
  });

  const targetRows: WorkloadTarget[] = targets.data?.data ?? [];
  const snapshotRows: WorkloadSnapshot[] = snapshots.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">Campaign workload targets</h2>
        <p className="text-sm text-[var(--color-luxe-muted)]">
          Targets are stored per campaign and effective date. Each save appends a new immutable target record.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Add target version</CardTitle></CardHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="target-campaign">Campaign</Label>
            <select id="target-campaign" className="luxe-input mt-1 w-full" value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">Global default</option>
              {(campaigns.data?.data ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="effective-date">Effective from</Label>
            <Input id="effective-date" type="date" className="mt-1" value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="target-email">Daily email task target</Label>
            <Input id="target-email" type="number" min={0} className="mt-1" value={emailTarget}
              onChange={(event) => setEmailTarget(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="target-seo">Daily SEO task target</Label>
            <Input id="target-seo" type="number" min={0} className="mt-1" value={seoTarget}
              onChange={(event) => setSeoTarget(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="target-lead">Daily lead-magnet task target</Label>
            <Input id="target-lead" type="number" min={0} className="mt-1" value={leadTarget}
              onChange={(event) => setLeadTarget(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="target-workdays">Workdays per month</Label>
            <Input id="target-workdays" type="number" min={1} max={31} className="mt-1" value={workdays}
              onChange={(event) => setWorkdays(event.target.value)} />
          </div>
        </div>
        {save.isError && <p role="alert" className="mt-3 text-sm text-[var(--color-luxe-danger)]">{save.error.message}</p>}
        {save.isSuccess && <p role="status" className="mt-3 text-sm text-[var(--color-luxe-success)]">Target version saved.</p>}
        <div className="mt-4 flex justify-end">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${save.isPending ? "animate-spin" : ""}`} />
            {save.isPending ? "Saving…" : "Save target version"}
          </Button>
        </div>
      </Card>

      {targets.isLoading ? <Skeleton className="h-48 w-full rounded-xl" /> : targets.error ? (
        <ErrorState title="Failed to load campaign targets" description={targets.error.message} />
      ) : targetRows.length === 0 ? (
        <EmptyState title="No campaign targets" description="No target configuration is available for this scope." />
      ) : (
        <Card>
          <CardHeader><CardTitle>Target history</CardTitle></CardHeader>
          <div className="space-y-3">
            {targetRows.map((target) => (
              <div key={target.id} className="grid gap-2 rounded-xl border border-[var(--color-luxe-border)] p-4 text-sm sm:grid-cols-5">
                <span>{target.campaignName ?? "Global default"}</span>
                <span>Effective {target.effectiveFrom}</span>
                <span>Email: {target.emailDailyTarget}</span>
                <span>SEO: {target.seoDailyTarget}</span>
                <span>Lead magnet: {target.leadMagnetDailyTarget}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Daily workload snapshots</CardTitle></CardHeader>
        {snapshots.isLoading ? <Skeleton className="h-48 w-full rounded-xl" /> : snapshots.error ? (
          <ErrorState title="Failed to load snapshots" description={snapshots.error.message} />
        ) : snapshotRows.length === 0 ? (
          <EmptyState title="No daily snapshots yet" description="Snapshots are recorded by the backend workload process." />
        ) : (
          <div className="space-y-3">
            {snapshotRows.map((snapshot) => (
              <div key={snapshot.id} className="grid gap-2 rounded-xl border border-[var(--color-luxe-border)] p-4 text-sm md:grid-cols-4">
                <span>{snapshot.employeeName} · {snapshot.campaignName}</span>
                <span>{snapshot.workDate}</span>
                <span>Completed: {snapshot.totalCompleted}</span>
                <span>Target: {snapshot.emailTarget + snapshot.seoTarget + snapshot.leadMagnetTarget}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
