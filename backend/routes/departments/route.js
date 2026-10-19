import { query, withTransaction } from '../../lib/db.js';
import { created, route } from '../../lib/http.js';
import { z } from 'zod';

export const GET = route({ roles: ['ADMIN', 'MANAGER'] }, async ({ session }) => {
  if (session.profile.role === 'MANAGER') {
    if (!session.profile.department_id) return { data: [] };
    const { rows } = await query(
      'select id, name from departments where id = $1 order by name',
      [session.profile.department_id],
    );
    return { data: rows };
  }
  const { rows } = await query('select id, name from departments order by name');
  return { data: rows };
});

export const POST = route(
  { roles: ['ADMIN'], body: z.object({ name: z.string().trim().min(1).max(120) }) },
  async ({ session, body }) => withTransaction(session.userId, async (client) => {
    const { rows } = await client.query(
      'insert into departments (name) values ($1) returning id, name, created_at',
      [body.name],
    );
    return created({ data: rows[0] });
  }),
);
