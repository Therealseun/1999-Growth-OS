import { getSupabaseClient } from "./supabase";
import { mapSnapshot, mapTarget, throwSupabaseError } from "./supabase-data";
import type { UserRole, WorkloadSnapshot, WorkloadTarget } from "./types";

async function getSnapshots(
  userId?: string,
  period?: "TODAY" | "THIS_WEEK" | "THIS_MONTH"
) {
  let request = getSupabaseClient()
    .from("workload_snapshots")
    .select("*")
    .order("captured_at", { ascending: false });
  if (userId) request = request.eq("user_id", userId);
  if (period) request = request.eq("period", period);
  const { data, error } = await request;
  if (error) throwSupabaseError(error);
  return (data ?? []).map((row) => mapSnapshot(row) as WorkloadSnapshot);
}

async function getTargets(): Promise<WorkloadTarget[]> {
  const { data, error } = await getSupabaseClient()
    .from("workload_targets")
    .select("*")
    .order("role", { ascending: true });
  if (error) throwSupabaseError(error);
  return (data ?? []).map((row) => mapTarget(row) as WorkloadTarget);
}

export const workloadApi = {
  async getTargets() {
    return { data: await getTargets() };
  },

  async updateTarget(
    role: UserRole,
    payload: { dailyTaskTarget: number; weeklyTaskTarget: number; activeCampaignsTarget?: number }
  ) {
    const { data, error } = await getSupabaseClient()
      .from("workload_targets")
      .upsert(
        {
          role,
          daily_task_target: payload.dailyTaskTarget,
          weekly_task_target: payload.weeklyTaskTarget,
          active_campaigns_target: payload.activeCampaignsTarget ?? null,
        },
        { onConflict: "role" }
      )
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapTarget(data) as WorkloadTarget };
  },

  async getSnapshots(userId: string, period?: "TODAY" | "THIS_WEEK" | "THIS_MONTH") {
    return { data: await getSnapshots(userId, period) };
  },

  async getAllSnapshots(period?: "TODAY" | "THIS_WEEK" | "THIS_MONTH") {
    return { data: await getSnapshots(undefined, period) };
  },

  async getUserWorkload(userId: string) {
    const supabase = getSupabaseClient();
    const [{ data: profile, error: profileError }, snapshots, targets] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).single(),
      getSnapshots(userId),
      getTargets(),
    ]);
    if (profileError) throwSupabaseError(profileError);
    const emptyTarget: WorkloadTarget = {
      id: "",
      role: profile.role,
      dailyTaskTarget: 0,
      weeklyTaskTarget: 0,
      activeCampaignsTarget: null,
      updatedAt: new Date(0).toISOString(),
    };
    return {
      data: {
        userId,
        currentTarget: targets.find((target) => target.role === profile.role) ?? emptyTarget,
        snapshots,
      },
    };
  },
};
