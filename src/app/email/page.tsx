"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "@/lib/workspace.api";
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
import { Mail, Plus, Send, FileText, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailDraft, EmailTemplate } from "@/lib/types";

function EmailRow({ email, onMarkSent }: { email: EmailDraft; onMarkSent?: () => void }) {
  const e = email;
  const isSent = e.status === "SENT";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-4 py-3 transition-colors hover:border-[var(--color-luxe-border-strong)]">
      <div className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full",
        isSent ? "bg-[var(--color-luxe-success)]/10 text-[var(--color-luxe-success)]" : "bg-[var(--color-luxe-surface-2)] text-[var(--color-luxe-muted)]"
      )}>
        {isSent ? <CheckCircle className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-luxe-text)] truncate max-w-[220px]">
          {e.subject ?? "No subject"}
        </p>
        <p className="text-xs text-[var(--color-luxe-muted)]">
          {isSent ? `Sent ${e.sentAt ? new Date(e.sentAt).toLocaleString() : ""}` : "Draft — not sent"}
        </p>
      </div>
      {!isSent && onMarkSent && (
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            if (window.confirm("Have you sent this message outside GrowthOS? This only records its status; GrowthOS will not send it.")) {
              onMarkSent();
            }
          }}
          disabled={!e.id}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Mark sent
        </Button>
      )}
    </div>
  );
}

