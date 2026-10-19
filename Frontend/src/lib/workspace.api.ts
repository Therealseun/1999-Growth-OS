import { apiClient } from "./api";
import type { EmailDraft, EmailTemplate, LeadMagnet } from "./types";

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export const workspaceApi = {
  async getEmailTemplates() {
    const result = await apiClient.get<{ data: Array<Record<string, unknown>> }>("/workspace/email/templates");
    return { data: result.data.map((row) => ({
      id: String(row.id), name: String(row.name), subject: String(row.subject), body: String(row.body),
      type: String(row.type), createdAt: String(row.created_at), createdBy: String(row.created_by),
    })) as EmailTemplate[] };
  },

  async createEmailTemplate(payload: { name: string; subject: string; body: string; type: string }) {
    const result = await apiClient.post<{ data: Record<string, unknown> }>("/workspace/email/templates", payload);
    const row = result.data;
    return { data: {
      id: String(row.id), name: String(row.name), subject: String(row.subject), body: String(row.body),
      type: String(row.type), createdAt: String(row.created_at), createdBy: String(row.created_by),
    } as EmailTemplate };
  },

  async getEmailDrafts() {
    const result = await apiClient.get<{ data: Array<Record<string, unknown>> }>("/workspace/email/drafts");
    return { data: result.data.map(mapDraft) };
  },

  async getEmailDraft(id: string) {
    const result = await apiClient.get<{ data: Record<string, unknown> }>(`/workspace/email/drafts/${id}`);
    return { data: mapDraft(result.data) };
  },

  async createEmailDraft(payload: {
    subject: string; body: string; campaignId?: string; prospectIds?: string[];
  }) {
    const result = await apiClient.post<{ data: Record<string, unknown> }>("/workspace/email/drafts", payload);
    return { data: mapDraft(result.data) };
  },

  async sendEmailDraft(id: string) {
    return apiClient.post<{ data: { sent: boolean; sentAt: string } }>(
      `/workspace/email/drafts/${id}/sent`,
      { confirmedSentExternally: true }
    );
  },

  async getEmailStats(campaignId?: string) {
    const { data } = await this.getEmailDrafts();
    const drafts = data.filter((draft) => !campaignId || draft.campaignId === campaignId);
    return {
      data: {
        drafts: drafts.filter((draft) => draft.status === "DRAFT").length,
        sent: drafts.filter((draft) => draft.status === "SENT").length,
      },
    };
  },

  async getSeoAudits(campaignId?: string) {
    return apiClient.get<{ data: Array<{
      id: string;
      campaign_id: string;
      overall_score: number | null;
      categories: Record<string, unknown>;
      recommendations: unknown[];
      errors: unknown[];
      created_at: string;
    }> }>(`/workspace/seo/audits${queryString({ campaignId })}`).then(({ data }) => ({
      data: data.map((row) => ({
        id: row.id,
        campaignId: row.campaign_id,
        overallScore: row.overall_score == null ? null : Number(row.overall_score),
        categories: row.categories,
        recommendations: row.recommendations,
        errors: row.errors,
        createdAt: row.created_at,
      })),
    }));
  },

  async createSeoAudit(_campaignId: string) {
    throw new Error("GrowthOS has no SEO scanner. An audit can only be saved after an external scanner provides its real results.");
  },

  async saveSeoAudit(payload: {
    campaignId: string;
    overallScore?: number | null;
    categories?: Record<string, unknown>;
    recommendations?: unknown[];
    errors?: unknown[];
  }) {
    return apiClient.post("/workspace/seo/audits", payload);
  },

  async getKeywordResearch(campaignId: string) {
    const { data } = await apiClient.get<{
      data: { niche: string; opportunities: unknown[] };
    }>(`/campaigns/${campaignId}/niche-profile`);
    const keywords = data.opportunities.flatMap((opportunity) => {
      if (typeof opportunity === "string") {
        return [{ keyword: opportunity, volume: "—", difficulty: "—", intent: "—" }];
      }
      if (!opportunity || typeof opportunity !== "object" || !("keyword" in opportunity)) return [];
      const item = opportunity as Record<string, unknown>;
      return [{
        keyword: String(item.keyword),
        volume: String(item.volume ?? "—"),
        difficulty: String(item.difficulty ?? "—"),
        intent: String(item.intent ?? "—"),
      }];
    });
    return { data: { keywords } };
  },

  async getSeoRecommendations(campaignId: string) {
    const [{ data: audits }, { data: intelligence }] = await Promise.all([
      this.getSeoAudits(campaignId),
      apiClient.get<{ data: { opportunities: unknown[]; risks: unknown[] } }>(
        `/campaigns/${campaignId}/niche-profile`
      ),
    ]);
    const latest = audits[0];
    return {
      data: {
        recommendations: latest?.recommendations?.length ? latest.recommendations : intelligence.opportunities,
        errors: latest?.errors?.length ? latest.errors : intelligence.risks,
      },
    };
  },

  async getLeadMagnets(campaignId?: string) {
    const result = await apiClient.get<{ data: Array<Record<string, unknown>> }>(`/workspace/lead-magnets${queryString({ campaignId })}`);
    return { data: result.data.map(mapLeadMagnet) };
  },

  async createLeadMagnet(payload: {
    name: string; type: string; description: string; campaignId?: string; content?: string;
  }) {
    const result = await apiClient.post<{ data: Record<string, unknown> }>("/workspace/lead-magnets", payload);
    return { data: mapLeadMagnet(result.data) };
  },

  async getLeadMagnet(id: string) {
    const result = await apiClient.get<{ data: Record<string, unknown> }>(`/workspace/lead-magnets/${id}`);
    return { data: mapLeadMagnet(result.data) };
  },

  async updateLeadMagnet(id: string, payload: Record<string, unknown>) {
    const result = await apiClient.patch<{ data: Record<string, unknown> }>(`/workspace/lead-magnets/${id}`, payload);
    return { data: mapLeadMagnet(result.data) };
  },

  async getLeadMagnetPerformance(_id: string) {
    throw new Error("Downloads and conversion events are not recorded in the current GrowthOS domain model.");
  },
};

function mapDraft(row: Record<string, unknown>): EmailDraft {
  return {
    id: String(row.id),
    subject: String(row.subject),
    body: String(row.body),
    status: String(row.status) as EmailDraft["status"],
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    prospectIds: Array.isArray(row.prospect_ids) ? row.prospect_ids.map(String) : [],
    sentAt: row.sent_at == null ? null : String(row.sent_at),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  };
}

function mapLeadMagnet(row: Record<string, unknown>): LeadMagnet {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type),
    description: String(row.description ?? ""),
    content: row.content == null ? null : String(row.content),
    status: String(row.status),
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  };
}
