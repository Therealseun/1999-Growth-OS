import { z } from 'zod';
import { accepted, created, route } from '../../../../lib/http.js';

// Fixture for the real HTTP test. Returns responses through created() and accepted().
export const POST = route({ auth: 'none', body: z.object({ n: z.number() }) }, async ({ body }) => created({ n: body.n }));
export const PUT = route({ auth: 'none' }, async () => accepted({ queued: true }));
