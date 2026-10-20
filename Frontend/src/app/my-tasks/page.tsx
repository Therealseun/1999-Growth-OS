"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import { tasksApi } from "@/lib/tasks.api";
import {
  Button,
  Badge,
  Card,
  CardHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  SearchInput,
  EmptyState,
  ErrorState,
  Skeleton,
  Input,
  Label,
  Separator,
  Modal,
} from "@/components/ui";
import {
  Search,
  FileText,
  Mail,
  Bookmark,
  Upload,
  X,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

const TYPE_ICON: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SEO: <Search className="h-4 w-4" />,
  LEAD_MAGNET: <Bookmark className="h-4 w-4" />,
};

const TYPE_LABEL: Record<string, string> = {
  EMAIL: "Email",
  SEO: "SEO",
  LEAD_MAGNET: "Lead magnet",
};

const STATUS_VARIANT: Record<string, "accent" | "muted" | "success" | "warning" | "danger"> = {
  READY: "muted",
  REVIEWED: "accent",
  SENT: "success",
  PUBLISHED: "success",
  POSTED: "success",
  SKIPPED: "danger",
  INVALID: "danger",
  EXPIRED: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  READY: "Ready",
  REVIEWED: "Reviewed",
  SENT: "Sent",
  PUBLISHED: "Published",
  POSTED: "Posted",
  SKIPPED: "Skipped",
  INVALID: "Invalid",
  EXPIRED: "Expired",
};

