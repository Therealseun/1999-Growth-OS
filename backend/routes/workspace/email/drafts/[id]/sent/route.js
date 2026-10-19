import { z } from 'zod';
import { withTransaction } from '../../../../../../../lib/db.js';
import { conflict, notFound } from '../../../../../../../lib/errors.js';
import { route } from '../../../../../../../lib/http.js';

export const POST = route(
  { body: z.object({ confirmedSentExternally: z.literal(true) }) },
  async ({ session, params, body }) => {
    const id = z.string().uuid().parse(params.id);
    if (body.confirmedSentExternally !== true) throw notFound();
    return withTransaction(session.userId, async (client) => {
      const { rows } = await client.query(
        `select d.status, d.created_by, c.department_id
         from email_drafts d left join campaigns c on c.id = d.campaign_id where d.id = $1`,
        [id],
      );
      const draft = rows[0];
      const profile = session.profile;
      if (!draft) throw notFound();
      const visible = profile.role === 'ADMIN' ||
        (profile.role === 'MANAGER' && profile.department_id === draft.department_id) ||
        (profile.role === 'EMPLOYEE' && draft.created_by === session.userId);
      if (!visible) throw notFound();
      if (draft.status !== 'DRAFT') throw conflict('This draft has already been marked as sent', 'DRAFT_ALREADY_SENT');
      const updated = await client.query(
        `update email_drafts set status = 'SENT', sent_at = now() where id = $1
         returning id, status, sent_at`,
        [id],
      );
      return { data: { sent: true, sentAt: updated.rows[0].sent_at } };
    });
  },
);
