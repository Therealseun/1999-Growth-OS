import { z } from 'zod';
import { query } from '../../../lib/db.js';
import { notFound } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';

export const GET = route({}, async ({ session, params }) => {
  const id = z.string().uuid().parse(params.id);
  const { rows } = await query(
    `select id, report_type as type, campaign_id, date_from, date_to, format, created_by, created_at
     from report_definitions where id = $1`,
    [id],
  );
  const report = rows[0];
  if (!report || (session.profile.role !== 'ADMIN' && report.created_by !== session.userId)) throw notFound();
  return { data: { ...report, status: 'READY' } };
});
