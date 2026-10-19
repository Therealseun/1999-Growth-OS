import { apiClient } from "./api";
import type { Campaign, CampaignMetrics } from "./types";

type CampaignRow = {
  id: string;
  name: string;
  niche: string;
  offer: string;
  location: string;
  objective: string;
  status: Campaign["status"];
  department_id: string;
  department_name?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  prospect_count?: number;
  task_count?: number;
};

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    offer: row.offer,
    location: row.location,
    objective: row.objective,
    status: row.status,
    departmentId: row.department_id,
    departmentName: row.department_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: row.created_by,
    prospectCount: row.prospect_count ?? 0,
    taskCount: row.task_count ?? 0,
  };
}

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export const campaignsApi = {
  async list(query?: { status?: string; search?: string; page?: number; pageSize?: number }) {
    const result = await apiClient.get<{ data: CampaignRow[]; total: number; page: number; pageSize: number }>(
      `/campaigns${queryString(query)}`
    );
    return { ...result, data: result.data.map(mapCampaign) };
  },

  async get(id: string) {
    const result = await apiClient.get<{ data: CampaignRow }>(`/campaigns/${id}`);
    return { data: mapCampaign(result.data) };
  },

  async create(payload: {
    name: string;
    niche: string;
    offer: string;
    location: string;
    objective: string;
    departmentId?: string;
  }) {
    const result = await apiClient.post<{ data: CampaignRow }>("/campaigns", payload);
    return { data: mapCampaign(result.data) };
  },

  async update(
    id: string,
    payload: Partial<Pick<Campaign, "name" | "niche" | "offer" | "location" | "objective" | "status">>
  ) {
    const result = await apiClient.patch<{ data: CampaignRow }>(`/campaigns/${id}`, payload);
    return { data: mapCampaign(result.data) };
  },

  async delete(id: string) {
    return apiClient.delete<void>(`/campaigns/${id}`);
  },

  async getNicheIntelligence(id: string): Promise<{ data: {
    niche: string; insights: string[]; opportunities: string[]; risks: string[]; competitors: unknown[];
  } }> {
    return apiClient.get(`/campaigns/${id}/niche-profile`);
  },

  async getMetrics(id: string) {
    return apiClient.get<{ data: CampaignMetrics }>(`/campaigns/${id}/metrics`);
  },
};
