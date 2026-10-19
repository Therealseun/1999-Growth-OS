import { z } from 'zod';
import { query } from '../../../../lib/db.js';
import { notFound } from '../../../../lib/errors.js';
import { route } from '../../../../lib/http.js';
import { assertCanSeeEmployee } from '../../../../lib/guard.js';

const filters = z.object({
  period: z.enum(['TODAY', 'THIS_WEEK', 'THIS_MONTH']).optional(),
});
const dayOffsets = { TODAY: 1, THIS_WEEK: 7, THIS_MONTH: 30 };

export const GET = route({ query: filters }, async ({ session, params, query: filters }) => {
  const id = z.string().uuid().parse(params.id);
  const profileResult = await query(
    'select id, department_id from profiles where id = $1',
    [id],
  );
  const target = profileResult.rows[0];
  if (!target) throw notFound();
  assertCanSeeEmployee(session.profile, target);
  const periods = filters.period ? [filters.period] : Object.keys(dayOffsets);
  const results = await Promise.all(periods.map(async (period) => {
    const days = dayOffsets[period];
    const { rows } = await query(
      `select count(*) filter (where status_class = 'COMPLETED')::int as completed,
              count(*)::int as total,
              count(*) filter (where status_class = 'COMPLETED' and completed_at is not null)::int as timed_count,
              coalesce(avg(extract(epoch from (completed_at - created_at)) / 3600)
                filter (where status_class = 'COMPLETED' and completed_at is not null), 0)::float as average_hours
       from v_task_ledger
       where employee_id = $1 and created_at >= now() - ($2::int * interval '1 day')`,
      [id, days],
    );
    const evidence = await query(
      `select count(*)::int as total from execution_evidence
       where employee_id = $1 and created_at >= now() - ($2::int * interval '1 day')`,
      [id, days],
    );
    const stats = rows[0];
    return {
      period,
      tasksCompleted: stats.completed,
      tasksTotal: stats.total,
      completionRate: stats.total ? Math.round((stats.completed / stats.total) * 1000) / 10 : 0,
      averageTimeToComplete: Math.round(Number(stats.average_hours) * 10) / 10,
      evidenceSubmitted: evidence.rows[0].total,
      rating: null,
    };
  }));
  return { data: results };
});
