import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export const GET = route({}, async ({ session, params }) => {
  const id = z.string().uuid().parse(params.id);
  const profile = session.profile;
  const conditions = ['c.id = $1'];
  const values = [id];
  if (profile.role === 'MANAGER') {
    if (!profile.department_id) throw notFound();
    values.push(profile.department_id);
    conditions.push(`c.department_id = $${values.length}`);
  } else if (profile.role === 'EMPLOYEE') {
    values.push(profile.id);
    conditions.push(`exists (select 1 from campaign_assignments ca where ca.campaign_id = c.id and ca.employee_id = $${values.length} and ca.active)`);
  }
  const { rows } = await query(
    `select c.niche, np.profile
     from campaigns c
     left join lateral (
       select profile from niche_profiles where campaign_id = c.id and status = 'APPROVED'
       order by version desc limit 1
     ) np on true
     where ${conditions.join(' and ')}`,
    values,
  );
  if (!rows[0]) throw notFound();
  const intelligence = rows[0].profile ?? {};
  return {
    data: {
      niche: rows[0].niche,
      insights: array(intelligence.insights),
      opportunities: array(intelligence.opportunities),
      risks: array(intelligence.risks),
      competitors: array(intelligence.competitors),
    },
  };
});
