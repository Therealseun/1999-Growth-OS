import { z } from 'zod';
import { query } from '../../../../lib/db.js';
import { notFound } from '../../../../lib/errors.js';
import { route } from '../../../../lib/http.js';

function csvCell(value) {
  const text = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(columns, rows) {
  return [columns.map(([, name]) => csvCell(name)).join(','), ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(','))].join('\r\n');
}

export const GET = route({}, async ({ session, params }) => {
  const id = z.string().uuid().parse(params.id);
  const { rows: definitions } = await query(
    `select id, report_type, campaign_id, date_from, date_to, format, created_by
     from report_definitions where id = $1`,
    [id],
  );
  const report = definitions[0];
  if (!report || (session.profile.role !== 'ADMIN' && report.created_by !== session.userId)) throw notFound();

  const values = [];
  const conditions = [];
  const bind = (value, expression) => {
    values.push(value);
    conditions.push(expression.replace('?', `$${values.length}`));
  };
  const dateColumn = report.report_type === 'PERFORMANCE' ? 'x.work_date' : 'x.created_at';
  if (report.campaign_id) bind(report.campaign_id, 'x.campaign_id = ?');
  if (report.date_from) bind(report.date_from, `${dateColumn} >= ?::date`);
  if (report.date_to) bind(report.date_to, `${dateColumn} < ?::date + interval '1 day'`);
  if (session.profile.role === 'MANAGER') {
    if (!session.profile.department_id) throw notFound();
    bind(session.profile.department_id, 'c.department_id = ?');
  }
  if (session.profile.role === 'EMPLOYEE') {
    if (report.report_type === 'PIPELINE') throw notFound();
    bind(session.userId, 'x.employee_id = ?');
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  let columns;
  let data;

  if (report.report_type === 'PIPELINE') {
    if (session.profile.role === 'EMPLOYEE') throw notFound();
    const result = await query(
      `select x.id, x.campaign_id, x.sift_id, x.organisation, x.contact_name, x.email, x.website, x.industry,
              x.location, x.qualification_status, x.qualification_reason, x.created_at
       from prospects x join campaigns c on c.id = x.campaign_id
       ${where} order by x.created_at desc`,
      values,
    );
    columns = [
      ['id', 'id'], ['campaign_id', 'campaign_id'], ['sift_id', 'sift_id'],
      ['organisation', 'organisation'], ['contact_name', 'contact_name'], ['email', 'email'],
      ['website', 'website'], ['industry', 'industry'], ['location', 'location'],
      ['qualification_status', 'qualification_status'], ['qualification_reason', 'qualification_reason'],
      ['created_at', 'created_at'],
    ];
    data = result.rows;
  } else if (report.report_type === 'TASK_AUDIT') {
    const result = await query(
      `select x.id, x.workstream, x.status_class, x.employee_id, x.campaign_id, x.created_at, x.completed_at
       from v_task_ledger x join campaigns c on c.id = x.campaign_id ${where}
       order by x.created_at desc`,
      values,
    );
    columns = [
      ['id', 'id'], ['workstream', 'workstream'], ['status_class', 'status'],
      ['employee_id', 'employee_id'], ['campaign_id', 'campaign_id'],
      ['created_at', 'created_at'], ['completed_at', 'completed_at'],
    ];
    data = result.rows;
  } else {
    const result = await query(
      `select x.workload_id as id, x.employee_id, x.campaign_id, x.work_date as created_at,
              x.email_target_snapshot, x.seo_target_snapshot, x.lead_magnet_target_snapshot,
              x.email_completed, x.seo_completed, x.lead_magnet_completed,
              x.total_completed, x.completion_pct
       from v_daily_report x join campaigns c on c.id = x.campaign_id ${where}
       order by x.work_date desc`,
      values,
    );
    columns = [
      ['id', 'workload_id'], ['employee_id', 'employee_id'], ['campaign_id', 'campaign_id'],
      ['created_at', 'work_date'], ['email_target_snapshot', 'email_target'],
      ['seo_target_snapshot', 'seo_target'], ['lead_magnet_target_snapshot', 'lead_magnet_target'],
      ['email_completed', 'email_completed'], ['seo_completed', 'seo_completed'],
      ['lead_magnet_completed', 'lead_magnet_completed'], ['total_completed', 'total_completed'],
      ['completion_pct', 'completion_pct'],
    ];
    data = result.rows;
  }

  const body = report.format === 'JSON' ? JSON.stringify(data, null, 2) : toCsv(columns, data);
  const contentType = report.format === 'JSON' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="growthos-${report.report_type.toLowerCase()}-${id}.${report.format.toLowerCase() === 'json' ? 'json' : 'csv'}"`,
    },
  });
});
