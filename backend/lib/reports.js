import { z } from 'zod';
import { addDays, appToday } from './appdate.js';
import { csvResponse, toCsv } from './csv.js';
import { query } from './db.js';
import { invalid } from './errors.js';
import { dateString } from './validators.js';

// Reports read the v_daily_report view, which takes its targets from each day's immutable snapshot.
// Changing a target later never rewrites history.

export const rangeQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export const todayQuery = z.object({ format: z.enum(['json', 'csv']).default('json') });

const COLUMNS = [
  'work_date', 'campaign_id', 'campaign_name', 'employee_id', 'employee_name',
  'email_target', 'seo_target', 'lead_magnet_target', 'total_target',
  'email_completed', 'seo_completed', 'lead_magnet_completed', 'total_completed',
  'remaining', 'completion_pct',
];

const MAX_DAYS = 366;

// Defaults to the last 7 days ending today.
export async function resolveRange(f) {
  const to = f.to ?? (await appToday({ query }));
  const from = f.from ?? (await addDays({ query }, to, -6));
  if (from > to) throw invalid('from must not be after to', { fields: [{ path: 'from', message: 'After to' }] });
  const span = (await query('select ($1::date - $2::date) as d', [to, from])).rows[0].d;
  if (span >= MAX_DAYS) throw invalid(`A report covers at most ${MAX_DAYS} days`, { fields: [{ path: 'from', message: 'Range too long' }] });
  return { from, to };
}

// filters: extra SQL conditions on r (the view), c (campaigns) and p (profiles), with their values.
export async function runReport({ conditions, values }) {
  const { rows } = await query(
    `select r.work_date::text as work_date, r.campaign_id, c.name as campaign_name, r.employee_id, p.name as employee_name,
            r.email_target_snapshot as email_target, r.seo_target_snapshot as seo_target,
            r.lead_magnet_target_snapshot as lead_magnet_target, r.total_target_snapshot as total_target,
            r.email_completed::int as email_completed, r.seo_completed::int as seo_completed,
            r.lead_magnet_completed::int as lead_magnet_completed, r.total_completed::int as total_completed,
            (r.total_target_snapshot - (least(r.email_completed, r.email_target_snapshot)
                                      + least(r.seo_completed, r.seo_target_snapshot)
                                      + least(r.lead_magnet_completed, r.lead_magnet_target_snapshot)))::int as remaining,
            coalesce(r.completion_pct, 0)::float8 as completion_pct
       from v_daily_report r
       join campaigns c on c.id = r.campaign_id
       join profiles p on p.id = r.employee_id
      where ${conditions.join(' and ')}
      order by r.work_date desc, p.name, c.name, r.employee_id`,
    values,
  );
  return rows;
}

export function totals(rows) {
  const total_target = rows.reduce((n, r) => n + r.total_target, 0);
  const total_completed = rows.reduce((n, r) => n + r.total_completed, 0);
  const capped = rows.reduce(
    (n, r) =>
      n + Math.min(r.email_completed, r.email_target) + Math.min(r.seo_completed, r.seo_target) +
      Math.min(r.lead_magnet_completed, r.lead_magnet_target),
    0,
  );
  return {
    total_target,
    total_completed,
    // Capped per workstream, like each row's completion_pct
    completion_pct: total_target === 0 ? 0 : Math.round((1000 * capped) / total_target) / 10,
  };
}

export function reportResponse(rows, format, filename) {
  if (format === 'csv') return csvResponse(toCsv(COLUMNS, rows), `${filename}.csv`);
  return { items: rows, totals: totals(rows) };
}
