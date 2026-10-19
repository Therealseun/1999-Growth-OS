"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { prospectsApi } from "@/lib/prospects.api";
import { campaignsApi } from "@/lib/campaigns.api";
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
  QUALIFIED: "Qualified",
  REJECTED: "Rejected",
  NEEDS_REVIEW: "Needs review",
};

const STATUS_VARIANT: Record<string, "accent" | "muted" | "success" | "warning"> = {
  QUALIFIED: "success",
  REJECTED: "warning",
  NEEDS_REVIEW: "muted",
};

export default function ProspectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newProspect, setNewProspect] = useState({
    siftId: "",
    contactName: "",
    email: "",
    organisation: "",
    campaignId: "",
  });
  const campaigns = useQuery({
    queryKey: ["campaigns", "prospects-form"],
    queryFn: () => campaignsApi.list({ page: 1, pageSize: 100 }),
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
        siftId: newProspect.siftId.trim(),
        contactName: newProspect.contactName.trim() || undefined,
        email: newProspect.email.trim() || undefined,
        organisation: newProspect.organisation.trim(),
        campaignId: newProspect.campaignId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      setNewProspect({ siftId: "", contactName: "", email: "", organisation: "", campaignId: "" });
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
            <option value="QUALIFIED">Qualified</option>
            <option value="REJECTED">Rejected</option>
            <option value="NEEDS_REVIEW">Needs review</option>
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
              <TableHead className="hidden sm:table-cell">Sift ID</TableHead>
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
                        {`${prospect.firstName} ${prospect.lastName}`.trim() || "Unnamed contact"}
                      </p>
                      <p className="text-xs text-[var(--color-luxe-muted)] truncate max-w-[180px]">
                        {prospect.email ?? "No email"}
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
                            payload: { status: "NEEDS_REVIEW" },
                          });
                          setSelectedId(null);
                        }}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Needs review
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
                            payload: { status: "REJECTED" },
                          });
                          setSelectedId(null);
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
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
              <Label htmlFor="prospect-sift-id">Sift prospect ID</Label>
              <Input
                id="prospect-sift-id"
                value={newProspect.siftId}
                onChange={(e) => setNewProspect((p) => ({ ...p, siftId: e.target.value }))}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="prospect-contact">Contact name</Label>
              <Input
                id="prospect-contact"
                value={newProspect.contactName}
                onChange={(e) => setNewProspect((p) => ({ ...p, contactName: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="prospect-campaign">Campaign</Label>
              <select id="prospect-campaign" className="luxe-input mt-1 w-full" required value={newProspect.campaignId}
                onChange={(e) => setNewProspect((p) => ({ ...p, campaignId: e.target.value }))}>
                <option value="">Select campaign</option>
                {(campaigns.data?.data ?? []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="prospect-email">Email</Label>
              <Input
                id="prospect-email"
                type="email"
                value={newProspect.email}
                onChange={(e) => setNewProspect((p) => ({ ...p, email: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="prospect-company">Organisation</Label>
              <Input
                id="prospect-company"
                value={newProspect.organisation}
                onChange={(e) => setNewProspect((p) => ({ ...p, organisation: e.target.value }))}
                required
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
            <Button type="submit" disabled={createMutation.isPending || !newProspect.campaignId}>
              {createMutation.isPending ? "Adding…" : "Add prospect"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
