"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/tasks.api";
import type { Task } from "@/lib/types";
import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  SearchInput,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { Mail, Search, Bookmark, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  EMAIL: "Email",
  SEO: "SEO",
  LEAD_MAGNET: "Lead magnet",
};

const STATUS_VARIANT: Record<string, "accent" | "muted" | "success" | "warning" | "danger"> = {
  READY: "accent",
  REVIEWED: "muted",
  SENT: "success",
  PUBLISHED: "success",
  POSTED: "success",
  SKIPPED: "warning",
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

export default function TeamTasksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-tasks", { search, status: statusFilter }],
    queryFn: () =>
      tasksApi.getTeamTasks({
        status: statusFilter || undefined,
        page: 1,
        pageSize: 50,
      }),
  });

  const tasks: Task[] = (data?.data as Task[]) ?? [];
  const filteredTasks = tasks.filter((task) =>
    !search.trim() ||
    `${task.title} ${task.description ?? ""} ${task.assignedToName ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team tasks…"
          className="w-72"
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load team tasks"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["team-tasks"] })}
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title={search.trim() ? "No matching tasks" : "No team tasks"}
          description={search.trim() ? "Try another search term." : "Tasks assigned to your team will appear here."}
          icon={<FileText className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
        />
      ) : (
        <Table>
          <TableCaption>
            Showing {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"} across your team.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Due date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)]",
                      task.type === "EMAIL" && "border-l-4 border-l-[var(--color-luxe-info)]",
                      task.type === "SEO" && "border-l-4 border-l-[var(--color-luxe-accent)]",
                      task.type === "LEAD_MAGNET" && "border-l-4 border-l-[var(--color-luxe-success)]"
                    )}>
                      {task.type === "EMAIL" ? <Mail className="h-4 w-4 text-[var(--color-luxe-info)]" /> :
                       task.type === "SEO" ? <Search className="h-4 w-4 text-[var(--color-luxe-accent)]" /> :
                       task.type === "LEAD_MAGNET" ? <Bookmark className="h-4 w-4 text-[var(--color-luxe-success)]" /> :
                       <FileText className="h-4 w-4 text-[var(--color-luxe-muted)]" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-luxe-text)] truncate max-w-[180px]">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-[var(--color-luxe-muted)] truncate max-w-[180px]">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-[var(--color-luxe-text)]">
                  {TYPE_LABEL[task.type] ?? task.type}
                </TableCell>
                <TableCell className="text-sm text-[var(--color-luxe-text)]">
                  {task.assignedToName ?? task.assignedTo ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[task.status] ?? "muted"}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-[var(--color-luxe-muted)]">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
