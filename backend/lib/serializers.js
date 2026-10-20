// Shapes database rows into the objects the API contract describes.

export function targetsView(row) {
  if (!row || !row.id) return null;
  const total = row.email_daily_target + row.seo_daily_target + row.lead_magnet_daily_target;
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    email_daily_target: row.email_daily_target,
    seo_daily_target: row.seo_daily_target,
    lead_magnet_daily_target: row.lead_magnet_daily_target,
    workdays_per_month: row.workdays_per_month,
    // Calculated here, never accepted from a client.
    total_daily_tasks: total,
    monthly_total: total * row.workdays_per_month,
    effective_from: row.effective_from,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

export const PROSPECT_COLUMNS = `id, campaign_id, sift_id, organisation, contact_name, email, website, industry,
  location, qualification_status, qualification_reason, created_at`;

export function jobView(row) {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    kind: row.kind,
    status: row.status,
    requested_count: row.requested_count,
    delivered_count: row.delivered_count,
    error: row.error,
  };
}

export const profileView = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  department_id: row.department_id,
});

export const nicheView = (row) => ({
  id: row.id,
  campaign_id: row.campaign_id,
  version: row.version,
  status: row.status,
  profile: row.profile,
  approved_by: row.approved_by,
  approved_at: row.approved_at,
  created_at: row.created_at,
});
