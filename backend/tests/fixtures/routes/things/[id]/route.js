import { z } from 'zod';
import { created, noContent, route } from '../../../../../lib/http.js';

// Fixture used by server.test.js to prove that dynamic segments and methods are wired up.
export const GET = route({ auth: 'none' }, async ({ params }) => ({ id: params.id }));
export const POST = route({ auth: 'none', body: z.object({ n: z.number() }) }, async ({ params, body }) =>
  created({ id: params.id, n: body.n }),
);
export const DELETE = route({ auth: 'none' }, async () => noContent());
