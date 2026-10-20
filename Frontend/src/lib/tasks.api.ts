import { apiClient } from "./api";
import type { Evidence, Task } from "./types";

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

export type TodaySummary = {
  date: string;
  campaign_id: string | null;
  workstreams: Array<{
    workstream: "EMAIL" | "SEO" | "LEAD_MAGNET";
    required: number;
    prepared: number;
    completed: number;
    carried_in: number;
  }>;
  total_required: number;
  total_completed: number;
  completion_pct: number;
};

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
  async getTodaySummary() {
    return apiClient.get<TodaySummary>("/tasks/today");
  },

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
    payload: { type: "LINK" | "NOTE"; url?: string; note?: string } | { type: "FILE"; file?: File }
  ) {
    let evidenceType: "URL" | "TEXT" | "FILE";
    let evidenceValue: string | undefined;
    let storagePath: string | undefined;
    if (payload.type === "FILE") {
      const file = payload.file;
      if (!file) throw new Error("Choose a file to upload.");
      if (!(EVIDENCE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
        throw new Error("Choose a PNG, JPEG, WebP, or PDF file.");
      }
      if (file.size < 1 || file.size > MAX_EVIDENCE_BYTES) {
        throw new Error("Evidence files must be smaller than 5 MiB.");
      }

      const signed = await apiClient.post<{
        upload_url: string;
        storage_path: string;
        expires_in: number;
      }>("/evidence/upload-url", {
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });
      const upload = await fetch(signed.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) {
        throw new Error(`File upload failed (HTTP ${upload.status}). Please try again.`);
      }
      evidenceType = "FILE";
      storagePath = signed.storage_path;
    } else {
      evidenceType = payload.type === "LINK" ? "URL" : "TEXT";
      evidenceValue = payload.type === "LINK" ? payload.url?.trim() : payload.note?.trim();
      if (!evidenceValue) {
        throw new Error(payload.type === "LINK" ? "Enter the evidence URL." : "Enter the evidence note.");
      }
    }

    const result = await apiClient.post<{ data: Record<string, unknown> }>(`/tasks/${taskId}/evidence`, {
      evidenceType,
      ...(evidenceValue ? { evidenceValue } : {}),
      ...(storagePath ? { storagePath } : {}),
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
