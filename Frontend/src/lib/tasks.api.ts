import { getSupabaseClient } from "./supabase";
import { mapEvidence, mapTask, throwSupabaseError } from "./supabase-data";
import type { Evidence, Task } from "./types";

async function getNames(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, string>();
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("id,full_name")
    .in("id", uniqueIds);
  if (error) throwSupabaseError(error);
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}

async function mapTasks(rows: Record<string, unknown>[]) {
  const names = await getNames(
    rows.flatMap((row) => [String(row.assigned_to ?? ""), String(row.assigned_by ?? "")])
  );
  return rows.map((row) => ({
    ...mapTask(row),
    assignedToName: names.get(String(row.assigned_to)) ?? String(row.assigned_to),
    assignedByName: names.get(String(row.assigned_by)) ?? null,
  })) as Task[];
}

async function getTaskPage(
  query: {
    status?: string;
    type?: string;
    assignedTo?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  },
  scope: "all" | "mine"
) {
  const supabase = getSupabaseClient();
  let request = supabase.from("tasks").select("*").order("created_at", { ascending: false });
  if (scope === "mine") {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("Your session has expired. Please sign in again.");
    request = request.eq("assigned_to", auth.user.id);
  }
  if (query.status) request = request.eq("status", query.status);
  if (query.type) request = request.eq("type", query.type);
  if (query.assignedTo) request = request.eq("assigned_to", query.assignedTo);
  if (query.campaignId) request = request.eq("campaign_id", query.campaignId);
  const { data, error } = await request;
  if (error) throwSupabaseError(error);
  const rows = await mapTasks(data ?? []);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

export const tasksApi = {
  async list(query?: {
    status?: string;
    type?: string;
    assignedTo?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  }) {
    return getTaskPage(query ?? {}, "all");
  },

  async get(id: string) {
    const { data, error } = await getSupabaseClient().from("tasks").select("*").eq("id", id).single();
    if (error) throwSupabaseError(error);
    const [task] = await mapTasks([data]);
    return { data: task };
  },

  async create(payload: {
    type: "EMAIL" | "SEO" | "LEAD_MAGNET";
    title: string;
    description?: string;
    campaignId?: string;
    assignedTo?: string;
    priority?: string;
    dueDate?: string;
  }) {
    const { data: auth, error: authError } = await getSupabaseClient().auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("Your session has expired. Please sign in again.");
    const { data, error } = await getSupabaseClient()
      .from("tasks")
      .insert({
        type: payload.type,
        title: payload.title,
        description: payload.description ?? null,
        campaign_id: payload.campaignId ?? null,
        assigned_to: payload.assignedTo ?? auth.user.id,
        priority: payload.priority ?? null,
        due_date: payload.dueDate ?? null,
      })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    const [task] = await mapTasks([data]);
    return { data: task };
  },

  async update(
    id: string,
    payload: Partial<{ status: string; title: string; description: string; priority: string; dueDate: string }>
  ) {
    const patch: Record<string, string | null> = {};
    if (payload.status !== undefined) {
      patch.status = payload.status;
      if (payload.status === "COMPLETED") patch.completed_at = new Date().toISOString();
      else patch.completed_at = null;
    }
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.description !== undefined) patch.description = payload.description;
    if (payload.priority !== undefined) patch.priority = payload.priority;
    if (payload.dueDate !== undefined) patch.due_date = payload.dueDate;
    const { data, error } = await getSupabaseClient()
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    const [task] = await mapTasks([data]);
    return { data: task };
  },

  async delete(id: string) {
    const { error } = await getSupabaseClient().from("tasks").delete().eq("id", id);
    if (error) throwSupabaseError(error);
  },

  async submitEvidence(
    taskId: string,
    payload: { type: "LINK" | "SCREENSHOT" | "NOTE" | "FILE"; title: string; url?: string; metadata?: string }
  ) {
    let metadata: unknown = null;
    if (payload.metadata) {
      try {
        metadata = JSON.parse(payload.metadata);
      } catch {
        metadata = { text: payload.metadata };
      }
    }
    const { data: auth, error: authError } = await getSupabaseClient().auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("Your session has expired. Please sign in again.");
    const { data, error } = await getSupabaseClient()
      .from("task_evidence")
      .insert({
        task_id: taskId,
        type: payload.type,
        title: payload.title,
        url: payload.url ?? null,
        metadata,
        submitted_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapEvidence(data) as Evidence };
  },

  async getEvidence(taskId: string) {
    const { data, error } = await getSupabaseClient()
      .from("task_evidence")
      .select("*")
      .eq("task_id", taskId)
      .order("submitted_at", { ascending: false });
    if (error) throwSupabaseError(error);
    return { data: (data ?? []).map((row) => mapEvidence(row) as Evidence) };
  },

  async getMyTasks(query?: { status?: string; type?: string; page?: number; pageSize?: number }) {
    return getTaskPage(query ?? {}, "mine");
  },

  async getTeamTasks(query?: { status?: string; type?: string; page?: number; pageSize?: number }) {
    return getTaskPage(query ?? {}, "all");
  },
};
