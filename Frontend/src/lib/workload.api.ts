import { apiClient } from "./api";
import type { WorkloadSnapshot, WorkloadTarget } from "./types";

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

function mapTarget(row: Record<string, unknown>): WorkloadTarget {
  return {
    id: String(row.id),
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    campaignName: row.campaign_name == null ? null : String(row.campaign_name),
    emailDailyTarget: Number(row.email_daily_target),
    seoDailyTarget: Number(row.seo_daily_target),
    leadMagnetDailyTarget: Number(row.lead_magnet_daily_target),
    workdaysPerMonth: Number(row.workdays_per_month),
    effectiveFrom: String(row.effective_from),
    updatedAt: String(row.updated_at),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
  };
}

function mapSnapshot(row: Record<string, unknown>): WorkloadSnapshot {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    campaignName: String(row.campaign_name),
    userId: String(row.user_id),
    employeeName: String(row.employee_name),
    workDate: String(row.work_date),
    emailTarget: Number(row.email_target_snapshot),
    seoTarget: Number(row.seo_target_snapshot),
    leadMagnetTarget: Number(row.lead_magnet_target_snapshot),
    emailCompleted: Number(row.email_completed ?? 0),
    seoCompleted: Number(row.seo_completed ?? 0),
    leadMagnetCompleted: Number(row.lead_magnet_completed ?? 0),
    totalCompleted: Number(row.total_completed ?? 0),
    completionPct: row.completion_pct == null ? null : Number(row.completion_pct),
    generatedAt: String(row.generated_at),
  };
}

export const workloadApi = {
  async getTargets(query?: { campaignId?: string }) {
    const result = await apiClient.get<{ data: Array<Record<string, unknown>> }>(
      `/workload/targets${queryString(query)}`
    );
    return { data: result.data.map(mapTarget) };
  },

  async updateTarget(payload: {
    campaignId?: string;
    effectiveFrom: string;
    emailDailyTarget: number;
    seoDailyTarget: number;
    leadMagnetDailyTarget: number;
    workdaysPerMonth?: number;
  }) {
    const result = await apiClient.post<{ data: Record<string, unknown> }>("/workload/targets", payload);
    return { data: mapTarget(result.data) };
  },

  async getSnapshots(query?: { employeeId?: string; campaignId?: string; dateFrom?: string; dateTo?: string }) {
    const result = await apiClient.get<{ data: Array<Record<string, unknown>> }>(
      `/workload/snapshots${queryString(query)}`
    );
    return { data: result.data.map(mapSnapshot) };
  },

  async getAllSnapshots() {
    return this.getSnapshots();
  },

  async getUserWorkload(userId: string) {
    const snapshots = await this.getSnapshots({ employeeId: userId });
    const targets = await this.getTargets();
    return { data: { userId, targets: targets.data, snapshots: snapshots.data } };
  },
};
