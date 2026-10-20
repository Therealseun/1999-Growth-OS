import { query } from './db.js';
import { notFound } from './errors.js';
import { assertCanSeeEmployee } from './guard.js';
import { idParam } from './validators.js';

// Loads a campaign the caller may see. Admin sees all. Manager and Employee see their own department's.
// Anything else answers 404 so the API does not reveal that the record exists.
export async function loadCampaign(db, profile, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(`select * from campaigns where id = $1 ${forUpdate ? 'for update' : ''}`, [id]);
  const campaign = rows[0];
  if (!campaign) throw notFound();
  if (profile.role === 'ADMIN') return campaign;
  if (profile.department_id && campaign.department_id === profile.department_id) return campaign;
  throw notFound();
}

export const campaignIdFrom = (params) => idParam(params, 'id');

// Checks the caller may see an employee's data. Returns { id, department_id }.
export async function assertEmployeeVisible(profile, employeeId) {
  idParam({ id: employeeId });
  const { rows } = await query('select id, department_id from profiles where id = $1', [employeeId]);
  if (!rows[0]) throw notFound();
  assertCanSeeEmployee(profile, rows[0]);
  return rows[0];
}

// SQL condition limiting task-like rows to what the caller may see. addParam pushes a value and returns its $n.
export function taskScope(profile, alias, addParam) {
  if (profile.role === 'ADMIN') return 'true';
  if (profile.role === 'MANAGER') {
    return `${alias}.campaign_id in (select id from campaigns where department_id = ${addParam(profile.department_id)}::uuid)`;
  }
  return `${alias}.employee_id = ${addParam(profile.id)}::uuid`;
}