export default function EmailPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("templates");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  const { data: templatesData, isLoading: templatesLoading, error: templatesError } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => workspaceApi.getEmailTemplates(),
  });

  const { data: draftsData, isLoading: draftsLoading, error: draftsError } = useQuery({
    queryKey: ["email-drafts"],
    queryFn: () => workspaceApi.getEmailDrafts(),
  });

  const templates = templatesData?.data ?? [];
  const allDrafts: EmailDraft[] = draftsData?.data ?? [];
  const drafts = allDrafts.filter((d) => d.status !== "SENT");
  const sent = allDrafts.filter((d) => d.status === "SENT");

  const saveDraft = useMutation({
    mutationFn: () =>
      workspaceApi.createEmailDraft({
        subject: subject.trim(),
        body: body.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-drafts"] });
      setSubject("");
      setBody("");
      setActiveTab("drafts");
    },
  });

  const saveTemplate = useMutation({
    mutationFn: () => workspaceApi.createEmailTemplate({
      name: templateName.trim(),
      subject: templateSubject.trim(),
      body: templateBody.trim(),
      type: "OUTREACH",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setTemplateName("");
      setTemplateSubject("");
      setTemplateBody("");
      setShowTemplateForm(false);
    },
  });

  const markDraftSent = useMutation({
    mutationFn: (id: string) => workspaceApi.sendEmailDraft(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-drafts"] });
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-luxe-text)]">Email workspace</h2>
        <Button className="gap-2" onClick={() => {
          setActiveTab("drafts");
          document.getElementById("email-subject")?.focus();
        }}>
          <Plus className="h-4 w-4" />
          New draft
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="mb-4 flex justify-end">
            <Button variant="secondary" className="gap-2" onClick={() => setShowTemplateForm((open) => !open)}>
              <Plus className="h-4 w-4" />
              {showTemplateForm ? "Cancel template" : "Create template"}
            </Button>
          </div>
          {showTemplateForm && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Create email template</CardTitle></CardHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="template-name">Template name</Label>
                  <Input id="template-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="mt-1" required />
                </div>
                <div>
                  <Label htmlFor="template-subject">Subject</Label>
                  <Input id="template-subject" value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} className="mt-1" required />
                </div>
                <div>
                  <Label htmlFor="template-body">Message</Label>
                  <textarea id="template-body" value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} rows={4} className="luxe-input mt-1 w-full resize-y" required />
                </div>
                {saveTemplate.isError && <p role="alert" className="text-sm text-[var(--color-luxe-danger)]">{saveTemplate.error.message}</p>}
                <div className="flex justify-end">
                  <Button disabled={saveTemplate.isPending || !templateName.trim() || !templateSubject.trim() || !templateBody.trim()} onClick={() => saveTemplate.mutate()}>
                    {saveTemplate.isPending ? "Saving…" : "Save template"}
                  </Button>
                </div>
              </div>
            </Card>
          )}
          {templatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : templatesError ? (
            <ErrorState
              title="Failed to load templates"
              description={templatesError instanceof Error ? templatesError.message : undefined}
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["email-templates"] })}
            />
          ) : templates.length === 0 ? (
            <EmptyState
              title="No email templates"
              description="Create reusable email templates to speed up prospect outreach."
              action={
                <Button className="gap-2" onClick={() => setShowTemplateForm(true)}>
                  <Plus className="h-4 w-4" />
                  Create template
                </Button>
              }
              icon={<FileText className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
            />
          ) : (
            <div className="space-y-3">
              {templates.map((tmpl: EmailTemplate) => {
                return (
                  <Card key={tmpl.id} className="group">
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">{tmpl.name}</CardTitle>
                          <p className="text-sm text-[var(--color-luxe-muted)] truncate max-w-[300px]">
                            {tmpl.subject}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--color-luxe-muted-2)]">
                          {tmpl.type}
                        </span>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => {
                        setSubject(tmpl.subject);
                        setBody(tmpl.body);
                        setActiveTab("drafts");
                        document.getElementById("email-subject")?.focus();
                      }}>Use template</Button>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="drafts">
          {draftsLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : draftsError ? (
            <ErrorState
              title="Failed to load drafts"
              description={draftsError instanceof Error ? draftsError.message : undefined}
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["email-drafts"] })}
            />
          ) : drafts.length === 0 ? (
            <EmptyState
              title="No drafts"
              description="Start composing an email to reach your prospects."
              icon={<FileText className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
            />
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <EmailRow key={draft.id} email={draft} onMarkSent={() => markDraftSent.mutate(draft.id)} />
              ))}
            </div>
          )}
          {markDraftSent.isError && (
            <p role="alert" className="mt-3 text-sm text-[var(--color-luxe-danger)]">
              {markDraftSent.error.message}
            </p>
          )}
        </TabsContent>

        <TabsContent value="sent">
          {draftsLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : draftsError ? (
            <ErrorState
              title="Failed to load sent messages"
              description={draftsError instanceof Error ? draftsError.message : undefined}
              onRetry={() => queryClient.invalidateQueries({ queryKey: ["email-drafts"] })}
            />
          ) : sent.length === 0 ? (
            <EmptyState
              title="Sent emails will appear here"
              description="After you send a message yourself outside GrowthOS, mark its draft as sent to record it here."
              icon={<Send className="h-6 w-6 text-[var(--color-luxe-muted-2)]" />}
            />
          ) : (
            <div className="space-y-3">
              {sent.map((d) => (
                <EmailRow key={d.id} email={d} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Compose drawer (simplified inline) */}
      <Card className="mt-6 border-l-2 border-l-[var(--color-luxe-accent)] p-5 sm:p-6">
        <CardHeader>
          <CardTitle>Compose draft</CardTitle>
        </CardHeader>
        <p className="mb-4 text-sm text-[var(--color-luxe-muted)]">
          GrowthOS prepares the draft. Review it, send it yourself using your approved email tool, then mark it as sent above.
        </p>
        <div className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Your compelling subject line"
                className="mt-1 w-full"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSubject("");
                  setBody("");
                }}
                className="gap-2"
              >
                Clear
              </Button>
              <Button
                className="gap-2"
                disabled={!subject.trim() || !body.trim() || saveDraft.isPending}
                onClick={() => saveDraft.mutate()}
              >
                {saveDraft.isPending ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </div>
          {saveDraft.isError && (
            <p role="alert" className="text-sm text-[var(--color-luxe-danger)]">
              {saveDraft.error instanceof Error ? saveDraft.error.message : "Failed to save draft."}
            </p>
          )}
          {saveDraft.isSuccess && (
            <p role="status" className="text-sm text-[var(--color-luxe-success)]">Draft saved.</p>
          )}
          <div>
            <Label htmlFor="email-body">Body</Label>
            <textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={6}
              className="mt-1 min-h-40 w-full resize-y rounded-lg border border-[var(--color-luxe-border)] bg-[var(--color-luxe-bg)] px-3 py-3 text-sm text-[var(--color-luxe-text)] placeholder:text-[var(--color-luxe-muted-2)] focus:border-[var(--color-luxe-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-luxe-accent)]/20"
            />
          </div>
          <Separator />
          <div className="flex items-center gap-3 text-xs text-[var(--color-luxe-muted)]">
            <Clock className="h-4 w-4" />
            Saving a draft never sends email or contacts a prospect.
          </div>
        </div>
      </Card>
    </div>
  );
}
