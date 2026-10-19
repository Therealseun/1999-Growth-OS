import { route } from '../../../lib/http.js';
import { z } from 'zod';
import { withTransaction } from '../../../lib/db.js';
import { invalid } from '../../../lib/errors.js';

// PENDING and DISABLED accounts never get here: authenticate() answers 403 ACCOUNT_PENDING / ACCOUNT_DISABLED.
export const GET = route({}, async ({ session }) => session.profile);

export const PATCH = route(
  { body: z.object({ name: z.string().trim().min(1).max(120) }) },
  async ({ session, body }) => {
    if (!body.name) throw invalid('Enter a name between 1 and 120 characters');
    return withTransaction(session.userId, async (client) => {
      const { rows } = await client.query(
        'update profiles set name = $2 where id = $1 returning id, name, email, role, status, department_id, created_at, updated_at',
        [session.userId, body.name],
      );
      return rows[0];
    });
  },
);
