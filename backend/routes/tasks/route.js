import { z } from 'zod';
import { query } from '../../lib/db.js';
import { route } from '../../lib/http.js';

const querySchema = z.object({
  status: z.enum(['READY', 'REVIEWED', 'SENT', 'PUBLISHED', 'POSTED', 'SKIPPED', 'INVALID', 'EXPIRED']).optional(),
  type: z.enum(['EMAIL', 'SEO', 'LEAD_MAGNET']).optional(),
  assignedTo: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const ledger = `(
  select e.id, 'EMAIL'::text as type, e.campaign_id, e.employee_id as assigned_to,
         e.subject as title, e.body as description, e.status::text as source_status,
         e.created_at, e.sent_at as completed_at, c.department_id,
         p.name as assigned_to_name
  from email_tasks e join campaigns c on c.id = e.campaign_id
  left join profiles p on p.id = e.employee_id
  union all
  select s.id, 'SEO', s.campaign_id, s.employee_id, s.title, s.article, s.status::text,
         s.created_at, s.published_at, c.department_id, p.name
  from seo_tasks s join campaigns c on c.id = s.campaign_id
  left join profiles p on p.id = s.employee_id
  union all
  select l.id, 'LEAD_MAGNET', l.campaign_id, l.employee_id, l.platform, l.comment, l.status::text,
         l.created_at, l.posted_at, c.department_id, p.name
  from lead_magnet_tasks l join campaigns c on c.id = l.campaign_id
  left join profiles p on p.id = l.employee_id
) t`;

function scope(profile) {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (profile.role === 'MANAGER') {
    if (!profile.department_id) return { sql: 'false', params: [] };
    return { sql: 't.department_id = $1', params: [profile.department_id] };
  }
  return { sql: 't.assigned_to = $1', params: [profile.id] };
}

export const GET = route({ query: querySchema }, async ({ session, query: filters }) => {
  const accessible = scope(session.profile);
  const where = [accessible.sql];
  const params = [...accessible.params];
  if (filters.status) {
    params.push(filters.status);
    where.push(`t.source_status = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    where.push(`t.type = $${params.length}`);
  }
  if (filters.assignedTo) {
    params.push(filters.assignedTo);
    where.push(`t.assigned_to = $${params.length}`);
  }
  if (filters.campaignId) {
    params.push(filters.campaignId);
    where.push(`t.campaign_id = $${params.length}`);
  }
  const condition = where.join(' and ');
  const [result, count] = await Promise.all([
    query(
      `select t.id, t.type, t.title, t.description, t.source_status as status,
              t.assigned_to, t.assigned_to_name, t.campaign_id, t.completed_at, t.created_at
       from ${ledger} where ${condition}
       order by t.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    ),
    query(`select count(*)::int as total from ${ledger} where ${condition}`, params),
  ]);
  return {
    data: result.rows.map((row) => ({
      ...row,
      status: row.status,
      due_date: null,
      priority: null,
      assigned_by: null,
      assigned_by_name: null,
    })),
    total: count.rows[0].total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
});
