"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Play,
  CheckCircle,
  AlertCircle,
  FileText,
  Mail,
  Bookmark,
  Upload,
  X,
  FileCheck,
  Clock,
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
  PENDING: "muted",
  IN_PROGRESS: "accent",
  COMPLETED: "success",
  BLOCKED: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export default function MyTasksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [evidenceType, setEvidenceType] = useState<"LINK" | "SCREENSHOT" | "NOTE">("LINK");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const resetEvidenceForm = () => {
    setEvidenceType("LINK");
    setEvidenceTitle("");
    setEvidenceUrl("");
  };

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

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task["status"] }) =>
      tasksApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });

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
    (activeTab === "pending" ? t.status === "PENDING" :
      activeTab === "in-progress" ? t.status === "IN_PROGRESS" :
      activeTab === "completed" ? t.status === "COMPLETED" :
      t.status === "BLOCKED") &&
    (!search.trim() ||
      `${t.title} ${t.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <div>
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
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in-progress">In progress</TabsTrigger>
          <TabsTrigger value="blocked">Blocked</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        {["pending", "in-progress", "blocked", "completed"].map((tab) => (
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
                  tab === "pending" ? "No pending tasks" :
                  tab === "in-progress" ? "No tasks in progress" :
                  tab === "blocked" ? "No blocked tasks" :
                  "No completed tasks"
                }
                description={
                  tab === "pending"
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
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {task.completedAt && (
                          <span className="flex items-center gap-1 text-[var(--color-luxe-success)]">
                            <FileCheck className="h-3.5 w-3.5" />
                            Completed {new Date(task.completedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {task.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="primary"
                            className="gap-1.5"
                            onClick={() => updateMutation.mutate({ id: task.id, status: "IN_PROGRESS" })}
                          >
                            <Play className="h-3.5 w-3.5" />
                            Start
                          </Button>
                        )}
                        {task.status === "IN_PROGRESS" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5"
                              onClick={() => openEvidence(task.id)}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Submit evidence
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="gap-1.5"
                              onClick={() => updateMutation.mutate({ id: task.id, status: "COMPLETED" })}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Complete
                            </Button>
                          </>
                        )}
                        {(task.status === "PENDING" || task.status === "IN_PROGRESS") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--color-luxe-danger)] gap-1.5 hover:bg-[var(--color-luxe-danger)]/10"
                            onClick={() => updateMutation.mutate({ id: task.id, status: "BLOCKED" })}
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                            Block
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
          Provide proof of task completion. This evidence will be recorded by GrowthOS.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="evidence-type">Evidence type</Label>
            <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Evidence type">
              {(["LINK", "SCREENSHOT", "NOTE"] as const).map((t) => (
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
                  {t === "LINK" ? "Link" : t === "SCREENSHOT" ? "Screenshot" : "Note"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="evidence-title">Title</Label>
            <Input
              id="evidence-title"
              value={evidenceTitle}
              onChange={(e) => setEvidenceTitle(e.target.value)}
              placeholder="Short description of evidence"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="evidence-url">URL / link</Label>
            <Input
              id="evidence-url"
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-1"
            />
          </div>
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
                  title: evidenceTitle.trim() || evidenceType,
                  url: evidenceUrl.trim() || undefined,
                  metadata: evidenceType === "NOTE" ? evidenceUrl.trim() || undefined : undefined,
                },
              })
            }
            disabled={evidenceMutation.isPending || !selectedTaskId}
          >
            <FileCheck className="h-4 w-4" />
            {evidenceMutation.isPending ? "Submitting…" : "Submit evidence"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
