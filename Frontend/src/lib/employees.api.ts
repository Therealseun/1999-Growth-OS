import { getSupabaseClient } from "./supabase";
import { throwSupabaseError } from "./supabase-data";
import type { UserRole } from "./types";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
};

function mapEmployee(profile: Profile) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    role: profile.role,
    active: profile.active,
    createdAt: profile.created_at,
  };
}

export const employeesApi = {
  async list(query?: { role?: string; search?: string; page?: number; pageSize?: number }) {
    let request = getSupabaseClient()
      .from("profiles")
      .select("id,email,full_name,role,active,created_at")
      .order("created_at", { ascending: false });
    if (query?.role) request = request.eq("role", query.role);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);
    const search = query?.search?.trim().toLowerCase();
    const employees = ((data ?? []) as Profile[]).map(mapEmployee).filter((employee) =>
      !search || `${employee.name} ${employee.email}`.toLowerCase().includes(search)
    );
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return { data: employees.slice(start, start + pageSize), total: employees.length, page, pageSize };
  },

  async get(id: string) {
    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .select("id,email,full_name,role,active,created_at")
      .eq("id", id)
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapEmployee(data as Profile) };
  },

  async create(payload: { email: string; name: string; role: UserRole }) {
    const { data, error } = await getSupabaseClient().functions.invoke("invite-employee", {
      body: { email: payload.email, name: payload.name, role: payload.role },
    });
    if (error) throw error;
    return { data };
  },

  async update(id: string, payload: Partial<{ name: string; role: UserRole }>) {
    const patch: Record<string, string> = {};
    if (payload.name !== undefined) patch.full_name = payload.name;
    if (payload.role !== undefined) patch.role = payload.role;
    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .update(patch)
      .eq("id", id)
      .select("id,email,full_name,role,active,created_at")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapEmployee(data as Profile) };
  },

  async deactivate(id: string) {
    const { error } = await getSupabaseClient().rpc("growthos_deactivate_user", { target_id: id });
    if (error) throwSupabaseError(error);
    return { data: { deactivated: true } };
  },

  async getPerformance(id: string, query?: { period?: string }) {
    const supabase = getSupabaseClient();
    const [
      { data: tasks, error },
      { data: evidence, error: evidenceError },
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("status,created_at,completed_at")
        .eq("assigned_to", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("task_evidence")
        .select("submitted_at")
        .eq("submitted_by", id),
    ]);
    if (error) throwSupabaseError(error);
    if (evidenceError) throwSupabaseError(evidenceError);
    const periods = query?.period ? [query.period] : ["TODAY", "THIS_WEEK", "THIS_MONTH"];
    const now = Date.now();
    const durations = { TODAY: 1, THIS_WEEK: 7, THIS_MONTH: 30 } as const;
    const result = periods.map((period) => {
      const days = durations[period as keyof typeof durations] ?? 30;
      const start = now - days * 86400000;
      const relevant = (tasks ?? []).filter((task) => new Date(task.created_at).getTime() >= start);
      const completed = relevant.filter((task) => task.status === "COMPLETED");
      const completionDurations = completed
        .filter((task) => task.completed_at)
        .map((task) => Math.max(0, new Date(task.completed_at!).getTime() - new Date(task.created_at).getTime()));
      return {
        period,
        tasksCompleted: completed.length,
        tasksTotal: relevant.length,
        completionRate: relevant.length ? Math.round((completed.length / relevant.length) * 1000) / 10 : 0,
        averageTimeToComplete: completionDurations.length
          ? Math.round((completionDurations.reduce((total, duration) => total + duration, 0) / completionDurations.length / 3600000) * 10) / 10
          : 0,
        evidenceSubmitted:
          evidence?.filter((item) => new Date(item.submitted_at).getTime() >= start).length ?? 0,
        rating: null,
      };
    });
    return { data: result };
  },
};
