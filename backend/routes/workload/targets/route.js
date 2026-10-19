import { z } from 'zod';
import { query, withTransaction } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { created, route } from '../../../lib/http.js';

const querySchema = z.object({ campaignId: z.string().uuid().optional() });
const bodySchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  effectiveFrom: z.string().date(),
  emailDailyTarget: z.number().int().min(0),
  seoDailyTarget: z.number().int().min(0),
  leadMagnetDailyTarget: z.number().int().min(0),
  workdaysPerMonth: z.number().int().min(1).max(31).default(25),
});

function scope(profile, alias = 'c', position = 1) {
  if (profile.role === 'ADMIN') return { sql: 'true', params: [] };
  if (profile.role === 'MANAGER' && profile.department_id) {
    return { sql: `${alias}.department_id = $${position}`, params: [profile.department_id] };
  }
  return {
    sql: `exists (select 1 from campaign_assignments ca where ca.campaign_id = ${alias}.id and ca.employee_id = $${position} and ca.active)`,
    params: [profile.id],
  };
}

export const GET = route({ query: querySchema }, async ({ session, query: filters }) => {
  const profile = session.profile;
  const params = [];
  const conditions = ['t.effective_from <= app_today()'];
  if (profile.role !== 'ADMIN') {
    const access = scope(profile, 'c');
    params.push(...access.params);
    conditions.push(`(t.campaign_id is null or ${access.sql})`);
    conditions.push(profile.role === 'MANAGER' ? 't.campaign_id is not null' : 't.campaign_id is not null');
  }
  if (filters.campaignId) {
    params.push(filters.campaignId);
    conditions.push(`t.campaign_id = $${params.length}`);
  }
  const { rows } = await query(
    `select t.id, t.campaign_id, c.name as campaign_name,
            t.email_daily_target, t.seo_daily_target, t.lead_magnet_daily_target,
            t.workdays_per_month, t.effective_from, t.updated_by, t.updated_at
     from campaign_targets t left join campaigns c on c.id = t.campaign_id
     where ${conditions.join(' and ')}
     order by c.name nulls first, t.effective_from desc`,
    params,
  );
  return { data: rows };
});

export const POST = route(
  { roles: ['ADMIN', 'MANAGER'], body: bodySchema },
  async ({ session, body }) => withTransaction(session.userId, async (client) => {
    if (session.profile.role === 'MANAGER' && !body.campaignId) throw notFound();
    if (body.campaignId) {
      const access = scope(session.profile, 'c', 2);
      const campaign = await client.query(
        `select c.id from campaigns c where c.id = $1 and ${access.sql}`,
        [body.campaignId, ...access.params],
      );
      if (!campaign.rowCount) throw notFound();
    }
    const { rows } = await client.query(
      `insert into campaign_targets
        (campaign_id, email_daily_target, seo_daily_target, lead_magnet_daily_target, workdays_per_month, effective_from, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [body.campaignId ?? null, body.emailDailyTarget, body.seoDailyTarget,
        body.leadMagnetDailyTarget, body.workdaysPerMonth, body.effectiveFrom, session.userId],
    );
    return created({ data: rows[0] });
  }),
);
