import { z } from 'zod';
import { query, withTransaction } from '../../../lib/db.js';
import { invalid, notFound } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';

const idSchema = z.string().uuid();
const bodySchema = z.object({ status: z.enum(['READY', 'REVIEWED']) });
const specs = {
  EMAIL: { table: 'email_tasks', enumType: 'email_task_status' },
  SEO: { table: 'seo_tasks', enumType: 'seo_task_status' },
  LEAD_MAGNET: { table: 'lead_magnet_tasks', enumType: 'lead_task_status' },
};

function canAccess(profile, task) {
  if (profile.role === 'ADMIN') return true;
  if (profile.role === 'MANAGER') return profile.department_id != null && profile.department_id === task.department_id;
  return profile.id === task.employee_id;
}

export const GET = route({}, async ({ session, params }) => {
  const id = idSchema.parse(params.id);
  const { rows } = await query(
    `select t.id, t.type, t.campaign_id, t.employee_id, t.title, t.description,
            t.source_status, t.created_at, t.completed_at, t.department_id, t.assigned_to_name
     from (
       select e.id, 'EMAIL'::text as type, e.campaign_id, e.employee_id, e.subject as title, e.body as description,
              e.status::text as source_status, e.created_at, e.sent_at as completed_at, c.department_id, p.name as assigned_to_name
       from email_tasks e join campaigns c on c.id = e.campaign_id left join profiles p on p.id = e.employee_id
       union all
       select s.id, 'SEO', s.campaign_id, s.employee_id, s.title, s.article,
              s.status::text, s.created_at, s.published_at, c.department_id, p.name
       from seo_tasks s join campaigns c on c.id = s.campaign_id left join profiles p on p.id = s.employee_id
       union all
       select l.id, 'LEAD_MAGNET', l.campaign_id, l.employee_id, l.platform, l.comment,
              l.status::text, l.created_at, l.posted_at, c.department_id, p.name
       from lead_magnet_tasks l join campaigns c on c.id = l.campaign_id left join profiles p on p.id = l.employee_id
     ) t where t.id = $1`,
    [id],
  );
  const task = rows[0];
  if (!task || !canAccess(session.profile, task)) throw notFound();
  return { data: {
    id: task.id, type: task.type, title: task.title, description: task.description,
    status: task.source_status, assigned_to: task.employee_id, assigned_to_name: task.assigned_to_name,
    campaign_id: task.campaign_id, due_date: null, completed_at: task.completed_at,
    created_at: task.created_at, assigned_by: null, assigned_by_name: null, priority: null,
  } };
});

export const PATCH = route({ roles: ['ADMIN', 'MANAGER'], body: bodySchema }, async ({ session, params, body }) => {
  const id = idSchema.parse(params.id);
  return withTransaction(session.userId, async (client) => {
    const { rows } = await client.query(
      `select t.type, t.employee_id, t.department_id, t.source_status from (
        select e.id, 'EMAIL'::text as type, e.employee_id, c.department_id, e.status::text as source_status
        from email_tasks e join campaigns c on c.id = e.campaign_id
        union all
        select s.id, 'SEO', s.employee_id, c.department_id, s.status::text
        from seo_tasks s join campaigns c on c.id = s.campaign_id
        union all
        select l.id, 'LEAD_MAGNET', l.employee_id, c.department_id, l.status::text
        from lead_magnet_tasks l join campaigns c on c.id = l.campaign_id
      ) t where t.id = $1`,
      [id],
    );
    const task = rows[0];
    if (!task || !canAccess(session.profile, task)) throw notFound();
    if (task.source_status !== 'READY' && task.source_status !== 'REVIEWED') {
      throw invalid('Terminal task outcomes are recorded by the execution integration', undefined, 'TASK_OUTCOME_INTEGRATION_ONLY');
    }
    const status = body.status;
    const spec = specs[task.type];
    const updated = await client.query(
      `update ${spec.table} set status = $2::${spec.enumType}, reviewed_at = case when $2 = 'REVIEWED' then now() else null end
       where id = $1 returning id, status`,
      [id, status],
    );
    return { data: { id: updated.rows[0].id, status: updated.rows[0].status } };
  });
});
