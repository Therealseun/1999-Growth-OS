"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "@/lib/workspace.api";
import { campaignsApi } from "@/lib/campaigns.api";
import type { Campaign } from "@/lib/types";
import {
  Button,
  Input,
  Label,
  Badge,
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
  Modal,
} from "@/components/ui";
import { Bookmark, Plus, FileText } from "lucide-react";
import type { LeadMagnet } from "@/lib/types";

function MagnetRow({ magnet, onView }: { magnet: LeadMagnet; onView: (magnet: LeadMagnet) => void }) {
  const m = magnet;
  return (
    <Card className="group">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{m.name ?? "Unnamed"}</CardTitle>
            <p className="text-sm text-[var(--color-luxe-muted)] mt-1">{m.description ?? "No description"}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="accent">{m.type}</Badge>
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-luxe-muted-2)]">{m.status}</span>
          </div>
        </div>
      </CardHeader>
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-[var(--color-luxe-muted)]">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-[var(--color-luxe-muted)] hover:text-[var(--color-luxe-text)]"
            onClick={() => onView(m)}
          >
            <FileText className="h-3.5 w-3.5" />
            View details
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function LeadMagnetsPage() {
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState("");
  const [activeTab, setActiveTab] = useState("library");
  const [selectedMagnet, setSelectedMagnet] = useState<LeadMagnet | null>(null);

  const { data: campaignsData } = useQuery({
    queryKey: ["lead-magnet-campaigns"],
    queryFn: () => campaignsApi.list({ pageSize: 100 }),
  });
  const campaigns: Campaign[] = (campaignsData?.data as Campaign[]) ?? [];

  const { data: magnetsData, isLoading: magnetsLoading, error: magnetsError } = useQuery({
    queryKey: ["lead-magnets", campaignId || undefined],
    queryFn: () => workspaceApi.getLeadMagnets(campaignId || undefined),
  });

  const magnets = magnetsData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; type: string; description: string; campaignId?: string; content?: string }) =>
      workspaceApi.createLeadMagnet(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-magnets"] });
      setName("");
      setType("pdf");
      setDescription("");
      setContent("");
      setActiveTab("library");
    },
  });

  const [name, setName] = useState("");
  const [type, setType] = useState("pdf");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">Lead magnets</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="luxe-input w-56"
            aria-label="Select campaign"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" className="gap-2" onClick={() => setActiveTab("create")}>
            <Plus className="h-4 w-4" />
            New lead magnet
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
        </TabsList>

        <TabsContent value="library">
          {magnetsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : magnetsError ? (
            <ErrorState
              title="Failed to load lead magnets"
              description={magnetsError instanceof Error ? magnetsError.message : undefined}
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["lead-magnets", campaignId] })}
            />
          ) : magnets.length === 0 ? (
            <EmptyState
              title="No lead magnets yet"
              description="Create lead magnets to help prospects convert into qualified leads."
              icon={<Bookmark className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
              action={
                <Button className="gap-2" onClick={() => setActiveTab("create")}>
                  <Plus className="h-4 w-4" />
                  Create lead magnet
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {magnets.map((magnet) => (
                <MagnetRow key={magnet.id} magnet={magnet} onView={setSelectedMagnet} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create lead magnet</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="lm-name">Name</Label>
                  <Input
                    id="lm-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="HR Compliance Checklist"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="lm-type">Type</Label>
                  <select
                    id="lm-type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="luxe-input mt-1 w-full"
                  >
                    <option value="pdf">PDF</option>
                    <option value="template">Template</option>
                    <option value="video">Video</option>
                    <option value="tool">Tool</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="lm-desc">Description</Label>
                  <textarea
                    id="lm-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what this lead magnet covers and who it targets…"
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-3 py-2 text-sm text-[var(--color-luxe-text)] placeholder:text-[var(--color-luxe-muted-2)] focus:border-[var(--color-luxe-accent)] focus:outline-none resize-y"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="lm-content">Content</Label>
                  <textarea
                    id="lm-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Draft the lead magnet content"
                    rows={8}
                    className="mt-1 w-full rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-3 py-2 text-sm text-[var(--color-luxe-text)] focus:border-[var(--color-luxe-accent)] focus:outline-none resize-y"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setActiveTab("library")}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate({
                    name: name.trim(),
                    type,
                    description: description.trim(),
                    campaignId: campaignId || undefined,
                    content: content || undefined,
                  })}
                  disabled={createMutation.isPending || !name.trim() || !description.trim()}
                >
                  {createMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </div>
              {createMutation.isError && (
                <p role="alert" className="text-sm text-[var(--color-luxe-danger)]">
                  {createMutation.error.message}
                </p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Modal open={selectedMagnet !== null} onClose={() => setSelectedMagnet(null)}>
        {selectedMagnet && (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--color-luxe-text)]">{selectedMagnet.name}</h3>
                <p className="mt-1 text-sm text-[var(--color-luxe-muted)]">{selectedMagnet.description}</p>
              </div>
              <Badge variant="accent">{selectedMagnet.type}</Badge>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-luxe-text)]">
              {selectedMagnet.content || "No content has been added yet."}
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedMagnet(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
