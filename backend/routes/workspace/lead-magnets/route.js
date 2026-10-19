import { z } from 'zod';
import { query, withTransaction } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { created, route } from '../../../lib/http.js';

const filters = z.object({ campaignId: z.string().uuid().optional() });
const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(80),
  description: z.string().max(5000).default(''),
  content: z.string().max(100000).nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
});

function scope(profile, alias = 'c', position = 1) {
  if (profile.role === 'ADMIN') return { condition: 'true', params: [] };
  if (profile.role === 'MANAGER') {
    if (!profile.department_id) return { condition: 'false', params: [] };
    return { condition: `${alias}.department_id = $${position}`, params: [profile.department_id] };
  }
  return {
    condition: `exists (select 1 from campaign_assignments ca where ca.campaign_id = ${alias}.id and ca.employee_id = $${position} and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({ query: filters }, async ({ session, query: filters }) => {
  const access = scope(session.profile);
  const params = [...access.params];
  const conditions = [session.profile.role === 'EMPLOYEE'
    ? `((m.campaign_id is null and m.created_by = $1) or (m.campaign_id is not null and ${access.condition}))`
    : access.condition];
  if (filters.campaignId) {
    params.push(filters.campaignId);
    conditions.push(`m.campaign_id = $${params.length}`);
  }
  const { rows } = await query(
    `select m.id, m.name, m.content_type as type, m.description, m.content, m.status,
            m.campaign_id, m.created_at, m.created_by
     from lead_magnet_content m left join campaigns c on c.id = m.campaign_id
     where ${conditions.join(' and ')} order by m.created_at desc`,
    params,
  );
  return { data: rows };
});

export const POST = route({ body: bodySchema }, async ({ session, body }) => withTransaction(session.userId, async (client) => {
  if (body.campaignId) {
    const access = scope(session.profile, 'c', 2);
    const campaign = await client.query(
      `select c.id from campaigns c where c.id = $1 and ${access.condition}`,
      [body.campaignId, ...access.params],
    );
    if (!campaign.rowCount) throw notFound();
  }
  const { rows } = await client.query(
    `insert into lead_magnet_content (campaign_id, name, content_type, description, content, created_by)
     values ($1, $2, $3, $4, $5, $6)
     returning id, name, content_type as type, description, content, status, campaign_id, created_at, created_by`,
    [body.campaignId ?? null, body.name, body.type, body.description, body.content ?? null, session.userId],
  );
  return created({ data: rows[0] });
}));
