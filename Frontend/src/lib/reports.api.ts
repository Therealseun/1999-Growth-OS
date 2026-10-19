import { apiClient } from "./api";
import type { Campaign, DashboardStats, Prospect } from "./types";

type ReportRow = {
  id: string;
  type: string;
  campaign_id: string | null;
  date_from: string | null;
  date_to: string | null;
  format: string;
  status: string;
  created_by: string;
  created_at: string;
};

type MyPerformanceRecord = {
  period: "TODAY" | "THIS_WEEK" | "THIS_MONTH";
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  averageTimeToComplete: number;
  evidenceSubmitted: number;
  rating: number | null;
};

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

function mapReport(row: ReportRow) {
  return {
    id: row.id,
    type: row.type,
    campaignId: row.campaign_id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    format: row.format,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    name: String(row.name),
    niche: String(row.niche),
    offer: String(row.offer),
    location: String(row.location),
    objective: String(row.objective),
    status: String(row.status) as Campaign["status"],
    departmentId: String(row.department_id),
    departmentName: row.department_name == null ? undefined : String(row.department_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ownerId: String(row.created_by),
    prospectCount: Number(row.prospect_count ?? 0),
    taskCount: Number(row.task_count ?? 0),
  };
}

function mapProspect(row: Record<string, unknown>): Prospect {
  const [firstName = "", ...last] = String(row.contact_name ?? "").split(/\s+/);
  return {
    id: String(row.id),
    firstName,
    lastName: last.join(" "),
    email: row.email == null ? null : String(row.email),
    company: String(row.organisation),
    role: row.industry == null ? null : String(row.industry),
    source: String(row.sift_id),
    campaignId: String(row.campaign_id),
    status: String(row.qualification_status) as Prospect["status"],
    notes: row.qualification_reason == null ? null : String(row.qualification_reason),
    createdAt: String(row.created_at),
    website: row.website == null ? null : String(row.website),
    location: row.location == null ? null : String(row.location),
  };
}

export const reportsApi = {
  async list(query?: {
    type?: string; campaignId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number;
  }) {
    const result = await apiClient.get<{ data: ReportRow[]; total: number; page: number; pageSize: number }>(
      `/reports${queryString(query)}`
    );
    return { ...result, data: result.data.map(mapReport) };
  },

  async get(id: string) {
    const result = await apiClient.get<{ data: ReportRow }>(`/reports/${id}`);
    return { data: mapReport(result.data) };
  },

  async generate(payload: {
    type: "PIPELINE" | "PERFORMANCE" | "TASK_AUDIT";
    campaignId?: string;
    dateFrom?: string;
    dateTo?: string;
    format?: "CSV" | "JSON";
  }) {
    const result = await apiClient.post<{ data: ReportRow }>("/reports", payload);
    return { data: { reportId: result.data.id, downloadUrl: null, status: result.data.status } };
  },

  async download(id: string) {
    return apiClient.getBlob(`/reports/${id}/download`);
  },

  async getDashboardData() {
    const { data } = await apiClient.get<{
      data: {
        stats: DashboardStats;
        recentCampaigns: Record<string, unknown>[];
        recentProspects: Record<string, unknown>[];
        taskDistribution: Array<{ name: string; value: number; count: number }>;
      };
    }>("/reports/dashboard");
    return {
      data: {
        ...data,
        recentCampaigns: data.recentCampaigns.map(mapCampaign),
        recentProspects: data.recentProspects.map(mapProspect),
      },
    };
  },

  async getMyPerformance(query?: { period?: string; page?: number; pageSize?: number }) {
    const result = await apiClient.get<{
      data: MyPerformanceRecord[];
      total: number;
      page: number;
      pageSize: number;
    }>(
      `/reports/my-performance${queryString(query)}`
    );
    return result;
  },
};
