import { z } from 'zod';
import { query, withTransaction } from '../../lib/db.js';
import { conflict, notFound } from '../../lib/errors.js';
import { created, route } from '../../lib/http.js';
import { requireRole } from '../../lib/guard.js';

const filters = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

function access(profile, alias = 'c') {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (!profile.department_id) return { sql: 'false', params: [] };
  if (profile.role === 'MANAGER') return { sql: `${alias}.department_id = $1`, params: [profile.department_id] };
  return {
    sql: `exists (select 1 from campaign_assignments ca where ca.campaign_id = ${alias}.id and ca.employee_id = $1 and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({ query: filters }, async ({ session, query: filters }) => {
  const scope = access(session.profile);
  const params = [...scope.params];
  const conditions = [scope.sql];
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`c.status = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conditions.push(`(c.name ilike $${params.length} or c.niche ilike $${params.length} or c.offer ilike $${params.length})`);
  }
  const where = conditions.join(' and ');
  const { rows } = await query(
    `select c.*, d.name as department_name,
       (select count(*)::int from prospects p where p.campaign_id = c.id) as prospect_count,
       ((select count(*) from email_tasks e where e.campaign_id = c.id) +
        (select count(*) from seo_tasks s where s.campaign_id = c.id) +
        (select count(*) from lead_magnet_tasks l where l.campaign_id = c.id))::int as task_count
     from campaigns c join departments d on d.id = c.department_id
     where ${where} order by c.updated_at desc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );
  const count = await query(`select count(*)::int as total from campaigns c where ${where}`, params);
  return { data: rows, total: count.rows[0].total, page: filters.page, pageSize: filters.pageSize };
});

const createBody = z.object({
  name: z.string().trim().min(1).max(160),
  niche: z.string().trim().min(1).max(300),
  offer: z.string().trim().min(1).max(500),
  location: z.string().trim().min(1).max(300),
  objective: z.string().trim().min(1).max(1000),
  departmentId: z.string().uuid().optional(),
});

export const POST = route({ body: createBody, roles: ['ADMIN', 'MANAGER'] }, async ({ session, body }) => {
  const profile = session.profile;
  const departmentId = profile.role === 'MANAGER' ? profile.department_id : body.departmentId;
  if (!departmentId) throw notFound('A department is required for this campaign');
  if (profile.role === 'MANAGER' && !profile.department_id) throw notFound();
  return withTransaction(session.userId, async (client) => {
    if (profile.role === 'ADMIN') {
      const department = await client.query('select id from departments where id = $1', [departmentId]);
      if (!department.rowCount) throw notFound('Department not found');
    }
    const { rows } = await client.query(
      `insert into campaigns (name, niche, offer, location, objective, department_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [body.name, body.niche, body.offer, body.location, body.objective, departmentId, session.userId],
    );
    await client.query('select sync_campaign_assignments($1)', [rows[0].id]);
    return created({ data: rows[0] });
  });
});
