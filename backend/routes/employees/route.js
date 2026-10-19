import { z } from 'zod';
import { query, withTransaction } from '../../lib/db.js';
import { notFound } from '../../lib/errors.js';
import { created, route } from '../../lib/http.js';
import { requireRole } from '../../lib/guard.js';
import { authAdminClient } from '../../lib/supabase.js';

const listQuery = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = route({ roles: ['ADMIN', 'MANAGER'], query: listQuery }, async ({ session, query: filters }) => {
  const profile = session.profile;
  const params = [];
  const where = [];
  if (profile.role === 'MANAGER') {
    if (!profile.department_id) return { data: [], total: 0, page: filters.page, pageSize: filters.pageSize };
    params.push(profile.department_id);
    where.push(`p.department_id = $${params.length}`);
  }
  if (filters.role) {
    params.push(filters.role);
    where.push(`p.role = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(p.name ilike $${params.length} or p.email ilike $${params.length})`);
  }
  const condition = where.length ? where.join(' and ') : 'true';
  const [result, count] = await Promise.all([
    query(
      `select p.id, p.name, p.email, p.role, p.status, p.department_id, d.name as department_name, p.created_at, p.updated_at
       from profiles p left join departments d on d.id = p.department_id where ${condition}
       order by p.created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    ),
    query(`select count(*)::int as total from profiles p where ${condition}`, params),
  ]);
  return { data: result.rows, total: count.rows[0].total, page: filters.page, pageSize: filters.pageSize };
});

const inviteBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
  departmentId: z.string().uuid().optional(),
});

export const POST = route(
  { roles: ['ADMIN'], body: inviteBody },
  async ({ session, body }) => {
    const { data, error } = await authAdminClient().auth.admin.inviteUserByEmail(body.email, {
      data: { name: body.name },
    });
    if (error) throw error;
    if (!data.user) throw new Error('The invitation service returned no user');
    return withTransaction(session.userId, async (client) => {
      const { rows } = await client.query(
        `update profiles set name = $2, role = $3, department_id = $4
         where id = $1 returning id, name, email, role, status, department_id, created_at, updated_at`,
        [data.user.id, body.name, body.role, body.departmentId ?? null],
      );
      if (!rows[0]) throw notFound('The invited profile has not been created');
      return created({ data: rows[0] });
    });
  },
);
