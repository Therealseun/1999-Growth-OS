import { z } from 'zod';
import { query, withTransaction } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { noContent, route } from '../../../lib/http.js';

const idSchema = z.string().uuid();
const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  niche: z.string().trim().min(1).max(300).optional(),
  offer: z.string().trim().min(1).max(500).optional(),
  location: z.string().trim().min(1).max(300).optional(),
  objective: z.string().trim().min(1).max(1000).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
}).refine((data) => Object.keys(data).length > 0);

function scope(profile) {
  if (profile.role === 'ADMIN') return { condition: 'true', params: [] };
  if (profile.role === 'MANAGER' && profile.department_id) {
    return { condition: 'department_id = $2', params: [profile.department_id] };
  }
  return {
    condition: `exists (select 1 from campaign_assignments ca where ca.campaign_id = campaigns.id and ca.employee_id = $2 and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({}, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  const { condition, params: scopeParams } = scope(session.profile);
  const { rows } = await query(
    `select c.*, d.name as department_name,
       (select count(*)::int from prospects p where p.campaign_id = c.id) as prospect_count,
       ((select count(*) from email_tasks e where e.campaign_id = c.id) +
        (select count(*) from seo_tasks s where s.campaign_id = c.id) +
        (select count(*) from lead_magnet_tasks l where l.campaign_id = c.id))::int as task_count
     from campaigns c join departments d on d.id = c.department_id
     where c.id = $1 and ${condition}`,
    [id, ...scopeParams],
  );
  if (!rows[0]) throw notFound();
  return { data: rows[0] };
});

export const PATCH = route(
  { roles: ['ADMIN', 'MANAGER'], body: patchSchema },
  async ({ session, params, body }) => {
    const id = idSchema.parse(params.id);
    const { condition, params: scopeParams } = scope(session.profile);
    return withTransaction(session.userId, async (client) => {
      const columns = {
        name: 'name',
        niche: 'niche',
        offer: 'offer',
        location: 'location',
        objective: 'objective',
        status: 'status',
      };
      const values = [id, ...scopeParams];
      const sets = [];
      for (const [key, column] of Object.entries(columns)) {
        if (body[key] !== undefined) {
          values.push(body[key]);
          sets.push(`${column} = $${values.length}`);
        }
      }
      const { rows } = await client.query(
        `update campaigns set ${sets.join(', ')}
         where id = $1 and ${condition} returning *`,
        values,
      );
      if (!rows[0]) throw notFound();
      return { data: rows[0] };
    });
  },
);

export const DELETE = route({ roles: ['ADMIN'] }, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  return withTransaction(session.userId, async (client) => {
    const { rowCount } = await client.query('delete from campaigns where id = $1', [id]);
    if (!rowCount) throw notFound();
    return noContent();
  });
});
