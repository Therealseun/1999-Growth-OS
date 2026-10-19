"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "@/lib/employees.api";
import { departmentsApi } from "@/lib/departments.api";
import {
  Button,
  Input,
  Label,
  SearchInput,
  Badge,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Skeleton,
  Modal,
} from "@/components/ui";
import { Plus, User, MoreHorizontal, Shield, Trash2, X } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

const ROLE_VARIANT: Record<string, "accent" | "muted" | "success"> = {
  ADMIN: "accent",
  MANAGER: "success",
  EMPLOYEE: "muted",
};

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [invite, setInvite] = useState({ name: "", email: "", role: "EMPLOYEE", departmentId: "" });
  const queryClient = useQueryClient();

  const { data: departmentData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.list(),
  });
  const departments = departmentData?.data ?? [];

  const departmentMutation = useMutation({
    mutationFn: () => departmentsApi.create(departmentName.trim()),
    onSuccess: async () => {
      setDepartmentName("");
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", { search }],
    queryFn: () => employeesApi.list({ search: search || undefined }),
  });

  const employees = (data?.data as unknown[]) ?? [];

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => employeesApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => employeesApi.update(id, { status: "ACTIVE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      employeesApi.create({
        name: invite.name.trim(),
        email: invite.email.trim(),
        role: invite.role as "ADMIN" | "MANAGER" | "EMPLOYEE",
        departmentId: invite.departmentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setInvite({ name: "", email: "", role: "EMPLOYEE", departmentId: "" });
      setAddOpen(false);
    },
  });

  return (
    <div>
      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <Label htmlFor="department-name">Department</Label>
            <Input
              id="department-name"
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              placeholder="e.g. Growth"
              className="mt-1"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!departmentName.trim() || departmentMutation.isPending}
            onClick={() => departmentMutation.mutate()}
          >
            {departmentMutation.isPending ? "Adding…" : "Add department"}
          </Button>
          <div className="w-full text-sm text-[var(--color-luxe-muted)]">
            {departments.length ? departments.map((department) => department.name).join(" · ") : "No departments created"}
          </div>
          {departmentMutation.isError && (
            <p className="w-full text-sm text-[var(--color-luxe-danger)]">
              {departmentMutation.error instanceof Error ? departmentMutation.error.message : "Failed to add department."}
            </p>
          )}
        </div>
      </Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-72"
          />
        </div>
        <div>
          <Button className="gap-2" onClick={() => setAddOpen(true)} aria-haspopup="dialog">
            <Plus className="h-4 w-4" />
            Add employee
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load employees"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["employees"] })}
        />
      ) : employees.length === 0 ? (
        <EmptyState
          title="No employees yet"
          description="Add team members to start assigning tasks and tracking performance."
          icon={<User className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((emp: unknown, index: number) => {
            const e = emp as {
              id?: string;
              name?: string;
              email?: string;
              role?: string;
              status?: string;
              departmentName?: string | null;
              avatarUrl?: string | null;
            };
            return (
              <Card key={e.id ?? `employee-${index}`} className="group p-4 transition-colors hover:border-[var(--color-luxe-border-strong)] sm:p-5">
                <CardHeader className="mb-4 items-start gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={e.avatarUrl ?? undefined} alt={e.name ?? ""} />
                      <AvatarFallback>{e.name?.slice(0, 2).toUpperCase() ?? "??"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <CardTitle className="break-words text-sm leading-5 text-[var(--color-luxe-text)] sm:text-base">
                        {e.name ?? "Unknown"}
                      </CardTitle>
                      <p className="mt-1 break-all text-sm leading-5 text-[var(--color-luxe-muted)]">
                        {e.email ?? "—"}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-luxe-border)] text-[var(--color-luxe-muted)] transition-colors hover:border-[var(--color-luxe-border-strong)] hover:bg-[var(--color-luxe-surface-2)] hover:text-[var(--color-luxe-text)]"
                        type="button"
                        aria-label={`Open actions for ${e.name ?? "employee"}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {e.status === "PENDING" && (
                        <DropdownMenuItem
                          onClick={() => e.id && approveMutation.mutate(e.id)}
                        >
                          <Shield className="mr-2 h-4 w-4" />
                          Approve employee
                        </DropdownMenuItem>
                      )}
                      {e.status === "ACTIVE" && (
                        <DropdownMenuItem
                          className="text-[var(--color-luxe-danger)]"
                          onClick={() => e.id && deactivateMutation.mutate(e.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Deactivate employee
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant={ROLE_VARIANT[e.role ?? ""] ?? "muted"}>
                    {ROLE_LABEL[e.role ?? ""] ?? e.role}
                  </Badge>
                  <Badge variant={e.status === "ACTIVE" ? "success" : "muted"}>
                    {e.status ?? "Unknown"}
                  </Badge>
                </div>
                {e.departmentName && (
                  <p className="mt-3 text-sm text-[var(--color-luxe-muted)]">{e.departmentName}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-luxe-text)]">Add employee</h3>
          <button
            onClick={() => setAddOpen(false)}
            className="luxe-btn luxe-btn-ghost p-1"
            type="button"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            inviteMutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="emp-name">Full name</Label>
            <Input
              id="emp-name"
              value={invite.name}
              onChange={(e) => setInvite((i) => ({ ...i, name: e.target.value }))}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="emp-email">Work email</Label>
            <Input
              id="emp-email"
              type="email"
              value={invite.email}
              onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="emp-role">Role</Label>
            <select
              id="emp-role"
              value={invite.role}
              onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
              className="luxe-input mt-1 w-full"
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
            </select>
          </div>
          <div>
            <Label htmlFor="emp-department">Department</Label>
            <select
              id="emp-department"
              value={invite.departmentId}
              onChange={(e) => setInvite((i) => ({ ...i, departmentId: e.target.value }))}
              className="luxe-input mt-1 w-full"
            >
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[var(--color-luxe-muted-2)]">
            An invitation email is sent. New accounts remain pending until an administrator approves them.
          </p>
          {inviteMutation.isError && (
            <p className="text-sm text-[var(--color-luxe-danger)]">
              {inviteMutation.error instanceof Error
                ? inviteMutation.error.message
                : "Failed to add employee."}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Adding…" : "Add employee"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
