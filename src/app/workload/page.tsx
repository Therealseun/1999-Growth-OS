"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workloadApi } from "@/lib/workload.api";
import type { WorkloadTarget, WorkloadSnapshot } from "@/lib/types";
import {
  Button,
  Input,
  Label,
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
import { Settings, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface TargetForm {
  dailyTaskTarget: string;
  weeklyTaskTarget: string;
  activeCampaignsTarget: string;
}

function TargetCard({
  role,
  label,
  target,
  onSave,
  isSaving,
}: {
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  label: string;
  target?: WorkloadTarget;
  onSave: (values: TargetForm) => void;
  isSaving: boolean;
}) {
  const fallback = {
    id: "",
    role,
    dailyTaskTarget: 0,
    weeklyTaskTarget: 0,
    activeCampaignsTarget: null,
    updatedAt: "",
  };
  const current = target ?? fallback;

  const [form, setForm] = useState<TargetForm>({
    dailyTaskTarget: String(current.dailyTaskTarget),
    weeklyTaskTarget: String(current.weeklyTaskTarget),
    activeCampaignsTarget: current.activeCampaignsTarget != null ? String(current.activeCampaignsTarget) : "",
  });

  const dirty =
    form.dailyTaskTarget !== String(current.dailyTaskTarget) ||
    form.weeklyTaskTarget !== String(current.weeklyTaskTarget) ||
    form.activeCampaignsTarget !== (current.activeCampaignsTarget != null ? String(current.activeCampaignsTarget) : "");

  const update = (patch: Partial<TargetForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[var(--color-luxe-accent-strong)]" />
          <CardTitle>{label}</CardTitle>
        </div>
      </CardHeader>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`daily-${role}`}>Daily task target</Label>
            <Input
              id={`daily-${role}`}
              type="number"
              min={0}
              value={form.dailyTaskTarget}
              onChange={(e) => update({ dailyTaskTarget: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`weekly-${role}`}>Weekly task target</Label>
            <Input
              id={`weekly-${role}`}
              type="number"
              min={0}
              value={form.weeklyTaskTarget}
              onChange={(e) => update({ weeklyTaskTarget: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`campaigns-${role}`}>Active campaigns target</Label>
            <Input
              id={`campaigns-${role}`}
              type="number"
              min={0}
              value={form.activeCampaignsTarget}
              onChange={(e) => update({ activeCampaignsTarget: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <span className="text-xs text-[var(--color-luxe-warning)]">Unsaved changes</span>
          )}
          <Button
            variant="secondary"
            disabled={isSaving || !dirty}
            className="gap-2"
            onClick={() => onSave(form)}
          >
            <RefreshCw className={cn("h-4 w-4", isSaving && "animate-spin")} />
            {isSaving ? "Saving…" : "Save targets"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SnapshotCard({ snapshots }: { snapshots: WorkloadSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <EmptyState
        title="No historical snapshots yet"
        description="Snapshots are captured from backend data as workload is recorded."
        icon={<RefreshCw className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical workload snapshots</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {snapshots.map((snapshot) => (
          <div
            key={snapshot.id}
            className="flex items-center justify-between rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--color-luxe-text)]">
                  {snapshot.period === "TODAY" ? "Today" :
                   snapshot.period === "THIS_WEEK" ? "This week" : "This month"}
                </p>
                <p className="text-xs text-[var(--color-luxe-muted)]">
                  Captured {new Date(snapshot.capturedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <span>Completed: <strong className="text-[var(--color-luxe-text)]">{snapshot.tasksCompleted}</strong></span>
                <span>Assigned: <strong className="text-[var(--color-luxe-text)]">{snapshot.tasksAssigned}</strong></span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--color-luxe-muted)]">
              <span>Target snapshot:</span>
              <span className="rounded-md border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)] px-2 py-0.5">
                {snapshot.targetSnapshot.dailyTaskTarget}/
                {snapshot.targetSnapshot.weeklyTaskTarget}/
                {snapshot.targetSnapshot.activeCampaignsTarget ?? "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function WorkloadPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("settings");

  const { data: targetsData, isLoading: targetsLoading, error: targetsError } = useQuery({
    queryKey: ["workload-targets"],
    queryFn: () => workloadApi.getTargets(),
  });

  const { data: snapshotsData, isLoading: snapshotsLoading, error: snapshotsError } = useQuery({
    queryKey: ["workload-snapshots"],
    queryFn: () => workloadApi.getAllSnapshots(),
  });

  const targets: WorkloadTarget[] = targetsData?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({
      role,
      payload,
    }: {
      role: "ADMIN" | "MANAGER" | "EMPLOYEE";
      payload: Parameters<typeof workloadApi.updateTarget>[1];
    }) => workloadApi.updateTarget(role, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workload-targets"] });
      queryClient.invalidateQueries({ queryKey: ["workload-snapshots"] });
    },
  });

  const selectedTarget = (
    role: "ADMIN" | "MANAGER" | "EMPLOYEE"
  ): WorkloadTarget | undefined => targets.find((t) => t.role === role);

  const handleSave = (
    role: "ADMIN" | "MANAGER" | "EMPLOYEE",
    values: TargetForm
  ) => {
    const daily = Number(values.dailyTaskTarget);
    const weekly = Number(values.weeklyTaskTarget);
    const campaigns = values.activeCampaignsTarget !== "" ? Number(values.activeCampaignsTarget) : undefined;
    updateMutation.mutate({
      role,
      payload: {
        dailyTaskTarget: daily,
        weeklyTaskTarget: weekly,
        activeCampaignsTarget: campaigns,
      },
    });
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">Workload settings</h2>
        <p className="text-sm text-[var(--color-luxe-muted)]">
          All workload values are configured dynamically — never hardcoded.
        </p>
      </div>

      {targetsLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : targetsError ? (
        <ErrorState
          title="Failed to load workload settings"
          description={targetsError instanceof Error ? targetsError.message : undefined}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["workload-targets"] })}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="settings">Targets</TabsTrigger>
            <TabsTrigger value="history">Snapshot history</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <div className="space-y-6">
              {updateMutation.isError && (
                <p role="alert" className="text-sm text-[var(--color-luxe-danger)]">{updateMutation.error.message}</p>
              )}
              {updateMutation.isSuccess && (
                <p role="status" className="text-sm text-[var(--color-luxe-success)]">Workload target saved.</p>
              )}
              <TargetCard
                key={`admin-${selectedTarget("ADMIN")?.updatedAt ?? "none"}`}
                role="ADMIN"
                label="Admin workload targets"
                target={selectedTarget("ADMIN")}
                onSave={(v) => handleSave("ADMIN", v)}
                isSaving={updateMutation.isPending}
              />
              <Separator />
              <TargetCard
                key={`manager-${selectedTarget("MANAGER")?.updatedAt ?? "none"}`}
                role="MANAGER"
                label="Manager workload targets"
                target={selectedTarget("MANAGER")}
                onSave={(v) => handleSave("MANAGER", v)}
                isSaving={updateMutation.isPending}
              />
              <Separator />
              <TargetCard
                key={`employee-${selectedTarget("EMPLOYEE")?.updatedAt ?? "none"}`}
                role="EMPLOYEE"
                label="Employee workload targets"
                target={selectedTarget("EMPLOYEE")}
                onSave={(v) => handleSave("EMPLOYEE", v)}
                isSaving={updateMutation.isPending}
              />
              <p className="text-xs text-[var(--color-luxe-muted-2)]">
                Targets are applied per role. Historical snapshots preserve the target values active at the
                time they were captured.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="history">
            {snapshotsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : snapshotsError ? (
              <ErrorState
                title="Failed to load snapshots"
                description={snapshotsError instanceof Error ? snapshotsError.message : undefined}
                onRetry={() => queryClient.invalidateQueries({ queryKey: ["workload-snapshots"] })}
              />
            ) : (
              <SnapshotCard snapshots={snapshotsData?.data ?? []} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
