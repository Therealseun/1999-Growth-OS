import { z } from 'zod';
import { query, withTransaction } from '../../lib/db.js';
import { invalid, notFound } from '../../lib/errors.js';
import { created, route } from '../../lib/http.js';

const reportTypes = ['PIPELINE', 'PERFORMANCE', 'TASK_AUDIT'];
const filters = z.object({
  type: z.enum(reportTypes).optional(),
  campaignId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
const createBody = z.object({
  type: z.enum(reportTypes),
  campaignId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  format: z.enum(['CSV', 'JSON']).default('CSV'),
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo);

function campaignAccess(profile, position = 1) {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (profile.role === 'MANAGER' && profile.department_id) {
    return { sql: `c.department_id = $${position}`, params: [profile.department_id] };
  }
  return {
    sql: `exists (select 1 from campaign_assignments ca where ca.campaign_id = c.id and ca.employee_id = $${position} and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({ query: filters }, async ({ session, query: filters }) => {
  const profile = session.profile;
  const params = [];
  const where = [];
  if (profile.role !== 'ADMIN') {
    params.push(profile.id);
    where.push(`r.created_by = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    where.push(`r.report_type = $${params.length}`);
  }
  if (filters.campaignId) {
    params.push(filters.campaignId);
    where.push(`r.campaign_id = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    where.push(`r.date_from >= $${params.length}::date`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    where.push(`r.date_to <= $${params.length}::date`);
  }
  const condition = where.length ? where.join(' and ') : 'true';
  const [result, count] = await Promise.all([
    query(
      `select r.id, r.report_type as type, r.campaign_id, r.date_from, r.date_to, r.format, r.created_by, r.created_at
       from report_definitions r where ${condition} order by r.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    ),
    query(`select count(*)::int as total from report_definitions r where ${condition}`, params),
  ]);
  return {
    data: result.rows.map((row) => ({ ...row, status: 'READY' })),
    total: count.rows[0].total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
});

export const POST = route({ body: createBody }, async ({ session, body }) => {
  if (body.campaignId) {
    const access = campaignAccess(session.profile, 2);
    const campaign = await query(
      `select c.id from campaigns c where c.id = $1 and ${access.sql}`,
      [body.campaignId, ...access.params],
    );
    if (!campaign.rowCount) throw notFound();
  }
  if (session.profile.role === 'EMPLOYEE' && body.type === 'PIPELINE') {
    throw notFound();
  }
  return withTransaction(session.userId, async (client) => {
    const { rows } = await client.query(
      `insert into report_definitions (report_type, campaign_id, date_from, date_to, format, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, report_type as type, campaign_id, date_from, date_to, format, created_by, created_at`,
      [body.type, body.campaignId ?? null, body.dateFrom ?? null, body.dateTo ?? null, body.format, session.userId],
    );
    return created({ data: { ...rows[0], status: 'READY' } });
  });
});
