import { getSupabaseClient } from "./supabase";
import {
  mapEmailDraft,
  mapEmailTemplate,
  mapLeadMagnet,
  throwSupabaseError,
} from "./supabase-data";
import type { EmailDraft, EmailTemplate, LeadMagnet } from "./types";

export const workspaceApi = {
  async getEmailTemplates() {
    const { data, error } = await getSupabaseClient()
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throwSupabaseError(error);
    return { data: (data ?? []).map((row) => mapEmailTemplate(row) as EmailTemplate) };
  },

  async createEmailTemplate(payload: { name: string; subject: string; body: string; type: string }) {
    const { data, error } = await getSupabaseClient()
      .from("email_templates")
      .insert(payload)
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapEmailTemplate(data) as EmailTemplate };
  },

  async getEmailDrafts() {
    const { data, error } = await getSupabaseClient()
      .from("email_drafts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throwSupabaseError(error);
    return { data: (data ?? []).map((row) => mapEmailDraft(row) as EmailDraft) };
  },

  async getEmailDraft(id: string) {
    const { data, error } = await getSupabaseClient()
      .from("email_drafts")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapEmailDraft(data) as EmailDraft };
  },

  async createEmailDraft(payload: {
    subject: string;
    body: string;
    campaignId?: string;
    prospectIds?: string[];
  }) {
    const { data, error } = await getSupabaseClient()
      .from("email_drafts")
      .insert({
        subject: payload.subject,
        body: payload.body,
        campaign_id: payload.campaignId ?? null,
        prospect_ids: payload.prospectIds ?? [],
      })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapEmailDraft(data) as EmailDraft };
  },

  async sendEmailDraft(id: string) {
    const sentAt = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from("email_drafts")
      .update({ status: "SENT", sent_at: sentAt })
      .eq("id", id)
      .select("sent_at")
      .single();
    if (error) throwSupabaseError(error);
    return { data: { sent: true, sentAt: String(data.sent_at) } };
  },

  async getEmailStats(campaignId?: string) {
    let query = getSupabaseClient().from("email_drafts").select("status,campaign_id,created_at,sent_at");
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error } = await query;
    if (error) throwSupabaseError(error);
    return {
      data: {
        drafts: data?.filter((row) => row.status === "DRAFT").length ?? 0,
        sent: data?.filter((row) => row.status === "SENT").length ?? 0,
      },
    };
  },

  async getSeoAudits(campaignId?: string) {
    let query = getSupabaseClient().from("seo_audits").select("*").order("created_at", { ascending: false });
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error } = await query;
    if (error) throwSupabaseError(error);
    return {
      data: (data ?? []).map((row) => ({
        id: row.id,
        campaignId: row.campaign_id,
        overallScore: row.overall_score == null ? null : Number(row.overall_score),
        categories: row.categories ?? {},
        recommendations: row.recommendations ?? [],
        errors: row.errors ?? [],
        createdAt: row.created_at,
      })),
    };
  },

  async createSeoAudit(campaignId: string) {
    const { data, error } = await getSupabaseClient()
      .from("seo_audits")
      .insert({ campaign_id: campaignId })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return {
      data: {
        id: data.id,
        campaignId: data.campaign_id,
        overallScore: null,
        categories: data.categories ?? {},
        recommendations: data.recommendations ?? [],
        errors: data.errors ?? [],
        createdAt: data.created_at,
      },
    };
  },

  async getKeywordResearch(campaignId: string) {
    const { data, error } = await getSupabaseClient()
      .from("campaign_niche_intelligence")
      .select("insights,opportunities,risks,competitors")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (error) throwSupabaseError(error);
    const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
    const keywords = opportunities.flatMap((opportunity) => {
      if (typeof opportunity === "string") {
        return [{ keyword: opportunity, volume: "—", difficulty: "—", intent: "—" }];
      }
      if (opportunity && typeof opportunity === "object" && "keyword" in opportunity) {
        const row = opportunity as Record<string, unknown>;
        return [{
          keyword: String(row.keyword),
          volume: String(row.volume ?? "—"),
          difficulty: String(row.difficulty ?? "—"),
          intent: String(row.intent ?? "—"),
        }];
      }
      return [];
    });
    return { data: { keywords } };
  },

  async getSeoRecommendations(campaignId: string) {
    const [{ data: audits, error: auditsError }, { data: intelligence, error }] = await Promise.all([
      getSupabaseClient()
        .from("seo_audits")
        .select("recommendations,errors")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getSupabaseClient()
        .from("campaign_niche_intelligence")
        .select("opportunities,risks")
        .eq("campaign_id", campaignId)
        .maybeSingle(),
    ]);
    if (auditsError) throwSupabaseError(auditsError);
    if (error) throwSupabaseError(error);
    const recommendations = Array.isArray(audits?.recommendations) ? audits.recommendations : [];
    const errors = Array.isArray(audits?.errors) ? audits.errors : [];
    return {
      data: {
        recommendations: recommendations.length
          ? recommendations
          : (intelligence?.opportunities as string[] | undefined) ?? [],
        errors: errors.length ? errors : (intelligence?.risks as unknown[] | undefined) ?? [],
      },
    };
  },

  async getLeadMagnets(campaignId?: string) {
    let query = getSupabaseClient().from("lead_magnets").select("*").order("created_at", { ascending: false });
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error } = await query;
    if (error) throwSupabaseError(error);
    return { data: (data ?? []).map((row) => mapLeadMagnet(row) as LeadMagnet) };
  },

  async createLeadMagnet(payload: {
    name: string;
    type: string;
    description: string;
    campaignId?: string;
    content?: string;
  }) {
    const { data, error } = await getSupabaseClient()
      .from("lead_magnets")
      .insert({
        name: payload.name,
        type: payload.type,
        description: payload.description,
        campaign_id: payload.campaignId ?? null,
        content: payload.content ?? null,
      })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapLeadMagnet(data) as LeadMagnet };
  },

  async getLeadMagnet(id: string) {
    const { data, error } = await getSupabaseClient().from("lead_magnets").select("*").eq("id", id).single();
    if (error) throwSupabaseError(error);
    return { data: mapLeadMagnet(data) as LeadMagnet };
  },

  async updateLeadMagnet(id: string, payload: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if (typeof payload.name === "string") patch.name = payload.name;
    if (typeof payload.type === "string") patch.type = payload.type;
    if (typeof payload.description === "string") patch.description = payload.description;
    if (typeof payload.content === "string" || payload.content === null) patch.content = payload.content;
    if (typeof payload.status === "string") patch.status = payload.status;
    if (typeof payload.downloadCount === "number") patch.download_count = payload.downloadCount;
    if (typeof payload.conversionRate === "number") patch.conversion_rate = payload.conversionRate;
    const { data, error } = await getSupabaseClient()
      .from("lead_magnets")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapLeadMagnet(data) as LeadMagnet };
  },

  async getLeadMagnetPerformance(id: string) {
    const { data, error } = await getSupabaseClient()
      .from("lead_magnets")
      .select("download_count,conversion_rate")
      .eq("id", id)
      .single();
    if (error) throwSupabaseError(error);
    return { data: { downloadCount: Number(data.download_count), conversionRate: Number(data.conversion_rate) } };
  },
};
