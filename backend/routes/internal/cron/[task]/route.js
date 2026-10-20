import { query, withTransaction } from '../../../../lib/db.js';
import { notFound } from '../../../../lib/errors.js';
import { route } from '../../../../lib/http.js';
import { generateWorkloads, topUp } from '../../../../lib/pipeline.js';

// Called by the scheduler with Authorization: Bearer <CRON_SECRET>. Every task is safe to run twice.
const TASKS = {
  // Nightly at 00:30 Lagos: expire, snapshot today's targets, assign from the pool, request the shortfall.
  'generate-workloads': () => generateWorkloads(),
  // Hourly, and after deliveries: assign newly delivered work, request what is still missing.
  backfill: () => topUp(),
  // Runs the same top-up. A separate name so the scheduler can use its own frequency.
  pipeline: () => topUp(),
  expire: async () => ({ expired: (await query('select expire_stale_tasks() as n')).rows[0].n }),
  // purge_old_content sets a transaction-local flag, so it must run inside a transaction.
  purge: async () => ({ purged: (await withTransaction(null, (db) => db.query('select purge_old_content() as n'))).rows[0].n }),
};

export const POST = route({ auth: 'cron' }, async ({ params }) => {
  const task = TASKS[params.task];
  if (!task || !Object.hasOwn(TASKS, params.task)) throw notFound('Unknown task');
  return task();
});
