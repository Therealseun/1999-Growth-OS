import { z } from 'zod';
import { query, withTransaction } from '../../../../lib/db.js';
import { created, route } from '../../../../lib/http.js';

const templateBody = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(50000),
  type: z.string().trim().min(1).max(80),
});

export const GET = route({}, async () => {
  const { rows } = await query(
    `select id, name, subject, body, category as type, created_at, created_by
     from email_templates order by created_at desc`,
  );
  return { data: rows };
});

export const POST = route(
  { roles: ['ADMIN', 'MANAGER'], body: templateBody },
  async ({ session, body }) => withTransaction(session.userId, async (client) => {
    const { rows } = await client.query(
      `insert into email_templates (name, subject, body, category, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, name, subject, body, category as type, created_at, created_by`,
      [body.name, body.subject, body.body, body.type, session.userId],
    );
    return created({ data: rows[0] });
  }),
);
