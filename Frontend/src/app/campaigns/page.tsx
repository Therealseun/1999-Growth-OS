"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "@/lib/campaigns.api";
import { departmentsApi } from "@/lib/departments.api";
import { useAuth } from "@/lib/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Input,
  Label,
  SearchInput,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import Link from "next/link";
import { Plus, X, Play, Pause } from "lucide-react";
import type { Campaign } from "@/lib/types";

function CampaignRow({ campaign, onStatusChange }: { campaign: Campaign; onStatusChange?: () => void }) {
  return (
    <Card className="group transition-colors hover:border-[var(--color-luxe-border-strong)]">
      <CardHeader>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <Link
              href={`/campaigns/${campaign.id}`}
              className="text-base font-semibold text-[var(--color-luxe-text)] hover:text-[var(--color-luxe-accent-strong)]"
            >
              {campaign.name}
            </Link>
            <p className="text-sm text-[var(--color-luxe-muted)] truncate">{campaign.niche}</p>
          </div>
          <Badge
            variant={
              campaign.status === "ACTIVE" ? "success" : campaign.status === "PAUSED" ? "warning" : "muted"
            }
          >
            {campaign.status}
          </Badge>
        </div>
        {campaign.status !== "ARCHIVED" && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.preventDefault();
                onStatusChange?.();
              }}
              className="luxe-btn luxe-btn-ghost p-1.5 text-[var(--color-luxe-muted)] hover:text-[var(--color-luxe-text)]"
              type="button"
              aria-label={campaign.status === "ACTIVE" ? "Pause campaign" : "Activate campaign"}
            >
              {campaign.status === "ACTIVE" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </div>
        )}
      </CardHeader>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--color-luxe-muted)]">
        <span>Offer: {campaign.offer}</span>
        <span>Location: {campaign.location}</span>
        {campaign.prospectCount != null && (
          <span>{campaign.prospectCount} prospects</span>
        )}
        {campaign.taskCount != null && <span>{campaign.taskCount} tasks</span>}
      </div>
    </Card>
  );
}

function CreateModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [offer, setOffer] = useState("");
  const [location, setLocation] = useState("");
  const [objective, setObjective] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const departments = useQuery({ queryKey: ["departments"], queryFn: () => departmentsApi.list(), enabled: open && user?.role === "ADMIN" });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof campaignsApi.create>[0]) => campaignsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onSuccess?.();
      resetForm();
      onClose();
    },
  });

  const resetForm = () => {
    setName("");
    setNiche("");
    setOffer("");
    setLocation("");
    setObjective("");
    setDepartmentId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !niche.trim() || !offer.trim() || !location.trim()) return;
    createMutation.mutate({
      name,
      niche,
      offer,
      location,
      objective,
      departmentId: user?.role === "ADMIN" ? departmentId : undefined,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-luxe-bg)]/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close campaign dialog"
      />
      <Card className="relative z-10 w-full max-w-lg rounded-2xl p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="create-campaign-title">
        <div className="mb-5 flex items-center justify-between">
          <h3 id="create-campaign-title" className="text-lg font-semibold text-[var(--color-luxe-text)]">Create campaign</h3>
          <button
            onClick={onClose}
            className="luxe-btn luxe-btn-ghost p-1"
            type="button"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q4 Enterprise Outreach"
                required
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="campaign-niche">Niche</Label>
              <Input
                id="campaign-niche"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="SaaS for mid-market HR teams"
                required
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="campaign-offer">Offer</Label>
              <Input
                id="campaign-offer"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="What is being promoted"
                required
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="campaign-location">Location</Label>
              <Input
                id="campaign-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Target location"
                required
                className="mt-1"
              />
            </div>
            {user?.role === "ADMIN" && (
              <div className="sm:col-span-2">
                <Label htmlFor="campaign-department">Department</Label>
                <select id="campaign-department" className="luxe-input mt-1 w-full" value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)} required>
                  <option value="">Select department</option>
                  {(departments.data?.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="campaign-objective">Objective</Label>
              <textarea
                id="campaign-objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="What should this campaign achieve"
                rows={3}
                className="mt-1 w-full rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-3 py-2 text-sm text-[var(--color-luxe-text)] placeholder:text-[var(--color-luxe-muted-2)] focus:border-[var(--color-luxe-accent)] focus:outline-none"
              />
            </div>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-[var(--color-luxe-danger)]">
              {createMutation.error instanceof Error ? createMutation.error.message : "Create failed"}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !name.trim() || !niche.trim() || !offer.trim() || !location.trim() || (user?.role === "ADMIN" && !departmentId)}
            >
              {createMutation.isPending ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns", { search, status: statusFilter }],
    queryFn: () => campaignsApi.list({ search: search || undefined, status: statusFilter || undefined }),
  });

  const campaigns: Campaign[] = (data?.data as Campaign[]) ?? [];

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "PAUSED" }) =>
      campaignsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  return (
    <AppShell title="Campaigns" breadcrumbs={[{ label: "Campaigns" }]}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="luxe-input w-36"
            aria-label="Filter by status"
          >
            <option value="">All status</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <div>
          <Button onClick={() => setCreateOpen(true)} aria-haspopup="dialog">
            <Plus className="h-4 w-4" />
            New campaign
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load campaigns"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["campaigns"] })}
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign to start building pipeline."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create campaign
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              onStatusChange={() =>
                toggleStatus.mutate({
                  id: campaign.id,
                  status:
                    campaign.status === "ACTIVE"
                      ? "PAUSED"
                      : "ACTIVE",
                })
              }
            />
          ))}
        </div>
      )}

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </AppShell>
  );
}
