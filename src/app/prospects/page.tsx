"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { prospectsApi } from "@/lib/prospects.api";
import type { Prospect } from "@/lib/types";
import {
  Button,
  SearchInput,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  Input,
  Label,
  Modal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { Plus, MoreHorizontal, Mail, User, Building2, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  SEED: "Seed",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
};

const STATUS_VARIANT: Record<string, "accent" | "muted" | "success" | "warning"> = {
  SEED: "muted",
  CONTACTED: "accent",
  QUALIFIED: "success",
  CONVERTED: "success",
};

export default function ProspectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newProspect, setNewProspect] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["prospects", { search, status: statusFilter }],
    queryFn: () =>
      prospectsApi.list({
        search: search || undefined,
        status: statusFilter || undefined,
      }),
  });

  const prospects: Prospect[] = (data?.data as Prospect[]) ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof prospectsApi.update>[1] }) =>
      prospectsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => prospectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setSelectedId(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      prospectsApi.create({
        firstName: newProspect.firstName.trim(),
        lastName: newProspect.lastName.trim(),
        email: newProspect.email.trim(),
        company: newProspect.company.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setNewProspect({ firstName: "", lastName: "", email: "", company: "" });
      setAddOpen(false);
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company…"
            className="w-72"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="luxe-input w-40"
            aria-label="Filter by status"
          >
            <option value="">All status</option>
            <option value="SEED">Seed</option>
            <option value="CONTACTED">Contacted</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="CONVERTED">Converted</option>
          </select>
        </div>
        <div>
          <Button onClick={() => setAddOpen(true)} className="gap-2" aria-haspopup="dialog">
            <Plus className="h-4 w-4" />
            Add prospect
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load prospects"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["prospects"] })}
        />
      ) : prospects.length === 0 ? (
        <EmptyState
          title="No prospects found"
          description="Add prospects or adjust your filters."
          icon={<User className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
        />
      ) : (
        <Table>
          <TableCaption>
            Showing {prospects.length} prospect{prospects.length === 1 ? "" : "s"}
            {statusFilter ? ` matching “${statusFilter}”` : ""}.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Prospect</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prospects.map((prospect) => (
              <TableRow key={prospect.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)] text-sm font-medium text-[var(--color-luxe-muted)]">
                      {prospect.firstName?.[0]}{prospect.lastName?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-luxe-text)] truncate max-w-[180px]">
                        {prospect.firstName} {prospect.lastName}
                      </p>
                      <p className="text-xs text-[var(--color-luxe-muted)] truncate max-w-[180px]">
                        {prospect.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-sm text-[var(--color-luxe-text)]">
                    {prospect.company ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[prospect.status] ?? "muted"}>
                    {STATUS_LABEL[prospect.status] ?? prospect.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-[var(--color-luxe-muted)]">
                  {prospect.source ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-sm text-[var(--color-luxe-muted)] transition-colors hover:border-[var(--color-luxe-border-strong)] hover:text-[var(--color-luxe-text)] focus-visible:border-[var(--color-luxe-accent)]"
                        onClick={() => setSelectedId(prospect.id)}
                        type="button"
                        aria-label={`Open actions for ${prospect.firstName} ${prospect.lastName}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          updateMutation.mutate({
                            id: prospect.id,
                            payload: { status: "CONTACTED" },
                          });
                          setSelectedId(null);
                        }}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Mark contacted
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          updateMutation.mutate({
                            id: prospect.id,
                            payload: { status: "QUALIFIED" },
                          });
                          setSelectedId(null);
                        }}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark qualified
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          updateMutation.mutate({
                            id: prospect.id,
                            payload: { status: "SEED" },
                          });
                          setSelectedId(null);
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reset to seed
                      </DropdownMenuItem>
    
                      <DropdownMenuItem
                        className="text-[var(--color-luxe-danger)]"
                        onClick={() => {
                          deleteMutation.mutate(prospect.id);
                          setSelectedId(null);
                        }}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        Remove prospect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-luxe-text)]">Add prospect</h3>
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
            createMutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="prospect-first">First name</Label>
              <Input
                id="prospect-first"
                value={newProspect.firstName}
                onChange={(e) => setNewProspect((p) => ({ ...p, firstName: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="prospect-last">Last name</Label>
              <Input
                id="prospect-last"
                value={newProspect.lastName}
                onChange={(e) => setNewProspect((p) => ({ ...p, lastName: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="prospect-email">Email</Label>
              <Input
                id="prospect-email"
                type="email"
                value={newProspect.email}
                onChange={(e) => setNewProspect((p) => ({ ...p, email: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="prospect-company">Company</Label>
              <Input
                id="prospect-company"
                value={newProspect.company}
                onChange={(e) => setNewProspect((p) => ({ ...p, company: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-[var(--color-luxe-danger)]">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to add prospect."}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add prospect"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
