import { z } from 'zod';
import { query, withTransaction } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';
import { assertCanSeeEmployee } from '../../../lib/guard.js';

const patchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'DISABLED']).optional(),
}).refine((data) => Object.keys(data).length > 0);
const idSchema = z.string().uuid();

export const GET = route({}, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  const { rows } = await query(
    `select p.id, p.name, p.email, p.role, p.status, p.department_id, d.name as department_name,
            p.created_at, p.updated_at
     from profiles p left join departments d on d.id = p.department_id where p.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound();
  assertCanSeeEmployee(session.profile, rows[0]);
  return { data: rows[0] };
});

export const PATCH = route({ roles: ['ADMIN'], body: patchBody }, async ({ session, params, body }) => {
  const id = idSchema.parse(params.id);
  return withTransaction(session.userId, async (client) => {
    const current = await client.query('select id from profiles where id = $1', [id]);
    if (!current.rowCount) throw notFound();
    const fields = { name: 'name', role: 'role', departmentId: 'department_id', status: 'status' };
    const values = [id];
    const sets = [];
    for (const [key, column] of Object.entries(fields)) {
      if (body[key] !== undefined) {
        values.push(body[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    const { rows } = await client.query(
      `update profiles set ${sets.join(', ')} where id = $1
       returning id, name, email, role, status, department_id, created_at, updated_at`,
      values,
    );
    return { data: rows[0] };
  });
});

export const DELETE = route({ roles: ['ADMIN'] }, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  return withTransaction(session.userId, async (client) => {
    const { rows } = await client.query(
      `update profiles set status = 'DISABLED'
       where id = $1 and status <> 'DISABLED'
       returning id, name, email, role, status, department_id, created_at, updated_at`,
      [id],
    );
    if (!rows[0]) throw notFound();
    return { data: { deactivated: true, profile: rows[0] } };
  });
});
