import { z } from 'zod';
import { query } from '../../../../../lib/db.js';
import { notFound } from '../../../../../lib/errors.js';
import { route } from '../../../../../lib/http.js';

export const GET = route({}, async ({ session, params }) => {
  const id = z.string().uuid().parse(params.id);
  const { rows } = await query(
    `select d.id, d.subject, d.body, d.campaign_id, d.prospect_ids, d.status, d.sent_at, d.created_at, d.created_by,
            c.department_id
     from email_drafts d left join campaigns c on c.id = d.campaign_id where d.id = $1`,
    [id],
  );
  const draft = rows[0];
  if (!draft) throw notFound();
  const profile = session.profile;
  if (profile.role === 'ADMIN') return { data: draft };
  if (profile.role === 'MANAGER' && profile.department_id === draft.department_id) {
    return { data: draft };
  }
  if (profile.role === 'EMPLOYEE' && draft.created_by === profile.id) {
    return { data: draft };
  }
  throw notFound();
});
