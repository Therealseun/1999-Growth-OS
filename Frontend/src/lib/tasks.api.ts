import { apiClient } from "./api";
import type { Evidence, Task } from "./types";

type TaskRow = {
  id: string;
  type: Task["type"];
  title: string;
  description: string | null;
  status: Task["status"];
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_by: string | null;
  assigned_by_name: string | null;
  campaign_id: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  priority: Task["priority"];
};

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    assignedTo: row.assigned_to ?? "",
    assignedToName: row.assigned_to_name ?? undefined,
    assignedBy: row.assigned_by,
    assignedByName: row.assigned_by_name,
    campaignId: row.campaign_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    priority: row.priority,
  };
}

function mapEvidence(row: Record<string, unknown>): Evidence {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    workstream: String(row.workstream) as Evidence["workstream"],
    type: String(row.evidence_type) as Evidence["type"],
    evidenceValue: row.evidence_value == null ? null : String(row.evidence_value),
    storagePath: row.storage_path == null ? null : String(row.storage_path),
    submittedAt: String(row.submitted_at),
    submittedBy: String(row.submitted_by),
  };
}

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export const tasksApi = {
  async list(query?: {
    status?: string; type?: string; assignedTo?: string; campaignId?: string; page?: number; pageSize?: number;
  }) {
    const result = await apiClient.get<{ data: TaskRow[]; total: number; page: number; pageSize: number }>(
      `/tasks${queryString(query)}`
    );
    return { ...result, data: result.data.map(mapTask) };
  },

  async get(id: string) {
    const result = await apiClient.get<{ data: TaskRow }>(`/tasks/${id}`);
    return { data: mapTask(result.data) };
  },

  async update(id: string, payload: { status: "READY" | "REVIEWED" }) {
    const result = await apiClient.patch<{ data: { id: string; status: Task["status"] } }>(
      `/tasks/${id}`,
      payload
    );
    return result;
  },

  async submitEvidence(
    taskId: string,
    payload: { type: "LINK" | "NOTE"; url?: string; note?: string }
  ) {
    const evidenceType = payload.type === "LINK" ? "URL" : "TEXT";
    const evidenceValue = payload.type === "LINK" ? payload.url?.trim() : payload.note?.trim();
    if (!evidenceValue) throw new Error(payload.type === "LINK" ? "Enter the evidence URL." : "Enter the evidence note.");
    const result = await apiClient.post<{ data: Record<string, unknown> }>(`/tasks/${taskId}/evidence`, {
      evidenceType,
      evidenceValue,
    });
    return { data: mapEvidence(result.data) };
  },

  async getEvidence(taskId: string) {
    const result = await apiClient.get<{ data: Array<Record<string, unknown>> }>(`/tasks/${taskId}/evidence`);
    return { data: result.data.map(mapEvidence) };
  },

  async getMyTasks(query?: { status?: string; type?: string; page?: number; pageSize?: number }) {
    return this.list(query);
  },

  async getTeamTasks(query?: { status?: string; type?: string; page?: number; pageSize?: number }) {
    return this.list(query);
  },
};
