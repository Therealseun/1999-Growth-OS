import { z } from 'zod';
import { query, withTransaction } from '../../../../lib/db.js';
import { invalid, notFound } from '../../../../lib/errors.js';
import { created, route } from '../../../../lib/http.js';

const idSchema = z.string().uuid();
const bodySchema = z.object({
  evidenceType: z.enum(['URL', 'TEXT', 'FILE']),
  evidenceValue: z.string().trim().max(10000).optional(),
  storagePath: z.string().trim().max(1000).optional(),
}).refine((value) => Boolean(value.evidenceValue || value.storagePath), {
  message: 'Evidence text, URL, or a storage path is required',
});
const taskTables = {
  EMAIL: { table: 'email_tasks', column: 'email_task_id' },
  SEO: { table: 'seo_tasks', column: 'seo_task_id' },
  LEAD_MAGNET: { table: 'lead_magnet_tasks', column: 'lead_task_id' },
};

function canAccess(profile, task) {
  if (profile.role === 'ADMIN') return true;
  if (profile.role === 'MANAGER') return profile.department_id != null && profile.department_id === task.department_id;
  return profile.id === task.employee_id;
}

async function getTask(taskId) {
  const { rows } = await query(
    `select t.id, t.type, t.employee_id, t.department_id from (
      select e.id, 'EMAIL'::text as type, e.employee_id, c.department_id
      from email_tasks e join campaigns c on c.id = e.campaign_id
      union all
      select s.id, 'SEO', s.employee_id, c.department_id
      from seo_tasks s join campaigns c on c.id = s.campaign_id
      union all
      select l.id, 'LEAD_MAGNET', l.employee_id, c.department_id
      from lead_magnet_tasks l join campaigns c on c.id = l.campaign_id
    ) t where t.id = $1`,
    [taskId],
  );
  return rows[0];
}

export const GET = route({}, async ({ session, params }) => {
  const taskId = idSchema.parse(params.id);
  const task = await getTask(taskId);
  if (!task || !canAccess(session.profile, task)) throw notFound();
  const spec = taskTables[task.type];
  const { rows } = await query(
    `select id, workstream, ${spec.column} as task_id, evidence_type, evidence_value, storage_path, employee_id as submitted_by, created_at as submitted_at
     from execution_evidence where ${spec.column} = $1 order by created_at desc`,
    [taskId],
  );
  return { data: rows };
});

export const POST = route({ body: bodySchema }, async ({ session, params, body }) => {
  const taskId = idSchema.parse(params.id);
  return withTransaction(session.userId, async (client) => {
    const task = await getTask(taskId);
    if (!task || !canAccess(session.profile, task)) throw notFound();
    if (session.profile.role === 'EMPLOYEE' && task.employee_id !== session.userId) throw notFound();
    if (!body.evidenceValue && !body.storagePath) throw invalid('An evidence value is required');
    const spec = taskTables[task.type];
    const { rows } = await client.query(
      `insert into execution_evidence (workstream, ${spec.column}, employee_id, evidence_type, evidence_value, storage_path)
       values ($1::workstream, $2, $3, $4::evidence_type, $5, $6)
       returning id, workstream, ${spec.column} as task_id, evidence_type, evidence_value, storage_path, employee_id as submitted_by, created_at as submitted_at`,
      [task.type, taskId, session.userId, body.evidenceType, body.evidenceValue ?? null, body.storagePath ?? null],
    );
    return created({ data: rows[0] });
  });
});
