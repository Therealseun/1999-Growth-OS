import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';

const filters = z.object({
  employeeId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = route({ query: filters }, async ({ session, query: filters }) => {
  const profile = session.profile;
  const values = [];
  const where = [];
  if (profile.role === 'EMPLOYEE') {
    values.push(profile.id);
    where.push(`w.employee_id = $${values.length}`);
    if (filters.employeeId && filters.employeeId !== profile.id) throw notFound();
  } else if (profile.role === 'MANAGER') {
    if (!profile.department_id) return { data: [], total: 0, page: filters.page, pageSize: filters.pageSize };
    values.push(profile.department_id);
    where.push(`c.department_id = $${values.length}`);
    if (filters.employeeId) {
      values.push(filters.employeeId);
      where.push(`w.employee_id = $${values.length}`);
    }
  } else if (filters.employeeId) {
    values.push(filters.employeeId);
    where.push(`w.employee_id = $${values.length}`);
  }
  if (filters.campaignId) {
    values.push(filters.campaignId);
    where.push(`w.campaign_id = $${values.length}`);
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`w.work_date >= $${values.length}::date`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`w.work_date <= $${values.length}::date`);
  }
  const condition = where.length ? where.join(' and ') : 'true';
  const [result, count] = await Promise.all([
    query(
      `select w.id, w.campaign_id, c.name as campaign_name, w.employee_id as user_id, p.name as employee_name,
              w.work_date, w.email_target_snapshot, w.seo_target_snapshot, w.lead_magnet_target_snapshot,
              w.total_target_snapshot, w.carried_in_email, w.carried_in_seo, w.carried_in_lead_magnet,
              w.generated_at, r.email_completed, r.seo_completed, r.lead_magnet_completed,
              r.total_completed, r.completion_pct
       from daily_workloads w join campaigns c on c.id = w.campaign_id
       join profiles p on p.id = w.employee_id
       left join v_daily_report r on r.workload_id = w.id
       where ${condition} order by w.work_date desc, p.name
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, filters.pageSize, (filters.page - 1) * filters.pageSize],
    ),
    query(
      `select count(*)::int as total from daily_workloads w
       join campaigns c on c.id = w.campaign_id where ${condition}`,
      values,
    ),
  ]);
  return { data: result.rows, total: count.rows[0].total, page: filters.page, pageSize: filters.pageSize };
});
