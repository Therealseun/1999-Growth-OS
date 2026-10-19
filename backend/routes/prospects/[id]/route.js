import { z } from 'zod';
import { query, withTransaction } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { noContent, route } from '../../../lib/http.js';

const idSchema = z.string().uuid();
const patchSchema = z.object({
  organisation: z.string().trim().min(1).max(500).optional(),
  contactName: z.string().trim().max(300).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  website: z.string().trim().url().max(2048).nullable().optional(),
  industry: z.string().trim().max(300).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  qualificationStatus: z.enum(['QUALIFIED', 'REJECTED', 'NEEDS_REVIEW']).optional(),
  qualificationReason: z.string().max(3000).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0);

function scope(profile) {
  if (profile.role === 'ADMIN') return { condition: 'true', params: [] };
  if (profile.role === 'MANAGER' && profile.department_id) {
    return { condition: 'exists (select 1 from campaigns c where c.id = prospects.campaign_id and c.department_id = $2)', params: [profile.department_id] };
  }
  return { condition: 'false', params: [] };
}

export const PATCH = route(
  { roles: ['ADMIN', 'MANAGER'], body: patchSchema },
  async ({ session, params, body }) => {
    const id = idSchema.parse(params.id);
    const scoped = scope(session.profile);
    return withTransaction(session.userId, async (client) => {
      const fields = {
        organisation: 'organisation',
        contactName: 'contact_name',
        email: 'email',
        website: 'website',
        industry: 'industry',
        location: 'location',
        qualificationStatus: 'qualification_status',
        qualificationReason: 'qualification_reason',
      };
      const values = [id, ...scoped.params];
      const sets = [];
      for (const [key, column] of Object.entries(fields)) {
        if (body[key] !== undefined) {
          values.push(body[key]);
          sets.push(`${column} = $${values.length}`);
        }
      }
      const { rows } = await client.query(
        `update prospects set ${sets.join(', ')} where id = $1 and ${scoped.condition} returning *`,
        values,
      );
      if (!rows[0]) throw notFound();
      return { data: rows[0] };
    });
  },
);

export const GET = route({ roles: ['ADMIN', 'MANAGER'] }, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  const scoped = scope(session.profile);
  const { rows } = await query(
    `select p.* from prospects p where p.id = $1 and ${scoped.condition}`,
    [id, ...scoped.params],
  );
  if (!rows[0]) throw notFound();
  return { data: rows[0] };
});

export const DELETE = route({ roles: ['ADMIN', 'MANAGER'] }, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  const scoped = scope(session.profile);
  return withTransaction(session.userId, async (client) => {
    const { rowCount } = await client.query(
      `delete from prospects where id = $1 and ${scoped.condition}`,
      [id, ...scoped.params],
    );
    if (!rowCount) throw notFound();
    return noContent();
  });
});
