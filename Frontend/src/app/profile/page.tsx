"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, Card, ErrorState, Input, Label, Skeleton } from "@/components/ui";
import { getCurrentProfile, updateCurrentProfileName } from "@/lib/profile.api";
import { useAuth } from "@/lib/auth-provider";
import { Check, ShieldCheck, UserRound } from "lucide-react";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: getCurrentProfile,
    enabled: Boolean(user),
  });
  const name = nameDraft ?? data?.full_name ?? "";

  const updateMutation = useMutation({
    mutationFn: updateCurrentProfileName,
    onSuccess: async () => {
      await refreshUser();
      await refetch();
      setNameDraft(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
  });

  const hasNameChanged = name.trim() !== (data?.full_name ?? "");

  return (
    <ProtectedRoute>
      <AppShell title="Profile" breadcrumbs={[{ label: "Profile" }]}>
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-luxe-text)]">
              Your profile
            </h1>
            <p className="mt-1 text-sm text-[var(--color-luxe-muted)]">
              Manage the details your team sees in GrowthOS.
            </p>
          </div>

          {isLoading ? (
            <Card className="space-y-5 p-6">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </Card>
          ) : error ? (
            <ErrorState
              title="Could not load your profile"
              description={error instanceof Error ? error.message : undefined}
              onRetry={() => void refetch()}
            />
          ) : data ? (
            <>
              <Card className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarFallback className="text-lg">
                    {data.full_name.slice(0, 2).toUpperCase() || <UserRound className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-lg font-semibold text-[var(--color-luxe-text)]">
                    {data.full_name || "Your name"}
                  </p>
                  <p className="break-all text-sm text-[var(--color-luxe-muted)]">{data.email}</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-luxe-border)] bg-[var(--color-luxe-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--color-luxe-accent-strong)]">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  {data.role}
                </span>
              </Card>

              <Card className="p-5 sm:p-6">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-[var(--color-luxe-text)]">Personal details</h2>
                  <p className="mt-1 text-sm text-[var(--color-luxe-muted)]">
                    Your email and access role are managed by your account and administrator.
                  </p>
                </div>
                <form
                  className="space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSaved(false);
                    updateMutation.mutate(name);
                  }}
                >
                  <div>
                    <Label htmlFor="profile-name">Full name</Label>
                    <Input
                      id="profile-name"
                      name="name"
                      autoComplete="name"
                      maxLength={120}
                      value={name}
                      onChange={(event) => setNameDraft(event.target.value)}
                      className="mt-1 w-full"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="profile-email">Email address</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={data.email}
                      className="mt-1 w-full opacity-70"
                      readOnly
                      aria-describedby="email-help"
                    />
                    <p id="email-help" className="mt-1.5 text-xs text-[var(--color-luxe-muted-2)]">
                      Contact your administrator if you need to change your email.
                    </p>
                  </div>
                  {updateMutation.isError && (
                    <p className="text-sm text-[var(--color-luxe-danger)]" role="alert">
                      {updateMutation.error instanceof Error
                        ? updateMutation.error.message
                        : "Your profile could not be updated."}
                    </p>
                  )}
                  {saved && (
                    <p className="inline-flex items-center gap-2 text-sm text-[var(--color-luxe-success)]" role="status">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Profile updated.
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={!hasNameChanged || updateMutation.isPending}
                    >
                      {updateMutation.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </Card>
            </>
          ) : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
