import { z } from 'zod';
import { query, withTransaction } from '../../../../lib/db.js';
import { notFound } from '../../../../lib/errors.js';
import { route } from '../../../../lib/http.js';

const idSchema = z.string().uuid();
const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(5000).optional(),
  content: z.string().max(100000).nullable().optional(),
  status: z.enum(['DRAFT', 'READY', 'ARCHIVED']).optional(),
}).refine((value) => Object.keys(value).length > 0);

function allowed(profile, row) {
  return profile.role === 'ADMIN' ||
    (profile.role === 'MANAGER' && profile.department_id === row.department_id) ||
    (profile.role === 'EMPLOYEE' && profile.id === row.created_by);
}

export const GET = route({}, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  const { rows } = await query(
    `select m.id, m.name, m.content_type as type, m.description, m.content, m.status,
            m.campaign_id, m.created_at, m.created_by, c.department_id
     from lead_magnet_content m left join campaigns c on c.id = m.campaign_id where m.id = $1`,
    [id],
  );
  if (!rows[0] || !allowed(session.profile, rows[0])) throw notFound();
  return { data: rows[0] };
});

export const PATCH = route({ body: patchSchema }, async ({ session, params, body }) => {
  const id = idSchema.parse(params.id);
  return withTransaction(session.userId, async (client) => {
    const current = await client.query(
      `select m.created_by, c.department_id from lead_magnet_content m
       left join campaigns c on c.id = m.campaign_id where m.id = $1`,
      [id],
    );
    if (!current.rows[0] || !allowed(session.profile, current.rows[0])) throw notFound();
    if (session.profile.role === 'EMPLOYEE' && current.rows[0].created_by !== session.userId) throw notFound();
    const columns = { name: 'name', type: 'content_type', description: 'description', content: 'content', status: 'status' };
    const values = [id];
    const sets = [];
    for (const [key, column] of Object.entries(columns)) {
      if (body[key] !== undefined) {
        values.push(body[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    const { rows } = await client.query(
      `update lead_magnet_content set ${sets.join(', ')} where id = $1
       returning id, name, content_type as type, description, content, status, campaign_id, created_at, created_by`,
      values,
    );
    return { data: rows[0] };
  });
});
