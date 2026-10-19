import { z } from 'zod';
import { query, withTransaction } from '../../../../lib/db.js';
import { notFound } from '../../../../lib/errors.js';
import { created, route } from '../../../../lib/http.js';

const filters = z.object({ campaignId: z.string().uuid().optional() });
const bodySchema = z.object({
  campaignId: z.string().uuid(),
  overallScore: z.number().min(0).max(100).nullable().optional(),
  categories: z.record(z.string(), z.unknown()).default({}),
  recommendations: z.array(z.unknown()).default([]),
  errors: z.array(z.unknown()).default([]),
});

function scope(profile, position = 1) {
  if (profile.role === 'ADMIN') return { condition: 'true', params: [] };
  if (profile.role === 'MANAGER' && profile.department_id) {
    return { condition: `c.department_id = $${position}`, params: [profile.department_id] };
  }
  return {
    condition: `exists (select 1 from campaign_assignments ca where ca.campaign_id = c.id and ca.employee_id = $${position} and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({ query: filters }, async ({ session, query: filters }) => {
  const access = scope(session.profile);
  const params = [...access.params];
  const conditions = [access.condition];
  if (filters.campaignId) {
    params.push(filters.campaignId);
    conditions.push(`a.campaign_id = $${params.length}`);
  }
  const { rows } = await query(
    `select a.* from seo_audits a join campaigns c on c.id = a.campaign_id
     where ${conditions.join(' and ')} order by a.created_at desc`,
    params,
  );
  return { data: rows };
});

export const POST = route(
  { roles: ['ADMIN', 'MANAGER'], body: bodySchema },
  async ({ session, body }) => withTransaction(session.userId, async (client) => {
    const access = scope(session.profile, 2);
    const campaign = await client.query(
      `select c.id from campaigns c where c.id = $1 and ${access.condition}`,
      [body.campaignId, ...access.params],
    );
    if (!campaign.rowCount) throw notFound();
    const { rows } = await client.query(
      `insert into seo_audits (campaign_id, overall_score, categories, recommendations, errors, created_by)
       values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6) returning *`,
      [body.campaignId, body.overallScore ?? null, JSON.stringify(body.categories),
        JSON.stringify(body.recommendations), JSON.stringify(body.errors), session.userId],
    );
    return created({ data: rows[0] });
  }),
);
