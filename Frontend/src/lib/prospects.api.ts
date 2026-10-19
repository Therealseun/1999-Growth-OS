import { apiClient } from "./api";
import type { Prospect } from "./types";

type ProspectRow = {
  id: string;
  campaign_id: string;
  sift_id: string;
  organisation: string;
  contact_name: string | null;
  email: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  qualification_status: Prospect["status"];
  qualification_reason: string | null;
  created_at: string;
};

function mapProspect(row: ProspectRow): Prospect {
  const [firstName = "", ...lastParts] = (row.contact_name ?? "").split(/\s+/);
  return {
    id: row.id,
    firstName,
    lastName: lastParts.join(" "),
    email: row.email,
    company: row.organisation,
    role: row.industry,
    source: row.sift_id,
    campaignId: row.campaign_id,
    status: row.qualification_status,
    notes: row.qualification_reason,
    createdAt: row.created_at,
    website: row.website,
    location: row.location,
  };
}

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export const prospectsApi = {
  async list(query?: {
    status?: string;
    search?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const result = await apiClient.get<{ data: ProspectRow[]; total: number; page: number; pageSize: number }>(
      `/prospects${queryString(query)}`
    );
    return { ...result, data: result.data.map(mapProspect) };
  },

  async get(id: string) {
    const result = await apiClient.get<{ data: ProspectRow }>(`/prospects/${id}`);
    return { data: mapProspect(result.data) };
  },

  async create(payload: {
    campaignId: string;
    siftId: string;
    organisation: string;
    contactName?: string;
    email?: string;
    website?: string;
    industry?: string;
    location?: string;
  }) {
    const result = await apiClient.post<{ data: ProspectRow }>("/prospects", payload);
    return { data: mapProspect(result.data) };
  },

  async update(
    id: string,
    payload: Partial<{
      company: string;
      role: string;
      status: Prospect["status"];
      notes: string;
      firstName: string;
      lastName: string;
      email: string;
    }>
  ) {
    const body: Record<string, unknown> = {};
    if (payload.company !== undefined) body.organisation = payload.company;
    if (payload.role !== undefined) body.industry = payload.role;
    if (payload.status !== undefined) body.qualificationStatus = payload.status;
    if (payload.notes !== undefined) body.qualificationReason = payload.notes;
    if (payload.email !== undefined) body.email = payload.email || null;
    if (payload.firstName !== undefined || payload.lastName !== undefined) {
      const current = await this.get(id);
      const name = `${payload.firstName ?? current.data.firstName} ${payload.lastName ?? current.data.lastName}`.trim();
      body.contactName = name || null;
    }
    const result = await apiClient.patch<{ data: ProspectRow }>(`/prospects/${id}`, body);
    return { data: mapProspect(result.data) };
  },

  async delete(id: string) {
    return apiClient.delete<void>(`/prospects/${id}`);
  },
};
