import type { UserRole } from "./types";
import { getSupabaseClient } from "./supabase";

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getCurrentProfile(): Promise<ProfileRow> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,active,created_at,updated_at")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  if (!data.active) {
    await supabase.auth.signOut();
    throw new Error("This account is inactive. Contact your administrator.");
  }
  return data;
}

export async function updateCurrentProfileName(name: string): Promise<void> {
  const supabase = getSupabaseClient();
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 120) {
    throw new Error("Enter a name between 1 and 120 characters.");
  }

  const { error } = await supabase.rpc("growthos_update_own_name", {
    new_name: normalizedName,
  });
  if (error) throw error;
}

export function profileToUser(profile: ProfileRow) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    role: profile.role,
    avatarUrl: null,
  };
}

export function throwSupabaseError(error: { message: string; code?: string }): never {
  const wrapped = new Error(error.message) as Error & { code?: string };
  wrapped.code = error.code;
  throw wrapped;
}

export function mapCampaign(row: Record<string, unknown>) {
  const prospects = row.prospects as { count?: number }[] | undefined;
  const tasks = row.tasks as { count?: number }[] | undefined;
  return {
    id: String(row.id),
    name: String(row.name),
    status: String(row.status) as "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED",
    niche: String(row.niche),
    targetAudience: String(row.target_audience),
    objective: String(row.objective ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ownerId: String(row.owner_id),
    prospectCount: prospects?.[0]?.count ?? 0,
    taskCount: tasks?.[0]?.count ?? 0,
  };
}

export function mapProspect(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    firstName: String(row.first_name),
    lastName: String(row.last_name ?? ""),
    email: String(row.email),
    company: row.company == null ? null : String(row.company),
    role: row.job_title == null ? null : String(row.job_title),
    source: row.source == null ? null : String(row.source),
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    status: String(row.status) as "SEED" | "CONTACTED" | "QUALIFIED" | "CONVERTED",
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at),
  };
}

export function mapTask(row: Record<string, unknown>) {
  const assignee = row.assignee as { full_name?: string } | null;
  const assigner = row.assigner as { full_name?: string } | null;
  return {
    id: String(row.id),
    type: String(row.type) as "EMAIL" | "SEO" | "LEAD_MAGNET",
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    status: String(row.status) as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED",
    assignedTo: String(row.assigned_to),
    assignedToName: assignee?.full_name ?? String(row.assigned_to),
    assignedBy: row.assigned_by == null ? null : String(row.assigned_by),
    assignedByName: assigner?.full_name ?? null,
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    dueDate: row.due_date == null ? null : String(row.due_date),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    createdAt: String(row.created_at),
    priority: row.priority == null ? null : String(row.priority),
  };
}

export function mapEvidence(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    type: String(row.type) as "LINK" | "SCREENSHOT" | "NOTE" | "FILE",
    title: String(row.title),
    url: row.url == null ? null : String(row.url),
    metadata: row.metadata == null ? null : JSON.stringify(row.metadata),
    submittedAt: String(row.submitted_at),
    submittedBy: String(row.submitted_by),
  };
}

export function mapTarget(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    role: String(row.role) as UserRole,
    dailyTaskTarget: Number(row.daily_task_target),
    weeklyTaskTarget: Number(row.weekly_task_target),
    activeCampaignsTarget:
      row.active_campaigns_target == null ? null : Number(row.active_campaigns_target),
    updatedAt: String(row.updated_at),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
  };
}

export function mapSnapshot(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    period: String(row.period) as "TODAY" | "THIS_WEEK" | "THIS_MONTH",
    tasksCompleted: Number(row.tasks_completed),
    tasksAssigned: Number(row.tasks_assigned),
    targetSnapshot: row.target_snapshot as {
      dailyTaskTarget: number;
      weeklyTaskTarget: number;
      activeCampaignsTarget: number | null;
    },
    capturedAt: String(row.captured_at),
  };
}

export function mapEmailTemplate(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    subject: String(row.subject),
    body: String(row.body),
    type: String(row.type),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  };
}

export function mapEmailDraft(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    subject: String(row.subject),
    body: String(row.body),
    status: String(row.status) as "DRAFT" | "SENT",
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    prospectIds: (row.prospect_ids as string[] | null) ?? [],
    sentAt: row.sent_at == null ? null : String(row.sent_at),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  };
}

export function mapLeadMagnet(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    description: String(row.description ?? ""),
    content: row.content == null ? null : String(row.content),
    status: String(row.status),
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    downloadCount: Number(row.download_count ?? 0),
    conversionRate: Number(row.conversion_rate ?? 0),
    createdAt: String(row.created_at),
  };
}

export function mapReport(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    type: String(row.type),
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    dateFrom: row.date_from == null ? null : String(row.date_from),
    dateTo: row.date_to == null ? null : String(row.date_to),
    format: String(row.format),
    status: String(row.status),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

export function paginated<T>(rows: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}