export default function MyTasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("ready");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [evidenceType, setEvidenceType] = useState<"LINK" | "NOTE" | "FILE">("LINK");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const resetEvidenceForm = () => {
    setEvidenceType("LINK");
    setEvidenceTitle("");
    setEvidenceUrl("");
    setEvidenceFile(null);
  };

  const todayQuery = useQuery({
    queryKey: ["tasks-today"],
    queryFn: tasksApi.getTodaySummary,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-tasks", { search, status: statusFilter }],
    queryFn: () =>
      tasksApi.getMyTasks({
        status: statusFilter || undefined,
        page: 1,
        pageSize: 50,
      }),
  });

  const tasks: Task[] = data?.data ?? [];
  const total = data?.total ?? 0;

  const evidenceMutation = useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: string;
      payload: Parameters<typeof tasksApi.submitEvidence>[1];
    }) => tasksApi.submitEvidence(taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      setEvidenceOpen(false);
      setSelectedTaskId(null);
    },
  });

  const openEvidence = (taskId: string) => {
    setSelectedTaskId(taskId);
    resetEvidenceForm();
    setEvidenceOpen(true);
  };

  const filteredTasks = tasks.filter((t) =>
    (activeTab === "ready" ? t.status === "READY" :
      activeTab === "reviewed" ? t.status === "REVIEWED" :
      activeTab === "completed" ? ["SENT", "PUBLISHED", "POSTED"].includes(t.status) :
      ["SKIPPED", "INVALID", "EXPIRED"].includes(t.status)) &&
    (!search.trim() ||
      `${t.title} ${t.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <div>
      {todayQuery.isError ? (
        <p role="alert" className="mb-4 text-sm text-[var(--color-luxe-danger)]">
          Could not load today&apos;s workload: {todayQuery.error.message}
        </p>
      ) : todayQuery.data ? (
        <section className="luxe-card mb-5 p-4" aria-label="Today's workload">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Today&apos;s workload</h2>
              <p className="text-sm text-[var(--color-luxe-muted)]">
                {todayQuery.data.total_completed} of {todayQuery.data.total_required} tasks completed · {todayQuery.data.completion_pct}% complete
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              {todayQuery.data.workstreams.map((workstream) => (
                <span key={workstream.workstream}>
                  {TYPE_LABEL[workstream.workstream]}: {workstream.completed}/{workstream.required} · {workstream.prepared} prepared
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <p className="mb-3 text-xs text-[var(--color-luxe-muted)]" aria-live="polite">
        Showing {filteredTasks.length} of {total} assigned tasks
      </p>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your tasks…"
            className="w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="luxe-input w-40"
            aria-label="Filter by status"
          >
            <option value="">All status</option>
            <option value="READY">Ready</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="SENT">Sent</option>
            <option value="PUBLISHED">Published</option>
            <option value="POSTED">Posted</option>
            <option value="SKIPPED">Skipped</option>
            <option value="INVALID">Invalid</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ready">Ready</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="blocked">Skipped/invalid</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {["ready", "reviewed", "blocked", "completed"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : error ? (
              <ErrorState
                title="Failed to load your tasks"
                description={error instanceof Error ? error.message : undefined}
                onRetry={refetch}
              />
            ) : filteredTasks.length === 0 ? (
              <EmptyState
                title={
                  tab === "ready" ? "No ready tasks" :
                  tab === "reviewed" ? "No reviewed tasks" :
                  tab === "blocked" ? "No skipped or invalid tasks" :
                  "No completed tasks"
                }
                description={
                  tab === "ready"
                    ? "Tasks assigned to you will appear here."
                    : `No tasks in this category right now.`
                }
                icon={<FileText className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
              />
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task) => (
                  <Card key={task.id} className="group">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)]",
                              task.type === "EMAIL" && "border-l-4 border-l-[var(--color-luxe-info)]",
                              task.type === "SEO" && "border-l-4 border-l-[var(--color-luxe-accent)]",
                              task.type === "LEAD_MAGNET" && "border-l-4 border-l-[var(--color-luxe-success)]"
                            )}>
                              {TYPE_ICON[task.type] ?? <FileText className="h-4 w-4 text-[var(--color-luxe-muted)]" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--color-luxe-text)] truncate max-w-[240px]">
                                {task.title}
                              </p>
                              <p className="text-xs text-[var(--color-luxe-muted)] mt-0.5">
                                {TYPE_LABEL[task.type]} · {task.campaignId ? `Campaign #${task.campaignId.slice(0, 6)}` : "No campaign"}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-[var(--color-luxe-muted)] line-clamp-2">
                            {task.description ?? "No description"}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[task.status] ?? "muted"}>
                          {STATUS_LABEL[task.status] ?? task.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <div className="flex items-center justify-between pl-2 pr-3 pb-3">
                      <div className="flex items-center gap-3 text-xs text-[var(--color-luxe-muted)]">
                        {task.completedAt && (
                          <span className="flex items-center gap-1 text-[var(--color-luxe-success)]">
                            <FileCheck className="h-3.5 w-3.5" />
                            Completed {new Date(task.completedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {(task.status === "READY" || task.status === "REVIEWED") && (
                          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openEvidence(task.id)}>
                            <Upload className="h-3.5 w-3.5" />
                            Submit evidence
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Modal open={evidenceOpen} onClose={() => { setEvidenceOpen(false); setSelectedTaskId(null); }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-luxe-text)]">Submit evidence</h3>
          <button
            onClick={() => { setEvidenceOpen(false); setSelectedTaskId(null); }}
            className="luxe-btn luxe-btn-ghost p-1"
            type="button"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-[var(--color-luxe-muted)] mb-4">
          Record an execution URL or text note. GrowthOS does not send emails or publish content.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="evidence-type">Evidence type</Label>
            <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Evidence type">
              {(["LINK", "NOTE", ...(user?.role === "EMPLOYEE" ? ["FILE" as const] : [])] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={evidenceType === t}
                  onClick={() => setEvidenceType(t)}
                  className={cn(
                    "flex-1 rounded-lg border bg-[var(--color-luxe-bg)] px-3 py-2 text-sm transition-colors",
                    evidenceType === t
                      ? "border-[var(--color-luxe-info)] text-[var(--color-luxe-info)]"
                      : "border-[var(--color-luxe-border)] text-[var(--color-luxe-muted)] hover:border-[var(--color-luxe-border-strong)]"
                  )}
                >
                  {t === "LINK" ? "URL" : t === "NOTE" ? "Text note" : "File"}
                </button>
              ))}
            </div>
          </div>
          {evidenceType === "NOTE" && <div>
            <Label htmlFor="evidence-title">Text note</Label>
            <Input
              id="evidence-title"
              value={evidenceTitle}
              onChange={(e) => setEvidenceTitle(e.target.value)}
              placeholder="Describe the execution evidence"
              className="mt-1"
            />
          </div>}
          {evidenceType === "LINK" && <div>
            <Label htmlFor="evidence-url">URL / link</Label>
            <Input
              id="evidence-url"
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-1"
            />
          </div>}
          {evidenceType === "FILE" && <div>
            <Label htmlFor="evidence-file">Evidence file (PNG, JPEG, WebP, or PDF; up to 5 MiB)</Label>
            <Input
              id="evidence-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
              className="mt-1"
            />
          </div>}
          {evidenceMutation.isError && (
            <p className="text-sm text-[var(--color-luxe-danger)]">
              {evidenceMutation.error instanceof Error
                ? evidenceMutation.error.message
                : "Submission failed. Please try again."}
            </p>
          )}
        </div>
        <Separator className="my-4" />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => { setEvidenceOpen(false); setSelectedTaskId(null); }}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            onClick={() =>
              evidenceMutation.mutate({
                taskId: selectedTaskId ?? "",
                payload: {
                  type: evidenceType,
                  url: evidenceUrl.trim() || undefined,
                  note: evidenceType === "NOTE" ? evidenceTitle.trim() || undefined : undefined,
                  file: evidenceType === "FILE" ? evidenceFile ?? undefined : undefined,
                },
              })
            }
            disabled={evidenceMutation.isPending || !selectedTaskId ||
              (evidenceType === "FILE" && !evidenceFile) ||
              (evidenceType === "LINK" && !evidenceUrl.trim()) ||
              (evidenceType === "NOTE" && !evidenceTitle.trim())}
          >
            <FileCheck className="h-4 w-4" />
            {evidenceMutation.isPending ? "Submitting…" : "Submit evidence"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
