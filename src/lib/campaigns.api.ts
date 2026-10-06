import { getSupabaseClient } from "./supabase";
import { mapCampaign, throwSupabaseError } from "./supabase-data";
import type { Campaign, CampaignMetrics } from "./types";

const CAMPAIGN_SELECT = "*,prospects(count),tasks(count)";

export const campaignsApi = {
  async list(query?: { status?: string; search?: string; page?: number; pageSize?: number }) {
    let request = getSupabaseClient()
      .from("campaigns")
      .select(CAMPAIGN_SELECT)
      .order("updated_at", { ascending: false });
    if (query?.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);

    const search = query?.search?.trim().toLowerCase();
    const rows = (data ?? [])
      .map((row) => mapCampaign(row))
      .filter((campaign) =>
        !search ||
        `${campaign.name} ${campaign.niche} ${campaign.targetAudience}`.toLowerCase().includes(search)
      );
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
  },

  async get(id: string) {
    const { data, error } = await getSupabaseClient()
      .from("campaigns")
      .select(CAMPAIGN_SELECT)
      .eq("id", id)
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapCampaign(data) as Campaign };
  },

  async create(payload: { name: string; niche: string; targetAudience: string; objective: string }) {
    const { data, error } = await getSupabaseClient()
      .from("campaigns")
      .insert({
        name: payload.name,
        niche: payload.niche,
        target_audience: payload.targetAudience,
        objective: payload.objective,
      })
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapCampaign(data) as Campaign };
  },

  async update(
    id: string,
    payload: Partial<{ name: string; niche: string; targetAudience: string; objective: string; status: string }>
  ) {
    const patch: Record<string, string> = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.niche !== undefined) patch.niche = payload.niche;
    if (payload.targetAudience !== undefined) patch.target_audience = payload.targetAudience;
    if (payload.objective !== undefined) patch.objective = payload.objective;
    if (payload.status !== undefined) patch.status = payload.status;

    const { data, error } = await getSupabaseClient()
      .from("campaigns")
      .update(patch)
      .eq("id", id)
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapCampaign(data) as Campaign };
  },

  async delete(id: string) {
    const { error } = await getSupabaseClient().from("campaigns").delete().eq("id", id);
    if (error) throwSupabaseError(error);
  },

  async getNicheIntelligence(id: string): Promise<{
    data: {
      niche: string;
      insights: string[];
      opportunities: string[];
      risks: string[];
      competitors: unknown[];
    };
  }> {
    const supabase = getSupabaseClient();
    const [{ data: campaign, error: campaignError }, { data: intelligence, error }] =
      await Promise.all([
        supabase.from("campaigns").select("niche").eq("id", id).single(),
        supabase
          .from("campaign_niche_intelligence")
          .select("insights,opportunities,risks,competitors")
          .eq("campaign_id", id)
          .maybeSingle(),
      ]);
    if (campaignError) throwSupabaseError(campaignError);
    if (error) throwSupabaseError(error);
    const stringArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return {
      data: {
        niche: campaign.niche,
        insights: stringArray(intelligence?.insights),
        opportunities: stringArray(intelligence?.opportunities),
        risks: stringArray(intelligence?.risks),
        competitors: Array.isArray(intelligence?.competitors) ? intelligence.competitors : [],
      },
    };
  },

  async getMetrics(id: string) {
    const supabase = getSupabaseClient();
    const [
      { data: prospects, error: prospectsError },
      { data: tasks, error: tasksError },
      { count: emailsSent, error: emailError },
      { data: magnets, error: magnetError },
    ] = await Promise.all([
      supabase.from("prospects").select("status").eq("campaign_id", id),
      supabase.from("tasks").select("status").eq("campaign_id", id),
      supabase
        .from("email_drafts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "SENT"),
      supabase.from("lead_magnets").select("download_count").eq("campaign_id", id),
    ]);
    if (prospectsError) throwSupabaseError(prospectsError);
    if (tasksError) throwSupabaseError(tasksError);
    if (emailError) throwSupabaseError(emailError);
    if (magnetError) throwSupabaseError(magnetError);
    const prospectRows = prospects ?? [];
    const taskRows = tasks ?? [];
    const metrics: CampaignMetrics = {
      prospectCount: prospectRows.length,
      contactedCount: prospectRows.filter((row) =>
        ["CONTACTED", "QUALIFIED", "CONVERTED"].includes(row.status)
      ).length,
      qualifiedCount: prospectRows.filter((row) =>
        ["QUALIFIED", "CONVERTED"].includes(row.status)
      ).length,
      convertedCount: prospectRows.filter((row) => row.status === "CONVERTED").length,
      tasksCompleted: taskRows.filter((row) => row.status === "COMPLETED").length,
      tasksTotal: taskRows.length,
      emailsSent: emailsSent ?? 0,
      leadsGenerated: (magnets ?? []).reduce((sum, row) => sum + Number(row.download_count ?? 0), 0),
    };
    return { data: metrics };
  },
};
