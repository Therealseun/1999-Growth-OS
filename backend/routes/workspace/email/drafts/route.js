import { z } from 'zod';
import { query, withTransaction } from '../../../../lib/db.js';
import { invalid, notFound } from '../../../../lib/errors.js';
import { created, route } from '../../../../lib/http.js';

const draftBody = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(50000),
  campaignId: z.string().uuid().optional(),
  prospectIds: z.array(z.string().uuid()).max(500).default([]),
});

function condition(profile, alias = 'c', position = 1) {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (profile.role === 'MANAGER') {
    if (!profile.department_id) return { sql: 'false', params: [] };
    return { sql: `${alias}.department_id = $${position}`, params: [profile.department_id] };
  }
  if (alias === 'c') {
    return {
      sql: `exists (select 1 from campaign_assignments ca where ca.campaign_id = ${alias}.id and ca.employee_id = $${position} and ca.active)`,
      params: [profile.id],
    };
  }
  return { sql: 'd.created_by = $1', params: [profile.id] };
}

export const GET = route({}, async ({ session }) => {
  const { sql, params } = condition(session.profile);
  const { rows } = await query(
    `select d.id, d.subject, d.body, d.campaign_id, d.prospect_ids, d.status, d.sent_at, d.created_at, d.created_by
     from email_drafts d left join campaigns c on c.id = d.campaign_id
     where ${sql} order by d.created_at desc`,
    params,
  );
  return { data: rows };
});

export const POST = route({ body: draftBody }, async ({ session, body }) => withTransaction(session.userId, async (client) => {
  if (body.campaignId) {
    const scope = condition(session.profile, 'c', 2);
    const { rows } = await client.query(
      `select c.id from campaigns c where c.id = $1 and ${scope.sql}`,
      [body.campaignId, ...scope.params],
    );
    if (!rows[0]) throw notFound();
    if (body.prospectIds.length) {
      const prospects = await client.query(
        'select count(*)::int as total from prospects where campaign_id = $1 and id = any($2::uuid[])',
        [body.campaignId, body.prospectIds],
      );
      if (prospects.rows[0].total !== body.prospectIds.length) {
        throw invalid('Every selected prospect must belong to this campaign');
      }
    }
  } else if (body.prospectIds.length) {
    throw invalid('A campaign is required when selecting prospects');
  }
  const { rows } = await client.query(
    `insert into email_drafts (subject, body, campaign_id, prospect_ids, created_by)
     values ($1, $2, $3, $4::uuid[], $5)
     returning id, subject, body, campaign_id, prospect_ids, status, sent_at, created_at, created_by`,
    [body.subject, body.body, body.campaignId ?? null, body.prospectIds, session.userId],
  );
  return created({ data: rows[0] });
}));
