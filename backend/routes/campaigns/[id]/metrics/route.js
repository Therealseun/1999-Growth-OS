import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';

export const GET = route({}, async ({ session, params }) => {
  const id = z.string().uuid().parse(params.id);
  const profile = session.profile;
  const values = [id];
  let scope = 'true';
  if (profile.role === 'MANAGER') {
    if (!profile.department_id) throw notFound();
    values.push(profile.department_id);
    scope = `c.department_id = $${values.length}`;
  } else if (profile.role === 'EMPLOYEE') {
    values.push(profile.id);
    scope = `exists (select 1 from campaign_assignments ca where ca.campaign_id = c.id and ca.employee_id = $${values.length} and ca.active)`;
  }
  const campaign = await query(
    `select c.id from campaigns c where c.id = $1 and ${scope}`,
    values,
  );
  if (!campaign.rowCount) throw notFound();
  const [prospects, emails, tasks] = await Promise.all([
    query(
      `select count(*)::int as total,
              count(*) filter (where qualification_status = 'QUALIFIED')::int as qualified,
              count(*) filter (where qualification_status = 'REJECTED')::int as rejected,
              count(*) filter (where qualification_status = 'NEEDS_REVIEW')::int as needs_review
       from prospects where campaign_id = $1`,
      [id],
    ),
    query(`select count(*)::int as total from email_tasks where campaign_id = $1 and status = 'SENT'`, [id]),
    query(
      `select count(*)::int as total,
              count(*) filter (where status_class = 'COMPLETED')::int as completed
       from v_task_ledger where campaign_id = $1`,
      [id],
    ),
  ]);
  const p = prospects.rows[0];
  return {
    data: {
      prospectCount: p.total,
      contactedCount: emails.rows[0].total,
      qualifiedCount: p.qualified,
      rejectedCount: p.rejected,
      needsReviewCount: p.needs_review,
      convertedCount: null,
      tasksCompleted: tasks.rows[0].completed,
      tasksTotal: tasks.rows[0].total,
      emailsSent: emails.rows[0].total,
      leadsGenerated: null,
    },
  };
});
