"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/tasks.api";
import type { Task } from "@/lib/types";
import {
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  SearchInput,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { ArrowLeft, Play, CheckCircle, Clock, AlertCircle, MoreHorizontal, FileText, Mail, Search, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SEO: <Search className="h-4 w-4" />,
  LEAD_MAGNET: <Bookmark className="h-4 w-4" />,
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

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", { search, status: statusFilter, type: typeFilter }],
    queryFn: () =>
      tasksApi.list({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page: 1,
        pageSize: 50,
      }),
  });

  const tasks: Task[] = (data?.data as Task[]) ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task["status"] }) =>
      tasksApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
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
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="luxe-input w-36"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="EMAIL">Email</option>
            <option value="SEO">SEO</option>
            <option value="LEAD_MAGNET">Lead magnet</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load tasks"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["tasks"] })}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description="Tasks are generated from campaigns and assigned to employees."
          icon={<FileText className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
        />
      ) : (
        <Table>
          <TableCaption>
            Showing {tasks.length} task{tasks.length === 1 ? "" : "s"}.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Assigned to</TableHead>
              <TableHead className="hidden md:table-cell">Due date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)]",
                      task.type === "EMAIL" && "border-l-4 border-l-[var(--color-luxe-info)]",
                      task.type === "SEO" && "border-l-4 border-l-[var(--color-luxe-accent)]",
                      task.type === "LEAD_MAGNET" && "border-l-4 border-l-[var(--color-luxe-success)]"
                    )}>
                      {TYPE_ICON[task.type] ?? <FileText className="h-4 w-4 text-[var(--color-luxe-muted)]" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-luxe-text)] truncate max-w-[200px]">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-[var(--color-luxe-muted)] truncate max-w-[200px]">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-luxe-muted)]">
                    {TYPE_ICON[task.type]}
                    {task.type === "EMAIL" ? "Email" : task.type === "SEO" ? "SEO" : "Lead magnet"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[task.status] ?? "muted"}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-[var(--color-luxe-text)]">
                  {task.assignedToName ?? task.assignedTo ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-[var(--color-luxe-muted)]">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-sm text-[var(--color-luxe-muted)] transition-colors hover:border-[var(--color-luxe-border-strong)] hover:text-[var(--color-luxe-text)] focus-visible:border-[var(--color-luxe-accent)]"
                        type="button"
                        aria-label={`Open actions for ${task.title}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {task.status === "PENDING" && (
                        <DropdownMenuItem
                          onClick={() => updateMutation.mutate({ id: task.id, status: "IN_PROGRESS" })}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Start task
                        </DropdownMenuItem>
                      )}
                      {task.status === "IN_PROGRESS" && (
                        <DropdownMenuItem
                          onClick={() => updateMutation.mutate({ id: task.id, status: "COMPLETED" })}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Mark completed
                        </DropdownMenuItem>
                      )}
                      {(task.status === "PENDING" || task.status === "IN_PROGRESS") && (
                        <DropdownMenuItem
                          onClick={() => updateMutation.mutate({ id: task.id, status: "BLOCKED" })}
                          className="text-[var(--color-luxe-danger)]"
                        >
                          <AlertCircle className="mr-2 h-4 w-4" />
                          Mark blocked
                        </DropdownMenuItem>
                      )}
                      {task.status === "COMPLETED" && (
                        <DropdownMenuItem
                          onClick={() => updateMutation.mutate({ id: task.id, status: "PENDING" })}
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          Reopen task
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
