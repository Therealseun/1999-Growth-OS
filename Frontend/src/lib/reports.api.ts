import { getSupabaseClient } from "./supabase";
import { mapCampaign, mapReport, throwSupabaseError } from "./supabase-data";
import type { DashboardStats } from "./types";

type Period = "TODAY" | "THIS_WEEK" | "THIS_MONTH";
const PERIOD_DAYS: Record<Period, number> = { TODAY: 1, THIS_WEEK: 7, THIS_MONTH: 30 };

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function csvBlob(headers: string[], rows: unknown[][]): Blob {
  return new Blob(
    [[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" }
  );
}

async function currentUserId() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Your session has expired. Please sign in again.");
  return data.user.id;
}

export const reportsApi = {
  async list(query?: {
    type?: string;
    campaignId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    let request = getSupabaseClient().from("reports").select("*").order("created_at", { ascending: false });
    if (query?.type) request = request.eq("type", query.type);
    if (query?.campaignId) request = request.eq("campaign_id", query.campaignId);
    if (query?.dateFrom) request = request.gte("date_from", query.dateFrom);
    if (query?.dateTo) request = request.lte("date_to", query.dateTo);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);
    const rows = (data ?? []).map((row) => mapReport(row));
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
  },

  async get(id: string) {
    const { data, error } = await getSupabaseClient().from("reports").select("*").eq("id", id).single();
    if (error) throwSupabaseError(error);
    return { data: mapReport(data) };
  },

  async generate(payload: {
    type: "PIPELINE" | "PERFORMANCE" | "TASK_AUDIT";
    campaignId?: string;
    dateFrom?: string;
    dateTo?: string;
    format?: "CSV" | "JSON";
  }) {
    const { data, error } = await getSupabaseClient()
      .from("reports")
      .insert({
        type: payload.type,
        campaign_id: payload.campaignId ?? null,
        date_from: payload.dateFrom ?? null,
        date_to: payload.dateTo ?? null,
        format: payload.format ?? "CSV",
      })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: { reportId: data.id, downloadUrl: null, status: data.status } };
  },

  async download(id: string) {
    const supabase = getSupabaseClient();
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single();
    if (reportError) throwSupabaseError(reportError);

    if (report.type === "PIPELINE") {
      let request = supabase.from("prospects").select("*").order("created_at", { ascending: false });
      if (report.campaign_id) request = request.eq("campaign_id", report.campaign_id);
      if (report.date_from) request = request.gte("created_at", report.date_from);
      if (report.date_to) request = request.lte("created_at", `${report.date_to}T23:59:59.999Z`);
      const { data, error } = await request;
      if (error) throwSupabaseError(error);
      if (report.format === "JSON") return new Blob([JSON.stringify(data ?? [], null, 2)], { type: "application/json" });
      return csvBlob(
        ["first_name", "last_name", "email", "company", "job_title", "status", "campaign_id", "created_at"],
        (data ?? []).map((row) => [row.first_name, row.last_name, row.email, row.company, row.job_title, row.status, row.campaign_id, row.created_at])
      );
    }

    if (report.type === "TASK_AUDIT") {
      let request = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (report.campaign_id) request = request.eq("campaign_id", report.campaign_id);
      if (report.date_from) request = request.gte("created_at", report.date_from);
      if (report.date_to) request = request.lte("created_at", `${report.date_to}T23:59:59.999Z`);
      const { data, error } = await request;
      if (error) throwSupabaseError(error);
      if (report.format === "JSON") return new Blob([JSON.stringify(data ?? [], null, 2)], { type: "application/json" });
      return csvBlob(
        ["title", "type", "status", "assigned_to", "assigned_by", "campaign_id", "due_date", "completed_at", "created_at"],
        (data ?? []).map((row) => [row.title, row.type, row.status, row.assigned_to, row.assigned_by, row.campaign_id, row.due_date, row.completed_at, row.created_at])
      );
    }

    let request = supabase.from("tasks").select("*").eq("status", "COMPLETED").order("completed_at", { ascending: false });
    if (report.date_from) request = request.gte("completed_at", report.date_from);
    if (report.date_to) request = request.lte("completed_at", `${report.date_to}T23:59:59.999Z`);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);
    if (report.format === "JSON") return new Blob([JSON.stringify(data ?? [], null, 2)], { type: "application/json" });
    return csvBlob(
      ["title", "type", "assigned_to", "campaign_id", "created_at", "completed_at"],
      (data ?? []).map((row) => [row.title, row.type, row.assigned_to, row.campaign_id, row.created_at, row.completed_at])
    );
  },

  async getDashboardData() {
    const supabase = getSupabaseClient();
    const [
      { data: auth, error: authError },
      { data: campaigns, error: campaignsError },
      { data: prospects, error: prospectsError },
      { data: tasks, error: tasksError },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("campaigns").select("*,prospects(count),tasks(count)").order("updated_at", { ascending: false }),
      supabase.from("prospects").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    ]);
    if (authError) throw authError;
    if (!auth.user) throw new Error("Your session has expired. Please sign in again.");
    if (campaignsError) throwSupabaseError(campaignsError);
    if (prospectsError) throwSupabaseError(prospectsError);
    if (tasksError) throwSupabaseError(tasksError);

    const campaignRows = campaigns ?? [];
    const prospectRows = prospects ?? [];
    const taskRows = (tasks ?? []).filter(
      (task) => task.assigned_to === auth.user.id || task.assigned_by === auth.user.id
    );
    const [profileResult] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
    ]);
    if (profileResult.error) throwSupabaseError(profileResult.error);
    const employee = profileResult.data.role === "EMPLOYEE";
    const visibleTasks = employee ? taskRows.filter((task) => task.assigned_to === auth.user.id) : (tasks ?? []);
    const visibleProspects = employee ? [] : prospectRows;
    const completed = visibleTasks.filter((task) => task.status === "COMPLETED").length;
    const qualified = visibleProspects.filter((prospect) => ["QUALIFIED", "CONVERTED"].includes(prospect.status)).length;
    const converted = visibleProspects.filter((prospect) => prospect.status === "CONVERTED").length;
    const stats: DashboardStats = {
      campaignsCount: campaignRows.length,
      activeCampaignsCount: campaignRows.filter((campaign) => campaign.status === "ACTIVE").length,
      prospectsCount: visibleProspects.length,
      tasksCount: visibleTasks.length,
      completedTasksCount: completed,
      pendingTasksCount: visibleTasks.filter((task) => ["PENDING", "IN_PROGRESS"].includes(task.status)).length,
      conversionRate: visibleProspects.length ? Math.round((converted / visibleProspects.length) * 1000) / 10 : null,
      revenueOpportunity: visibleProspects.length ? (qualified * 2 + converted * 5) * 1500 : null,
    };
    const statuses: [string, string][] = [
      ["Completed", "COMPLETED"],
      ["In progress", "IN_PROGRESS"],
      ["Pending", "PENDING"],
      ["Blocked", "BLOCKED"],
    ];
    return {
      data: {
        stats,
        recentCampaigns: campaignRows
          .slice(0, 5)
          .map((row: Record<string, unknown>) => mapCampaign(row)),
        recentProspects: visibleProspects.slice(0, 5),
        taskDistribution: statuses.map(([name, status]) => {
          const value = visibleTasks.filter((task) => task.status === status).length;
          return { name, value, count: value };
        }),
      },
    };
  },

  async getMyPerformance(query?: { period?: string; page?: number; pageSize?: number }) {
    const supabase = getSupabaseClient();
    const userId = await currentUserId();
    const periods: Period[] =
      query?.period === "TODAY" || query?.period === "THIS_WEEK" || query?.period === "THIS_MONTH"
        ? [query.period]
        : ["TODAY", "THIS_WEEK", "THIS_MONTH"];
    const [{ data: tasks, error: tasksError }, { data: evidence, error: evidenceError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabase.from("tasks").select("status,created_at,completed_at").eq("assigned_to", userId),
        supabase.from("task_evidence").select("submitted_at").eq("submitted_by", userId),
        supabase.from("profiles").select("role").eq("id", userId).single(),
      ]);
    if (tasksError) throwSupabaseError(tasksError);
    if (evidenceError) throwSupabaseError(evidenceError);
    if (profileError) throwSupabaseError(profileError);
    const { data: targets, error: targetsError } = await supabase
      .from("workload_targets")
      .select("daily_task_target,weekly_task_target")
      .eq("role", profile.role)
      .maybeSingle();
    if (targetsError && targetsError.code !== "42501") throwSupabaseError(targetsError);

    const now = Date.now();
    const rows = periods.map((period) => {
      const start = now - PERIOD_DAYS[period] * 86400000;
      const relevant = (tasks ?? []).filter((task) => new Date(task.created_at).getTime() >= start);
      const completed = relevant.filter((task) => task.status === "COMPLETED");
      const durations = completed
        .filter((task) => task.completed_at)
        .map((task) => Math.max(0, new Date(task.completed_at!).getTime() - new Date(task.created_at).getTime()));
      const target =
        period === "TODAY" ? targets?.daily_task_target : targets?.weekly_task_target;
      return {
        period,
        tasksCompleted: completed.length,
        tasksTotal: relevant.length,
        completionRate: relevant.length ? Math.round((completed.length / relevant.length) * 1000) / 10 : 0,
        averageTimeToComplete: durations.length
          ? Math.round((durations.reduce((sum, duration) => sum + duration, 0) / durations.length / 3600000) * 10) / 10
          : 0,
        evidenceSubmitted: (evidence ?? []).filter((item) => new Date(item.submitted_at).getTime() >= start).length,
        rating: target && target > 0 ? Math.min(5, Math.max(1, Math.round((completed.length / target) * 50) / 10)) : null,
      };
    });
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? rows.length;
    const start = (page - 1) * pageSize;
    return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
  },
};
