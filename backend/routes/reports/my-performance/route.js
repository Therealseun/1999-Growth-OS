import { query } from '../../../lib/db.js';
import { route } from '../../../lib/http.js';

const periods = [
  { name: 'TODAY', interval: 1 },
  { name: 'THIS_WEEK', interval: 7 },
  { name: 'THIS_MONTH', interval: 30 },
];

export const GET = route({}, async ({ session }) => {
  const data = await Promise.all(periods.map(async ({ name, interval }) => {
    const { rows } = await query(
      `select count(*)::int as total,
              count(*) filter (where status_class = 'COMPLETED')::int as completed,
              coalesce(avg(extract(epoch from (completed_at - created_at)) / 3600)
                filter (where status_class = 'COMPLETED' and completed_at is not null), 0)::float as average_hours
       from v_task_ledger
       where employee_id = $1 and created_at >= app_today() - ($2::int - 1)`,
      [session.userId, interval],
    );
    const evidence = await query(
      `select count(*)::int as total from execution_evidence
       where employee_id = $1 and created_at >= app_today() - ($2::int - 1)`,
      [session.userId, interval],
    );
    const stats = rows[0];
    return {
      period: name,
      tasksCompleted: stats.completed,
      tasksTotal: stats.total,
      completionRate: stats.total ? Math.round((stats.completed / stats.total) * 1000) / 10 : 0,
      averageTimeToComplete: Math.round(Number(stats.average_hours) * 10) / 10,
      evidenceSubmitted: evidence.rows[0].total,
      rating: null,
    };
  }));
  return { data, total: data.length, page: 1, pageSize: data.length };
});
