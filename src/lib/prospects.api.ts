import { getSupabaseClient } from "./supabase";
import { mapProspect, throwSupabaseError } from "./supabase-data";
import type { Prospect } from "./types";

export const prospectsApi = {
  async list(query?: {
    status?: string;
    search?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  }) {
    let request = getSupabaseClient()
      .from("prospects")
      .select("*")
      .order("created_at", { ascending: false });
    if (query?.status) request = request.eq("status", query.status);
    if (query?.campaignId) request = request.eq("campaign_id", query.campaignId);
    const { data, error } = await request;
    if (error) throwSupabaseError(error);

    const search = query?.search?.trim().toLowerCase();
    const rows = (data ?? [])
      .map((row) => mapProspect(row) as Prospect)
      .filter((prospect) =>
        !search ||
        `${prospect.firstName} ${prospect.lastName} ${prospect.email} ${prospect.company ?? ""}`
          .toLowerCase()
          .includes(search)
      );
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return { data: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
  },

  async get(id: string) {
    const { data, error } = await getSupabaseClient()
      .from("prospects")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapProspect(data) as Prospect };
  },

  async create(payload: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    role?: string;
    source?: string;
    campaignId?: string;
    status?: string;
  }) {
    const { data, error } = await getSupabaseClient()
      .from("prospects")
      .insert({
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email.trim(),
        company: payload.company ?? null,
        job_title: payload.role ?? null,
        source: payload.source ?? "Manual",
        campaign_id: payload.campaignId ?? null,
        status: payload.status ?? "SEED",
      })
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapProspect(data) as Prospect };
  },

  async update(
    id: string,
    payload: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      company: string;
      role: string;
      status: string;
      notes: string;
    }>
  ) {
    const patch: Record<string, string | null> = {};
    if (payload.firstName !== undefined) patch.first_name = payload.firstName;
    if (payload.lastName !== undefined) patch.last_name = payload.lastName;
    if (payload.email !== undefined) patch.email = payload.email;
    if (payload.company !== undefined) patch.company = payload.company;
    if (payload.role !== undefined) patch.job_title = payload.role;
    if (payload.status !== undefined) patch.status = payload.status;
    if (payload.notes !== undefined) patch.notes = payload.notes;

    const { data, error } = await getSupabaseClient()
      .from("prospects")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throwSupabaseError(error);
    return { data: mapProspect(data) as Prospect };
  },

  async delete(id: string) {
    const { error } = await getSupabaseClient().from("prospects").delete().eq("id", id);
    if (error) throwSupabaseError(error);
  },

  async bulkImport(payload: { emails: string[]; campaignId?: string }) {
    let imported = 0;
    let failed = 0;
    const supabase = getSupabaseClient();
    for (const rawEmail of payload.emails) {
      const email = rawEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed++;
        continue;
      }
      const localPart = email.split("@")[0];
      const { error } = await supabase.from("prospects").insert({
        first_name: localPart.slice(0, 1).toUpperCase() + localPart.slice(1),
        last_name: "",
        email,
        source: "Bulk import",
        campaign_id: payload.campaignId ?? null,
        status: "SEED",
      });
      if (error?.code === "23505") {
        failed++;
      } else if (error) {
        throwSupabaseError(error);
      } else {
        imported++;
      }
    }
    return { data: { imported, failed } };
  },
};
